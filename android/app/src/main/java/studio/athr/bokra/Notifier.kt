package studio.athr.bokra

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject
import java.util.Calendar

object Notifier {
    private const val CH_PRAYER = "prayer"
    private const val CH_QUIET = "quiet"
    private const val CH_TASKS = "tasks"
    const val CH_REC = "rec"
    private const val ACCENT = 0xFFF24A3D.toInt()

    fun channels(c: Context) {
        val nm = c.getSystemService(NotificationManager::class.java)
        val prayer = NotificationChannel(CH_PRAYER, "الصلاة", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "تذكير قبل الصلاة ووقت الأذان"
            lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        }
        val quiet = NotificationChannel(CH_QUIET, "تذكير هادي وقت النوم", NotificationManager.IMPORTANCE_LOW).apply {
            description = "بيظهر من غير صوت وإنت نايم"
            lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        }
        val tasks = NotificationChannel(CH_TASKS, "المهام والتذكيرات", NotificationManager.IMPORTANCE_DEFAULT).apply {
            lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        }
        val rec = NotificationChannel(CH_REC, "التسجيل من الويدجت", NotificationManager.IMPORTANCE_LOW).apply {
            description = "بيظهر وإنت بتسجّل من زرار الشاشة الرئيسية"
            setSound(null, null)
            enableVibration(false)
        }
        nm.createNotificationChannels(listOf(prayer, quiet, tasks, rec))
    }

    fun openApp(c: Context): PendingIntent {
        val i = Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        return PendingIntent.getActivity(c, 1, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    fun action(c: Context, action: String, code: Int, extras: (Intent) -> Unit): PendingIntent {
        val i = Intent(c, ActionReceiver::class.java).setAction(action).setData(Uri.parse("bokra://action/$action/$code"))
        extras(i)
        return PendingIntent.getBroadcast(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    fun sleeping(s: JSONObject, now: Long = System.currentTimeMillis()): Boolean {
        val from = s.optString("sleepFrom", "05:00")
        val to = s.optString("sleepTo", "13:30")
        fun mins(hm: String): Int { val p = hm.split(":"); return (p.getOrNull(0)?.toIntOrNull() ?: 0) * 60 + (p.getOrNull(1)?.toIntOrNull() ?: 0) }
        val c = Calendar.getInstance().apply { timeInMillis = now }
        val m = c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE)
        val a = mins(from); val b = mins(to)
        return if (a <= b) m in a until b else m >= a || m < b
    }

    fun prayerId(i: Int) = 1000 + i

    fun prayer(c: Context, date: String, i: Int, due: Boolean) {
        val s = Store.state(c)
        if (Store.isPrayed(c, date, Prayer.KEYS[i])) return
        val times = Prayer.timesForKey(date, Store.lat(s), Store.lng(s), Store.fajrAngle(s), Store.ishaAngle(s))
        val at = times[i]
        val now = System.currentTimeMillis()
        val next = if (i < 4) times[i + 1] else Prayer.timesForKey(Prayer.shiftKey(date, 1), Store.lat(s), Store.lng(s), Store.fajrAngle(s), Store.ishaAngle(s))[0]
        if (now >= next) return
        val level = Store.level(s)
        val quiet = sleeping(s, now)
        val name = Prayer.NAMES[i]
        val title = if (due || now >= at) "حان وقت $name" else {
            val m = ((at - now) / 60000L).coerceAtLeast(1)
            "$name بعد $m دقيقة"
        }
        val code = prayerId(i)
        val b = NotificationCompat.Builder(c, if (quiet) CH_QUIET else CH_PRAYER)
            .setSmallIcon(R.drawable.ic_stat)
            .setColor(ACCENT)
            .setContentTitle(title)
            .setContentText("${Prayer.clock(at)} · ${s.optString("city", "بني سويف")}")
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(if (quiet) NotificationCompat.PRIORITY_LOW else NotificationCompat.PRIORITY_HIGH)
            .setOngoing(level >= 3)
            .setAutoCancel(false)
            .setSilent(quiet)
            .setContentIntent(openApp(c))
            .setTimeoutAfter(next - now)
            .addAction(0, "صليت ✓", action(c, ActionReceiver.PRAY, code) { it.putExtra("date", date).putExtra("key", Prayer.KEYS[i]) })
            .addAction(0, "فكّرني بعد 10 د", action(c, ActionReceiver.SNOOZE, code + 50) { it.putExtra("date", date).putExtra("idx", i) })
        post(c, code, b)
    }

    fun reminder(c: Context, r: JSONObject) {
        val code = 2000 + (r.optString("id").hashCode() and 0xffff)
        val b = NotificationCompat.Builder(c, CH_TASKS)
            .setSmallIcon(R.drawable.ic_stat)
            .setColor(ACCENT)
            .setContentTitle(r.optString("title"))
            .setContentText(r.optString("body"))
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setSilent(sleeping(Store.state(c)))
            .setContentIntent(openApp(c))
        val item = r.optJSONObject("item")
        when (r.optString("kind")) {
            "task" -> if (item != null) {
                b.addAction(0, "خلصت ✓", action(c, ActionReceiver.TASK_DONE, code) { it.putExtra("id", r.optString("id")).putExtra("item", item.toString()).putExtra("nid", code) })
                b.addAction(0, "أجّلها لبكرة", action(c, ActionReceiver.TASK_POSTPONE, code + 1) { it.putExtra("id", r.optString("id")).putExtra("item", item.toString()).putExtra("nid", code) })
            }
            "tracker" -> if (item != null) {
                b.addAction(0, "تم ✓", action(c, ActionReceiver.TRACKER_DONE, code) { it.putExtra("item", item.toString()).putExtra("nid", code) })
            }
        }
        post(c, code, b)
    }

    fun test(c: Context) {
        val b = NotificationCompat.Builder(c, CH_PRAYER)
            .setSmallIcon(R.drawable.ic_stat)
            .setColor(ACCENT)
            .setContentTitle("BOKRA شغال")
            .setContentText("كده الإشعارات هتوصلك، وهتظهر على شاشة القفل.")
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(openApp(c))
        post(c, 999, b)
    }

    private fun post(c: Context, id: Int, b: NotificationCompat.Builder) {
        try { NotificationManagerCompat.from(c).notify(id, b.build()) } catch (e: SecurityException) { /* no permission yet */ }
    }

    fun cancel(c: Context, id: Int) { NotificationManagerCompat.from(c).cancel(id) }
}
