package studio.athr.bokra

import android.accessibilityservice.AccessibilityService
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Social lock: the feeds are gone, the messages stay.
 * Looks at which screen of a social app is showing, by the apps' own view ids (never the text on it),
 * and steps out of feeds, reels, stories and explore. Instagram opens straight on the messages;
 * leaving the messages leaves Instagram. Whole-feed apps (TikTok, Facebook) just close.
 * The rules are guard.json in the web app, so they update with the screens, without a new APK.
 */
class Guard : AccessibilityService() {
    private class Rule(j: JSONObject) {
        val mode = j.optString("mode", "app")
        val say = j.optString("say")
        val allow = list(j, "allow")
        val block = list(j, "block")
        val tabs = list(j, "tabs")
        val tabIcon = j.optString("tabIcon")
        val tabBar = list(j, "tabBar")
        val messages = list(j, "messages")
        val bar = list(j, "bar")
        val hosts = list(j, "hosts")

        companion object {
            fun list(j: JSONObject, k: String): List<String> {
                val a = j.optJSONArray(k) ?: JSONArray()
                return (0 until a.length()).map { a.optString(it) }.filter { it.isNotEmpty() }
            }
        }
    }

    private class Seen {
        val ids = HashSet<String>()
        var tabSelected = false
    }

    companion object {
        private const val MAX_NODES = 600 // the biggest Instagram screen seen has 291
        private const val FRESH_MS = 6000L

        fun enabled(c: Context): Boolean {
            val on = Settings.Secure.getString(c.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
            val me = ComponentName(c, Guard::class.java)
            return on.split(':').any { ComponentName.unflattenFromString(it) == me }
        }

        /**
         * Realme force-stops apps (clearing recents, its battery manager), and Android turns a force-stopped app's
         * accessibility service off with it. With WRITE_SECURE_SETTINGS (granted once from the PC with adb),
         * BOKRA turns the lock back on by itself whenever it runs: opened, a prayer alarm, the widgets.
         */
        fun heal(c: Context): Boolean {
            if (BuildConfig.DEMO) return false
            if (enabled(c)) return true
            if (c.checkSelfPermission("android.permission.WRITE_SECURE_SETTINGS") != PackageManager.PERMISSION_GRANTED) return false
            return try {
                val me = ComponentName(c, Guard::class.java)
                val cr = c.contentResolver
                val others = (Settings.Secure.getString(cr, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: "")
                    .split(':').filter { it.isNotBlank() && ComponentName.unflattenFromString(it) != me }
                Settings.Secure.putString(cr, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES, (others + me.flattenToString()).joinToString(":"))
                Settings.Secure.putInt(cr, Settings.Secure.ACCESSIBILITY_ENABLED, 1)
                true
            } catch (e: Exception) {
                false
            }
        }
    }

    private var rules = emptyMap<String, Rule>()
    private var rulesStamp = -1L
    private val main = Handler(Looper.getMainLooper())
    private var pending = false
    private var fg = ""
    private var fgSince = 0L
    private var redirected = false
    private var quietUntil = 0L // after a step, let the app finish moving before looking again
    private var lastBack = 0L
    private var lastSay = 0L

    override fun onServiceConnected() {
        super.onServiceConnected()
        loadRules()
        Scheduler.scheduleAll(this) // back after a reboot or a force-stop: the prayer alarms too
    }

    override fun onInterrupt() {}

    override fun onAccessibilityEvent(e: AccessibilityEvent?) {
        if (e == null) return
        val pkg = e.packageName?.toString() ?: return
        if (e.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) noteForeground()
        if (!rules.containsKey(pkg) || pending) return
        // content changes come in bursts: look once they settle a little
        pending = true
        main.postDelayed(check, 160)
    }

    private val check = Runnable {
        pending = false
        try { evaluate() } catch (e: Exception) { }
    }

    private fun noteForeground() {
        val p = (try { rootInActiveWindow?.packageName?.toString() } catch (e: Exception) { null }) ?: return
        if (p == fg || p == "com.android.systemui") return
        fg = p
        fgSince = SystemClock.uptimeMillis()
        redirected = false
        loadRules()
        try { Scheduler.ensure(this) } catch (e: Exception) { }
    }

    private fun evaluate() {
        val root = rootInActiveWindow ?: return
        val pkg = root.packageName?.toString() ?: return
        val r = rules[pkg] ?: return
        if (pkg != fg) noteForeground()
        val now = SystemClock.uptimeMillis()
        if (now < quietUntil) {
            // look again once it has settled, even if the screen sends nothing new
            pending = true
            main.postDelayed(check, quietUntil - now + 50)
            return
        }
        when (r.mode) {
            "app" -> { act(GLOBAL_ACTION_HOME); say(r) }
            "url" -> if (urlBlocked(root, pkg, r)) { act(GLOBAL_ACTION_BACK); say(r) }
            else -> screen(root, pkg, r, now)
        }
    }

    private fun screen(root: AccessibilityNodeInfo, pkg: String, r: Rule, now: Long) {
        val s = scan(root, pkg, r)
        if (r.allow.any { it in s.ids }) return // a messages screen: always open
        if (!s.tabSelected && r.block.none { it in s.ids }) return
        if (r.tabBar.any { it in s.ids }) {
            // a main tab (feed, explore, reels): just opened → go to the messages; came from them → out
            if (!redirected && now - fgSince < FRESH_MS && click(root, pkg, r.messages)) {
                redirected = true
                quietUntil = now + 1500
                return
            }
            act(GLOBAL_ACTION_HOME)
        } else if (now - lastBack < 2000) {
            act(GLOBAL_ACTION_HOME) // back didn't get out of it
        } else {
            // a reel / story / post opened from somewhere (a chat, a profile): back to where it was opened
            act(GLOBAL_ACTION_BACK)
            lastBack = now
        }
        say(r)
    }

    /** Visible view ids, breadth first (the screen containers sit near the top), and whether a blocked tab is the selected one. */
    private fun scan(root: AccessibilityNodeInfo, pkg: String, r: Rule): Seen {
        val prefix = "$pkg:id/"
        val s = Seen()
        val q = ArrayDeque<AccessibilityNodeInfo>()
        q.add(root)
        var n = 0
        while (q.isNotEmpty() && n < MAX_NODES) {
            val node = q.removeFirst()
            n++
            val id = node.viewIdResourceName
            if (id != null && id.startsWith(prefix) && node.isVisibleToUser) {
                val short = id.substring(prefix.length)
                s.ids.add(short)
                if (!s.tabSelected && short in r.tabs && (node.isSelected || iconSelected(node, prefix + r.tabIcon))) s.tabSelected = true
            }
            for (i in 0 until node.childCount) node.getChild(i)?.let { q.add(it) }
        }
        return s
    }

    // newer Instagram marks the tab's icon as selected, not the tab
    private fun iconSelected(tab: AccessibilityNodeInfo, iconId: String): Boolean =
        iconId.isNotEmpty() && !iconId.endsWith("/") && tab.findAccessibilityNodeInfosByViewId(iconId).any { it.isSelected }

    private fun click(root: AccessibilityNodeInfo, pkg: String, ids: List<String>): Boolean {
        for (id in ids) {
            var node: AccessibilityNodeInfo? = root.findAccessibilityNodeInfosByViewId("$pkg:id/$id").firstOrNull { it.isVisibleToUser }
            while (node != null && !node.isClickable) node = node.parent
            if (node != null && node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true
        }
        return false
    }

    private fun urlBlocked(root: AccessibilityNodeInfo, pkg: String, r: Rule): Boolean {
        for (id in r.bar) {
            for (node in root.findAccessibilityNodeInfosByViewId("$pkg:id/$id")) {
                if (node.isFocused) continue // still typing
                val url = node.text?.toString()?.lowercase()?.removePrefix("https://")?.removePrefix("http://")?.removePrefix("www.") ?: continue
                if (r.hosts.any { h -> url.startsWith(h) || url.contains(".$h") }) return true
            }
        }
        return false
    }

    private fun act(a: Int) {
        performGlobalAction(a)
        quietUntil = SystemClock.uptimeMillis() + if (a == GLOBAL_ACTION_BACK) 900 else 800
    }

    private fun say(r: Rule) {
        val now = SystemClock.uptimeMillis()
        if (r.say.isEmpty() || now - lastSay < 3500) return
        lastSay = now
        try { Toast.makeText(this, r.say, Toast.LENGTH_SHORT).show() } catch (e: Exception) { }
    }

    /** guard.json from the self-updated web files when there is one, otherwise the copy inside the APK. */
    private fun loadRules() {
        try {
            val f = File(WebUpdate.dir(this), "guard.json")
            val stamp = if (f.isFile) f.lastModified() else 0L
            if (stamp == rulesStamp && rules.isNotEmpty()) return
            val text = if (f.isFile) f.readText() else assets.open("www/guard.json").bufferedReader().use { it.readText() }
            val apps = JSONObject(text).getJSONObject("apps")
            val m = HashMap<String, Rule>()
            for (key in apps.keys()) {
                val rule = Rule(apps.getJSONObject(key))
                key.split(',').map { it.trim() }.filter { it.isNotEmpty() }.forEach { m[it] = rule }
            }
            rules = m
            rulesStamp = stamp
        } catch (e: Exception) {
            // keep the rules we had
        }
    }
}
