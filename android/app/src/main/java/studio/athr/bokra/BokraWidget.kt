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

/** Home-screen widget: the prayer you're in (or the next one) + today's top 3. */
class BokraWidget : AppWidgetProvider() {
    override fun onUpdate(c: Context, mgr: AppWidgetManager, ids: IntArray) {
        val v = build(c)
        ids.forEach { mgr.updateAppWidget(it, v) }
    }

    companion object {
        private val DOTS = intArrayOf(R.id.w_d0, R.id.w_d1, R.id.w_d2, R.id.w_d3, R.id.w_d4)
        private val ROWS = intArrayOf(R.id.w_r0, R.id.w_r1, R.id.w_r2)
        private val CBS = intArrayOf(R.id.w_c0, R.id.w_c1, R.id.w_c2)
        private val TITLES = intArrayOf(R.id.w_t0, R.id.w_t1, R.id.w_t2)

        fun refresh(c: Context) {
            val mgr = AppWidgetManager.getInstance(c)
            val ids = mgr.getAppWidgetIds(ComponentName(c, BokraWidget::class.java))
            if (ids.isEmpty()) return
            val v = build(c)
            ids.forEach { mgr.updateAppWidget(it, v) }
        }

        fun build(c: Context): RemoteViews {
            val s = Store.state(c)
            val rv = RemoteViews(c.packageName, R.layout.widget)
            val now = System.currentTimeMillis()
            val dk = Prayer.todayKey(Store.dayStart(s), now)
            val t = Prayer.timesForKey(dk, Store.lat(s), Store.lng(s), Store.fajrAngle(s), Store.ishaAngle(s))

            var active = -1
            for (i in 0..4) if (t[i] <= now) active = i
            val current = if (active >= 0 && !Store.isPrayed(c, dk, Prayer.KEYS[active])) active else -1
            var next = -1
            for (i in 0..4) if (t[i] > now) { next = i; break }

            if (current >= 0) {
                rv.setTextViewText(R.id.w_label, "دلوقتي")
                rv.setTextViewText(R.id.w_name, Prayer.NAMES[current])
                rv.setTextViewText(R.id.w_sub, "دخل ${Prayer.clock(t[current])}")
                rv.setViewVisibility(R.id.w_pray, View.VISIBLE)
                rv.setOnClickPendingIntent(R.id.w_pray, Notifier.action(c, ActionReceiver.PRAY, 3000 + current) {
                    it.putExtra("date", dk).putExtra("key", Prayer.KEYS[current])
                })
            } else {
                val nk = if (next >= 0) dk else Prayer.shiftKey(dk, 1)
                val ni = if (next >= 0) next else 0
                val nt = if (next >= 0) t[next] else Prayer.timesForKey(nk, Store.lat(s), Store.lng(s), Store.fajrAngle(s), Store.ishaAngle(s))[0]
                rv.setTextViewText(R.id.w_label, if (next >= 0) "الصلاة الجاية" else "الصلاة الجاية · بكرة")
                rv.setTextViewText(R.id.w_name, Prayer.NAMES[ni])
                rv.setTextViewText(R.id.w_sub, Prayer.clock(nt))
                rv.setViewVisibility(R.id.w_pray, View.GONE)
            }

            for (i in 0..4) {
                val res = when {
                    Store.isPrayed(c, dk, Prayer.KEYS[i]) -> R.drawable.dot_done
                    i == current -> R.drawable.dot_now
                    t[i] <= now -> R.drawable.dot_miss
                    else -> R.drawable.dot_todo
                }
                rv.setImageViewResource(DOTS[i], res)
            }

            val t3 = s.optJSONArray("top3")
            val n = t3?.length() ?: 0
            for (i in 0..2) {
                if (i < n) {
                    val task = t3!!.getJSONObject(i)
                    val done = task.optBoolean("done")
                    val title = task.optString("title")
                    val txt = SpannableString(title)
                    if (done) txt.setSpan(StrikethroughSpan(), 0, title.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                    rv.setViewVisibility(ROWS[i], View.VISIBLE)
                    rv.setTextViewText(TITLES[i], txt)
                    rv.setTextColor(TITLES[i], if (done) Color.parseColor("#8E8983") else Color.parseColor("#F7F5F2"))
                    rv.setImageViewResource(CBS[i], if (done) R.drawable.cb_on else R.drawable.cb_off)
                    rv.setOnClickPendingIntent(ROWS[i], Notifier.action(c, ActionReceiver.TASK_TOGGLE, 3100 + i) {
                        it.putExtra("id", task.optString("id"))
                    })
                } else {
                    rv.setViewVisibility(ROWS[i], View.GONE)
                }
            }
            rv.setViewVisibility(R.id.w_empty, if (n == 0) View.VISIBLE else View.GONE)
            rv.setOnClickPendingIntent(R.id.w_head, Notifier.openApp(c))
            rv.setOnClickPendingIntent(R.id.w_empty, Notifier.openApp(c))
            return rv
        }
    }
}
