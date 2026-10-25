package studio.athr.bokra

import android.Manifest
import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import kotlin.concurrent.thread
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Records a voice note from the home-screen widget without opening the app.
 * Android widgets only receive taps (no press-and-hold), so: tap starts, the button turns into a live timer,
 * tap again saves. The widget then shows ✓ for a moment, with a short double buzz.
 * The note lands in BOKRA's voice inbox, the same as one recorded inside the app.
 */
class RecorderService : Service() {
    enum class Phase { IDLE, REC, SAVED, FAIL }

    companion object {
        const val TOGGLE = "studio.athr.bokra.REC_TOGGLE"
        private const val NID = 4100
        private const val MAX_MS = 600_000 // same 10-minute cap as the app

        @Volatile var phase = Phase.IDLE
        /** elapsedRealtime when the recording started (drives the widget's timer). */
        @Volatile var base = 0L

        fun intent(c: Context): Intent = Intent(c, RecorderService::class.java).setAction(TOGGLE)
        fun toggle(c: Context): PendingIntent =
            PendingIntent.getForegroundService(c, 4101, intent(c), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private var rec: MediaRecorder? = null
    private var file: File? = null
    private var id = ""
    private var startedWall = 0L
    private val levels = ArrayList<Int>()
    private val main = Handler(Looper.getMainLooper())

    // loudness every 100 ms, for the little waveform saved with the note
    private val sample = object : Runnable {
        override fun run() {
            val r = rec ?: return
            try { levels.add(r.maxAmplitude) } catch (e: Exception) { }
            main.postDelayed(this, 100)
        }
    }

    // ✓ (or the error face) stays a moment, then the button is back
    private val settle = Runnable {
        phase = Phase.IDLE
        RecordWidget.refresh(this)
        if (rec == null) stopSelf()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Notifier.channels(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Guard.heal(this)
        // every startForegroundService has to be answered with startForeground, even the tap that stops
        if (!foreground()) { stopSelf(); return START_NOT_STICKY }
        if (rec == null) start() else stop(save = true)
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        if (rec != null) stop(save = true)
        main.removeCallbacksAndMessages(null)
        if (phase != Phase.IDLE) { phase = Phase.IDLE; RecordWidget.refresh(this) }
        super.onDestroy()
    }

    private fun foreground(): Boolean = try {
        val type = if (Build.VERSION.SDK_INT >= 30) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0
        ServiceCompat.startForeground(this, NID, notification(), type)
        true
    } catch (e: Exception) {
        false
    }

    private fun start() {
        main.removeCallbacks(settle)
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) { fail(); return }
        id = Voice.newId()
        val f = File(Voice.dir(this), "$id.m4a")
        val r = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(this) else @Suppress("DEPRECATION") MediaRecorder()
        try {
            r.setAudioSource(MediaRecorder.AudioSource.MIC)
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            r.setAudioChannels(1)
            r.setAudioSamplingRate(44100)
            r.setAudioEncodingBitRate(48000)
            r.setMaxDuration(MAX_MS)
            r.setOutputFile(f.absolutePath)
            r.setOnInfoListener { _, what, _ ->
                if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED) main.post { stop(save = true) }
            }
            r.prepare()
            r.start()
        } catch (e: Exception) {
            // mic busy (a call, another app) or refused
            try { r.release() } catch (_: Exception) { }
            f.delete()
            fail()
            return
        }
        rec = r
        file = f
        levels.clear()
        base = SystemClock.elapsedRealtime()
        startedWall = System.currentTimeMillis()
        phase = Phase.REC
        main.postDelayed(sample, 100)
        buzz(longArrayOf(0, 26))
        RecordWidget.refresh(this)
        try { NotificationManagerCompat.from(this).notify(NID, notification()) } catch (e: SecurityException) { }
    }

    private fun stop(save: Boolean) {
        val r = rec ?: return
        rec = null
        main.removeCallbacks(sample)
        val ms = SystemClock.elapsedRealtime() - base
        var ok = true
        try { r.stop() } catch (e: Exception) { ok = false } // throws when nothing was captured yet
        try { r.release() } catch (_: Exception) { }
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        val f = file
        file = null
        if (!save || !ok || f == null || ms < 1000 || f.length() == 0L) {
            // a double tap by mistake: nothing kept, the button just comes back
            f?.delete()
            phase = Phase.IDLE
            buzz(longArrayOf(0, 12))
            RecordWidget.refresh(this)
            stopSelf()
            return
        }
        Voice.add(this, JSONObject()
            .put("id", id)
            .put("file", f.name)
            .put("dur", (ms / 1000.0).roundToInt())
            .put("size", f.length())
            .put("peaks", peaks(levels))
            .put("created_at", Store.isoNow())
            .put("up", false))
        phase = Phase.SAVED
        buzz(longArrayOf(0, 18, 90, 30))
        RecordWidget.refresh(this)
        MainActivity.poke()
        main.postDelayed(settle, 1800)
        val app = applicationContext
        thread { try { Voice.uploadPending(app) } catch (e: Exception) { } }
    }

    private fun fail() {
        phase = Phase.FAIL
        buzz(longArrayOf(0, 70))
        RecordWidget.refresh(this)
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        main.postDelayed(settle, 1800)
    }

    /** 40 bars scaled 1–9, like peaks() in voice.js. */
    private fun peaks(levels: List<Int>, n: Int = 40): JSONArray {
        val out = JSONArray()
        if (levels.isEmpty()) return out
        val step = levels.size.toDouble() / n
        val raw = IntArray(n) { i ->
            val a = (i * step).toInt()
            val b = max(a + 1, ((i + 1) * step).toInt())
            var m = 0
            for (j in a until min(b, levels.size)) m = max(m, levels[j])
            m
        }
        val top = max(raw.maxOrNull() ?: 0, 1)
        raw.forEach { out.put(max(1, (it.toDouble() / top * 9).roundToInt())) }
        return out
    }

    private fun notification(): Notification {
        val b = NotificationCompat.Builder(this, Notifier.CH_REC)
            .setSmallIcon(R.drawable.ic_rec_stat)
            .setColor(0xFFF24A3D.toInt())
            .setContentTitle("BOKRA بيسجّل")
            .setContentText("دوس الزرار تاني عشان يتحفظ")
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setOngoing(true)
            .setSilent(true)
            .setContentIntent(toggle(this))
            .addAction(0, "احفظ ✓", toggle(this))
        if (phase == Phase.REC) b.setUsesChronometer(true).setWhen(startedWall).setShowWhen(true)
        return b.build()
    }

    @Suppress("DEPRECATION")
    private fun buzz(pattern: LongArray) {
        try {
            getSystemService(Vibrator::class.java)?.vibrate(VibrationEffect.createWaveform(pattern, -1))
        } catch (e: Exception) { }
    }
}
