package studio.athr.bokra

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import org.json.JSONObject
import kotlin.concurrent.thread

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, intent: Intent) {
        val s = Store.state(c)
        val level = Store.level(s)
        val date = intent.getStringExtra("date") ?: ""
        val idx = intent.getIntExtra("idx", 0)
        when (intent.getStringExtra("type")) {
            "prayer_lead" -> Notifier.prayer(c, date, idx, due = false)
            "prayer_due" -> {
                BokraWidget.refresh(c)
                if (level == 1 || level >= 4) Notifier.prayer(c, date, idx, due = true)
            }
            "prayer_repeat" -> if (!Notifier.sleeping(s)) Notifier.prayer(c, date, idx, due = true)
            "prayer_snooze" -> Notifier.prayer(c, date, idx, due = true)
            "reminder" -> {
                val r = try { JSONObject(intent.getStringExtra("json") ?: "{}") } catch (e: Exception) { JSONObject() }
                Notifier.reminder(c, r)
            }
            "reschedule" -> {
                Scheduler.scheduleAll(c)
                BokraWidget.refresh(c)
            }
        }
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, intent: Intent) {
        Notifier.channels(c)
        Scheduler.scheduleAll(c)
        BokraWidget.refresh(c)
    }
}

/** Buttons on notifications and on the widget. */
class ActionReceiver : BroadcastReceiver() {
    companion object {
        const val PRAY = "studio.athr.bokra.PRAY"
        const val SNOOZE = "studio.athr.bokra.SNOOZE"
        const val TASK_DONE = "studio.athr.bokra.TASK_DONE"
        const val TASK_TOGGLE = "studio.athr.bokra.TASK_TOGGLE"
        const val TASK_POSTPONE = "studio.athr.bokra.TASK_POSTPONE"
        const val TRACKER_DONE = "studio.athr.bokra.TRACKER_DONE"
        const val ROUTINE = "studio.athr.bokra.ROUTINE"
    }

    override fun onReceive(c: Context, intent: Intent) {
        val items = mutableListOf<JSONObject>()
        when (intent.action) {
            PRAY -> {
                val date = intent.getStringExtra("date") ?: return
                val key = intent.getStringExtra("key") ?: return
                Store.addAction(c, JSONObject().put("type", "prayer").put("date", date).put("key", key).put("done", true))
                Notifier.cancel(c, Notifier.prayerId(Prayer.KEYS.indexOf(key)))
                items.add(Sync.prayerItem(date, key))
            }
            SNOOZE -> {
                val date = intent.getStringExtra("date") ?: return
                val idx = intent.getIntExtra("idx", 0)
                Notifier.cancel(c, Notifier.prayerId(idx))
                Scheduler.snooze(c, date, idx, 10)
            }
            TASK_DONE, TASK_TOGGLE -> {
                val id = intent.getStringExtra("id") ?: return
                val t = Store.top3Item(c, id)
                val wasDone = t?.optBoolean("done") ?: false
                val done = if (intent.action == TASK_TOGGLE) !wasDone else true
                Store.addAction(c, JSONObject().put("type", if (done) "task_done" else "task_undone").put("id", id))
                val item = Store.top3Item(c, id)?.optJSONObject("item") ?: parse(intent.getStringExtra("item"))?.also { markTask(it, done) }
                if (item != null) items.add(item)
                val nid = intent.getIntExtra("nid", 0)
                if (nid != 0) Notifier.cancel(c, nid)
            }
            TASK_POSTPONE -> {
                val id = intent.getStringExtra("id") ?: return
                Store.addAction(c, JSONObject().put("type", "task_postpone").put("id", id))
                parse(intent.getStringExtra("item"))?.let { item ->
                    val tomorrow = Prayer.shiftKey(Prayer.todayKey(Store.dayStart(Store.state(c))), 1)
                    item.optJSONObject("data")?.let { d ->
                        d.put("date", tomorrow)
                        if (!d.isNull("top3") && d.optString("top3").isNotEmpty()) d.put("top3", tomorrow)
                    }
                    items.add(item)
                }
                Notifier.cancel(c, intent.getIntExtra("nid", 0))
            }
            ROUTINE -> {
                val tracker = intent.getStringExtra("tracker") ?: return
                val date = intent.getStringExtra("date") ?: return
                val value = intent.getIntExtra("value", 1)
                Store.addAction(c, JSONObject().put("type", "routine").put("tracker", tracker).put("date", date).put("value", value).put("key", intent.getStringExtra("key") ?: tracker))
                items.add(JSONObject().put("id", "e:$tracker:$date").put("kind", "entry").put("data", JSONObject().put("tracker", tracker).put("date", date).put("value", value)))
            }
            TRACKER_DONE -> {
                val item = parse(intent.getStringExtra("item")) ?: return
                val d = item.getJSONObject("data")
                Store.addAction(c, JSONObject().put("type", "tracker_done").put("tracker", d.optString("tracker")).put("date", d.optString("date")))
                items.add(item)
                Notifier.cancel(c, intent.getIntExtra("nid", 0))
            }
        }
        BokraWidget.refresh(c)
        MainActivity.poke()
        if (items.isNotEmpty()) {
            val pending = goAsync()
            thread {
                try { Sync.upsert(c, items) } finally { pending.finish() }
            }
        }
    }

    private fun parse(s: String?): JSONObject? = try { if (s == null) null else JSONObject(s) } catch (e: Exception) { null }

    private fun markTask(item: JSONObject, done: Boolean) {
        item.optJSONObject("data")?.let {
            it.put("done", done)
            it.put("done_at", if (done) Store.isoNow() else JSONObject.NULL)
        }
    }
}
