package studio.athr.bokra

import android.Manifest
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.os.SystemClock
import android.widget.RemoteViews

/**
 * The small record button on the home screen. Tap: it records (the button breathes and counts).
 * Tap again: saved, ✓. Never opens the app. Its faces are children of one ViewFlipper,
 * so switching between them plays the widget's own little animation.
 */
class RecordWidget : AppWidgetProvider() {
    override fun onUpdate(c: Context, mgr: AppWidgetManager, ids: IntArray) {
        val v = build(c)
        ids.forEach { mgr.updateAppWidget(it, v) }
    }

    companion object {
        fun ids(c: Context): IntArray =
            try { AppWidgetManager.getInstance(c).getAppWidgetIds(ComponentName(c, RecordWidget::class.java)) } catch (e: Exception) { IntArray(0) }

        fun placed(c: Context) = ids(c).isNotEmpty()

        // setDisplayedChild replays the face's animation every time, so only push when something changed
        @Volatile private var lastKey = ""

        fun refresh(c: Context) {
            val key = "${RecorderService.phase}:${mic(c)}"
            if (key == lastKey) return
            val ids = ids(c)
            if (ids.isEmpty()) return
            lastKey = key
            val v = build(c)
            val mgr = AppWidgetManager.getInstance(c)
            ids.forEach { mgr.updateAppWidget(it, v) }
        }

        fun build(c: Context): RemoteViews {
            val rv = RemoteViews(c.packageName, R.layout.widget_record)
            val phase = RecorderService.phase
            rv.setDisplayedChild(R.id.rec_flip, when (phase) {
                RecorderService.Phase.REC -> 1
                RecorderService.Phase.SAVED -> 2
                RecorderService.Phase.FAIL -> 3
                else -> 0
            })
            if (phase == RecorderService.Phase.REC) rv.setChronometer(R.id.rec_time, RecorderService.base, null, true)
            else rv.setChronometer(R.id.rec_time, SystemClock.elapsedRealtime(), null, false)
            // without the mic permission the tap opens BOKRA, where the setup screen asks for it
            rv.setOnClickPendingIntent(R.id.rec_root, if (mic(c)) RecorderService.toggle(c) else Notifier.openApp(c))
            return rv
        }

        private fun mic(c: Context) = c.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
    }
}
