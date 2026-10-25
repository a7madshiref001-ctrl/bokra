package studio.athr.bokra

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.graphics.Color
import android.text.SpannableString
import android.text.Spanned
import android.text.style.StrikethroughSpan
import android.view.View
import android.widget.RemoteViews
import org.json.JSONArray

/** Second home-screen widget: today's routine (Quran, study, the shift…). Tap a row to tick it. */
class BokraRoutineWidget : AppWidgetProvider() {
    override fun onUpdate(c: Context, mgr: AppWidgetManager, ids: IntArray) {
        Guard.heal(c)
        val v = build(c)
        ids.forEach { mgr.updateAppWidget(it, v) }
    }

    companion object {
        private val ROWS = intArrayOf(R.id.rw_r0, R.id.rw_r1, R.id.rw_r2, R.id.rw_r3, R.id.rw_r4, R.id.rw_r5)
        private val CBS = intArrayOf(R.id.rw_c0, R.id.rw_c1, R.id.rw_c2, R.id.rw_c3, R.id.rw_c4, R.id.rw_c5)
        private val TITLES = intArrayOf(R.id.rw_t0, R.id.rw_t1, R.id.rw_t2, R.id.rw_t3, R.id.rw_t4, R.id.rw_t5)
        private val METAS = intArrayOf(R.id.rw_m0, R.id.rw_m1, R.id.rw_m2, R.id.rw_m3, R.id.rw_m4, R.id.rw_m5)

        fun refresh(c: Context) {
            val mgr = AppWidgetManager.getInstance(c)
            val ids = mgr.getAppWidgetIds(ComponentName(c, BokraRoutineWidget::class.java))
            if (ids.isEmpty()) return
            val v = build(c)
            ids.forEach { mgr.updateAppWidget(it, v) }
        }

        fun build(c: Context): RemoteViews {
            val s = Store.state(c)
            val rv = RemoteViews(c.packageName, R.layout.widget_routine)
            val list = s.optJSONArray("routines") ?: JSONArray()
            val today = Prayer.todayKey(Store.dayStart(s))
            val stale = s.optString("today") != today
            val n = if (stale) 0 else list.length()
            var done = 0
            for (i in 0 until n) if (list.getJSONObject(i).optBoolean("done")) done++
            rv.setTextViewText(R.id.rw_count, if (n > 0) "$done/$n" else "")

            for (i in ROWS.indices) {
                if (i >= n) { rv.setViewVisibility(ROWS[i], View.GONE); continue }
                val r = list.getJSONObject(i)
                val isDone = r.optBoolean("done")
                val title = r.optString("title")
                val txt = SpannableString(title)
                if (isDone) txt.setSpan(StrikethroughSpan(), 0, title.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                rv.setViewVisibility(ROWS[i], View.VISIBLE)
                rv.setTextViewText(TITLES[i], txt)
                rv.setTextColor(TITLES[i], Color.parseColor(if (isDone) "#8E8983" else "#F7F5F2"))
                rv.setTextViewText(METAS[i], r.optString("meta"))
                val shift = r.optString("kind") == "shift"
                rv.setImageViewResource(CBS[i], when { shift -> R.drawable.cb_shift; isDone -> R.drawable.cb_on; else -> R.drawable.cb_off })
                val op = r.optString("op")
                val pi = if (shift || op == "open" || r.optString("tracker").isEmpty()) Notifier.openApp(c)
                else Notifier.action(c, ActionReceiver.ROUTINE, 3200 + i) {
                    it.putExtra("tracker", r.optString("tracker"))
                        .putExtra("date", r.optString("date"))
                        .putExtra("value", r.optInt("next", 1))
                        .putExtra("key", r.optString("key"))
                }
                rv.setOnClickPendingIntent(ROWS[i], pi)
            }
            rv.setViewVisibility(R.id.rw_empty, if (n == 0) View.VISIBLE else View.GONE)
            rv.setTextViewText(R.id.rw_empty, if (stale) "افتح BOKRA مرة عشان يتحدّث" else "مفيش روتين النهارده")
            rv.setOnClickPendingIntent(R.id.rw_head, Notifier.openApp(c))
            rv.setOnClickPendingIntent(R.id.rw_empty, Notifier.openApp(c))
            return rv
        }
    }
}
