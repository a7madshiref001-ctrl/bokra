package studio.athr.bokra

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import java.util.Calendar

/** Prayer reminders are computed here (they keep working even if the app isn't opened for days). */
object Scheduler {
    private const val ACTION = "studio.athr.bokra.ALARM"

    fun canExact(c: Context): Boolean {
        val am = c.getSystemService(AlarmManager::class.java)
        return Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
    }

    @Synchronized
    fun scheduleAll(c: Context) {
        val am = c.getSystemService(AlarmManager::class.java)
        val prefs = Store.prefs(c)
        (prefs.getStringSet("alarms", emptySet()) ?: emptySet()).forEach { cancel(c, am, it) }
        val codes = mutableSetOf<String>()
        val s = Store.state(c)
        val now = System.currentTimeMillis()
        val lead = Store.lead(s).toLong() * 60000L
        val level = Store.level(s)
        val today = Prayer.todayKey(Store.dayStart(s), now)

        for (dk in listOf(today, Prayer.shiftKey(today, 1))) {
            val t = Prayer.timesForKey(dk, Store.lat(s), Store.lng(s), Store.fajrAngle(s), Store.ishaAngle(s))
            for (i in 0..4) {
                if (level >= 2) set(c, am, t[i] - lead, "prayer_lead:$dk:$i", codes) { it.putExtra("type", "prayer_lead").putExtra("date", dk).putExtra("idx", i) }
                // fires for every level: refreshes the widget, and notifies when the level asks for it
                set(c, am, t[i] + 500, "prayer_due:$dk:$i", codes) { it.putExtra("type", "prayer_due").putExtra("date", dk).putExtra("idx", i) }
                if (level >= 5) {
                    for (n in 1..3) set(c, am, t[i] + n * 20 * 60000L, "prayer_rep$n:$dk:$i", codes) { it.putExtra("type", "prayer_repeat").putExtra("date", dk).putExtra("idx", i) }
                }
            }
        }

        val rem = s.optJSONArray("reminders")
        if (rem != null) {
            for (j in 0 until rem.length()) {
                val r = rem.getJSONObject(j)
                set(c, am, r.optLong("at"), "rem:${r.optString("id")}", codes) { it.putExtra("type", "reminder").putExtra("json", r.toString()) }
            }
        }

        // recompute everything once the day rolls over
        val cal = Calendar.getInstance().apply {
            timeInMillis = now
            set(Calendar.HOUR_OF_DAY, Store.dayStart(s))
            set(Calendar.MINUTE, 1)
            set(Calendar.SECOND, 0)
            if (timeInMillis <= now) add(Calendar.DAY_OF_YEAR, 1)
        }
        set(c, am, cal.timeInMillis, "reschedule", codes) { it.putExtra("type", "reschedule") }

        prefs.edit().putStringSet("alarms", codes).apply()
    }

    fun snooze(c: Context, date: String, idx: Int, minutes: Int) {
        val am = c.getSystemService(AlarmManager::class.java)
        val codes = (Store.prefs(c).getStringSet("alarms", emptySet()) ?: emptySet()).toMutableSet()
        set(c, am, System.currentTimeMillis() + minutes * 60000L, "snooze:$date:$idx", codes) { it.putExtra("type", "prayer_snooze").putExtra("date", date).putExtra("idx", idx) }
        Store.prefs(c).edit().putStringSet("alarms", codes).apply()
    }

    private fun intent(c: Context, tag: String) =
        Intent(c, AlarmReceiver::class.java).setAction(ACTION).setData(Uri.parse("bokra://alarm/" + Uri.encode(tag)))

    private fun set(c: Context, am: AlarmManager, at: Long, tag: String, codes: MutableSet<String>, extras: (Intent) -> Unit) {
        if (at <= System.currentTimeMillis()) return
        val i = intent(c, tag)
        extras(i)
        val pi = PendingIntent.getBroadcast(c, tag.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        try {
            if (canExact(c)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        } catch (e: SecurityException) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        }
        codes.add(tag)
    }

    private fun cancel(c: Context, am: AlarmManager, tag: String) {
        val pi = PendingIntent.getBroadcast(c, tag.hashCode(), intent(c, tag), PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE)
        if (pi != null) { am.cancel(pi); pi.cancel() }
    }
}
