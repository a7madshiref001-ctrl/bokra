package studio.athr.bokra

import android.animation.ObjectAnimator
import android.animation.PropertyValuesHolder
import android.animation.ValueAnimator
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.GestureDetector
import android.view.HapticFeedbackConstants
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.ImageView
import android.widget.TextView
import androidx.activity.ComponentActivity

/**
 * The adhan screen: comes up over the lock screen (or over whatever is open) while the adhan plays.
 * Double tap anywhere, or a volume key: the sound stops. «صليت ✓» marks it and stops it too.
 * It closes by itself when the adhan ends.
 */
class AdhanActivity : ComponentActivity() {
    companion object {
        fun intent(c: Context, date: String, idx: Int): Intent =
            Intent(c, AdhanActivity::class.java).putExtra("date", date).putExtra("idx", idx)
    }

    private val done: () -> Unit = { runOnUiThread { if (!isFinishing) finishAndRemoveTask() } }
    private val anims = ArrayList<ValueAnimator>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        }
        // opened late (from the notification after it ended): nothing to show
        if (!PrayerAudio.isAdhan()) { finish(); return }
        setContentView(R.layout.activity_adhan)
        PrayerAudio.onDone = done

        val date = intent.getStringExtra("date") ?: Prayer.todayKey(Store.dayStart(Store.state(this)))
        val idx = intent.getIntExtra("idx", 0).coerceIn(0, 4)
        fill(date, idx)

        val gd = GestureDetector(this, object : GestureDetector.SimpleOnGestureListener() {
            override fun onDown(e: MotionEvent) = true
            override fun onDoubleTap(e: MotionEvent): Boolean { silence(); return true }
        })
        val root = findViewById<View>(R.id.adhan_root)
        root.setOnTouchListener { _, e -> gd.onTouchEvent(e) }

        findViewById<View>(R.id.adhan_pray).setOnClickListener {
            it.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
            sendBroadcast(Intent(this, ActionReceiver::class.java).setAction(ActionReceiver.PRAY)
                .putExtra("date", date).putExtra("key", Prayer.KEYS[idx]))
            PrayerAudio.current?.halt(repost = false) ?: done()
        }

        breathe(findViewById(R.id.adhan_ring), 1.0f, 1.10f, 0.9f, 0.35f, 1600)
        breathe(findViewById(R.id.adhan_ring2), 0.92f, 1.06f, 1.0f, 0.5f, 1300)
    }

    private fun fill(date: String, idx: Int) {
        val s = Store.state(this)
        val t = Prayer.timesForKey(date, Store.lat(s), Store.lng(s), Store.fajrAngle(s), Store.ishaAngle(s))
        val now = System.currentTimeMillis()
        findViewById<TextView>(R.id.adhan_name).text = Prayer.NAMES[idx]
        findViewById<TextView>(R.id.adhan_time).text = Prayer.clock(t[idx])
        val dots = intArrayOf(R.id.adhan_d0, R.id.adhan_d1, R.id.adhan_d2, R.id.adhan_d3, R.id.adhan_d4)
        for (i in 0..4) {
            val res = when {
                Store.isPrayed(this, date, Prayer.KEYS[i]) -> R.drawable.dot_done
                i == idx -> R.drawable.dot_now
                t[i] <= now -> R.drawable.dot_miss
                else -> R.drawable.dot_todo
            }
            findViewById<ImageView>(dots[i]).setImageResource(res)
        }
        val nextAt = if (idx < 4) t[idx + 1] else Prayer.timesForKey(Prayer.shiftKey(date, 1), Store.lat(s), Store.lng(s), Store.fajrAngle(s), Store.ishaAngle(s))[0]
        val m = ((nextAt - now) / 60000L).coerceAtLeast(0)
        val left = if (m >= 60) "${m / 60}س ${m % 60}د" else "${m}د"
        findViewById<TextView>(R.id.adhan_next).text = "${Prayer.NAMES[(idx + 1) % 5]} بعد $left"
    }

    private fun breathe(v: View, s0: Float, s1: Float, a0: Float, a1: Float, ms: Long) {
        val a = ObjectAnimator.ofPropertyValuesHolder(v,
            PropertyValuesHolder.ofFloat(View.SCALE_X, s0, s1),
            PropertyValuesHolder.ofFloat(View.SCALE_Y, s0, s1),
            PropertyValuesHolder.ofFloat(View.ALPHA, a0, a1))
        a.duration = ms
        a.repeatCount = ValueAnimator.INFINITE
        a.repeatMode = ValueAnimator.REVERSE
        a.start()
        anims.add(a)
    }

    private fun silence() {
        window.decorView.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
        PrayerAudio.current?.halt() ?: done()
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN || keyCode == KeyEvent.KEYCODE_VOLUME_UP) { silence(); return true }
        return super.onKeyDown(keyCode, event)
    }

    override fun onDestroy() {
        anims.forEach { it.cancel() }
        if (PrayerAudio.onDone === done) PrayerAudio.onDone = null
        super.onDestroy()
    }
}
