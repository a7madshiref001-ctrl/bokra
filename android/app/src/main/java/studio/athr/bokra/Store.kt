package studio.athr.bokra

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** Everything native needs, saved by the web app through Bridge.updateState. */
object Store {
    private const val P = "bokra"

    fun prefs(c: Context): SharedPreferences = c.getSharedPreferences(P, Context.MODE_PRIVATE)

    fun isoNow(): String {
        val f = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        f.timeZone = TimeZone.getTimeZone("UTC")
        return f.format(Date())
    }

    fun state(c: Context): JSONObject =
        try { JSONObject(prefs(c).getString("state", "{}") ?: "{}") } catch (e: Exception) { JSONObject() }

    private fun saveState(c: Context, s: JSONObject) { prefs(c).edit().putString("state", s.toString()).apply() }

    /** Returns true when the state changed. Pending (not yet drained) actions are re-applied on top. */
    @Synchronized
    fun setState(c: Context, json: String): Boolean {
        val old = prefs(c).getString("state", "")
        val s = try { JSONObject(json) } catch (e: Exception) { return false }
        val pending = try { JSONArray(prefs(c).getString("actions", "[]")) } catch (e: Exception) { JSONArray() }
        for (i in 0 until pending.length()) applyToState(s, pending.getJSONObject(i))
        val str = s.toString()
        if (str == old) return false
        prefs(c).edit().putString("state", str).apply()
        return true
    }

    fun session(c: Context): JSONObject? {
        val raw = prefs(c).getString("session", null) ?: return null
        return try { JSONObject(raw).takeIf { it.optString("access_token").isNotEmpty() } } catch (e: Exception) { null }
    }

    fun setSession(c: Context, json: String?) {
        val e = prefs(c).edit()
        if (json.isNullOrBlank() || json == "{}") e.remove("session") else e.putString("session", json)
        e.apply()
    }

    @Synchronized
    fun addAction(c: Context, a: JSONObject) {
        val arr = try { JSONArray(prefs(c).getString("actions", "[]")) } catch (e: Exception) { JSONArray() }
        a.put("at", System.currentTimeMillis())
        arr.put(a)
        prefs(c).edit().putString("actions", arr.toString()).apply()
        val s = state(c)
        applyToState(s, a)
        saveState(c, s)
    }

    @Synchronized
    fun drain(c: Context): String {
        val s = prefs(c).getString("actions", "[]") ?: "[]"
        prefs(c).edit().putString("actions", "[]").apply()
        return s
    }

    private fun applyToState(s: JSONObject, a: JSONObject) {
        when (a.optString("type")) {
            "prayer" -> {
                val prayed = s.optJSONObject("prayed") ?: JSONObject().also { s.put("prayed", it) }
                val date = a.optString("date")
                val arr = prayed.optJSONArray(date) ?: JSONArray().also { prayed.put(date, it) }
                val key = a.optString("key")
                var has = false
                for (i in 0 until arr.length()) if (arr.optString(i) == key) has = true
                if (!has) arr.put(key)
            }
            "task_done", "task_undone" -> {
                val done = a.optString("type") == "task_done"
                val t3 = s.optJSONArray("top3") ?: return
                for (i in 0 until t3.length()) {
                    val t = t3.getJSONObject(i)
                    if (t.optString("id") == a.optString("id")) {
                        t.put("done", done)
                        t.optJSONObject("item")?.optJSONObject("data")?.let { d ->
                            d.put("done", done)
                            d.put("done_at", if (done) isoNow() else JSONObject.NULL)
                        }
                    }
                }
            }
        }
    }

    fun isPrayed(c: Context, date: String, key: String): Boolean {
        val arr = state(c).optJSONObject("prayed")?.optJSONArray(date) ?: return false
        for (i in 0 until arr.length()) if (arr.optString(i) == key) return true
        return false
    }

    fun top3Item(c: Context, id: String): JSONObject? {
        val t3 = state(c).optJSONArray("top3") ?: return null
        for (i in 0 until t3.length()) {
            val t = t3.getJSONObject(i)
            if (t.optString("id") == id) return t
        }
        return null
    }

    // settings with defaults (Beni Suef)
    fun lat(s: JSONObject) = s.optDouble("lat", 29.0661)
    fun lng(s: JSONObject) = s.optDouble("lng", 31.0994)
    fun fajrAngle(s: JSONObject) = s.optDouble("fajrAngle", 19.5)
    fun ishaAngle(s: JSONObject) = s.optDouble("ishaAngle", 17.5)
    fun lead(s: JSONObject) = s.optInt("lead", 15)
    fun level(s: JSONObject) = s.optInt("level", 4)
    fun dayStart(s: JSONObject) = s.optInt("dayStartHour", 3)
}
