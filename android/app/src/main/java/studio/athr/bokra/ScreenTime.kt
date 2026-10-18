package studio.athr.bokra

import android.app.AppOpsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Process
import java.util.Calendar

/** Today's phone time (since the day started), from Android usage events. Needs "Usage access". */
object ScreenTime {
    fun hasAccess(c: Context): Boolean {
        val ops = c.getSystemService(AppOpsManager::class.java)
        val mode = if (Build.VERSION.SDK_INT >= 29) {
            ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.packageName)
        } else {
            @Suppress("DEPRECATION")
            ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.packageName)
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }

    fun todayMinutes(c: Context, dayStartHour: Int): Int {
        if (!hasAccess(c)) return -1
        val usm = c.getSystemService(UsageStatsManager::class.java) ?: return -1
        val now = System.currentTimeMillis()
        val cal = Calendar.getInstance().apply {
            timeInMillis = now
            if (get(Calendar.HOUR_OF_DAY) < dayStartHour) add(Calendar.DAY_OF_YEAR, -1)
            set(Calendar.HOUR_OF_DAY, dayStartHour)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        val home = c.packageManager.resolveActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), 0)?.activityInfo?.packageName
        val events = usm.queryEvents(cal.timeInMillis, now)
        val ev = android.app.usage.UsageEvents.Event()
        val open = HashMap<String, Long>()
        var total = 0L
        while (events.hasNextEvent()) {
            events.getNextEvent(ev)
            val pkg = ev.packageName ?: continue
            if (pkg == home) continue
            when (ev.eventType) {
                1 -> open[pkg] = ev.timeStamp // ACTIVITY_RESUMED / MOVE_TO_FOREGROUND
                2 -> open.remove(pkg)?.let { total += ev.timeStamp - it } // ACTIVITY_PAUSED / MOVE_TO_BACKGROUND
            }
        }
        open.values.forEach { total += now - it }
        return (total / 60000L).toInt()
    }
}
