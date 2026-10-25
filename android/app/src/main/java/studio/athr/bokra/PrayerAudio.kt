package studio.athr.bokra

import android.app.KeyguardManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/**
 * The prayer's sounds, played by BOKRA itself (not the notification channel), so they come every time:
 * a quarter hour before: Nasser's voice «اقتربت صلاة …»; 5 minutes before: a very soft chime; on time: the Makkah adhan
 * (Sheikh Ali Mullah; the Fajr one for Fajr) with the adhan screen over the lock screen, where a double tap silences it.
 * Phone on silent / vibrate / Do not disturb, or on a call: no sound, just the screen and a vibration.
 */
class PrayerAudio : Service() {
    companion object {
        const val ADHAN = 0
        const val VOICE = 1
        const val CHIME = 2
        const val REMIND = 3 // «فكّرني بعد 10 د» and the every-20-minutes level

        private val VOICES = intArrayOf(R.raw.voice_fajr, R.raw.voice_dhuhr, R.raw.voice_asr, R.raw.voice_maghrib, R.raw.voice_isha)

        /** The one playing now (same process as the adhan screen and the notification buttons). */
        @Volatile var current: PrayerAudio? = null
        /** The adhan screen closes itself when the sound ends. */
        @Volatile var onDone: (() -> Unit)? = null

        fun start(c: Context, kind: Int, date: String, idx: Int, test: Boolean = false) {
            val i = Intent(c, PrayerAudio::class.java).putExtra("kind", kind).putExtra("date", date).putExtra("idx", idx).putExtra("test", test)
            try {
                ContextCompat.startForegroundService(c, i)
            } catch (e: Exception) {
                // Android refused the background start: at least the notification
                Notifier.prayer(c, date, idx, due = kind == ADHAN || kind == REMIND)
            }
        }

        /** An adhan is on (playing, or showing silently because the phone is on silent). */
        fun isAdhan() = current?.kind == ADHAN
    }

    private var kind = ADHAN
    private var date = ""
    private var idx = 0
    private var player: MediaPlayer? = null
    private var focus: AudioFocusRequest? = null
    private val main = Handler(Looper.getMainLooper())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Notifier.channels(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (player != null || focus != null) end(repost = true, stop = false) // a new sound replaces whatever was still playing
        kind = intent?.getIntExtra("kind", ADHAN) ?: ADHAN
        date = intent?.getStringExtra("date") ?: Prayer.todayKey(Store.dayStart(Store.state(this)))
        idx = (intent?.getIntExtra("idx", 0) ?: 0).coerceIn(0, 4)
        val test = intent?.getBooleanExtra("test", false) ?: false
        val due = kind == ADHAN || kind == REMIND
        val b = Notifier.prayerBuilder(this, date, idx, due, test)
            ?: NotificationCompat.Builder(this, Notifier.CH_PRAYER).setSmallIcon(R.drawable.ic_stat).setContentTitle("BOKRA").setSilent(true)
        if (kind == ADHAN) {
            val screen = PendingIntent.getActivity(this, 4300 + idx, AdhanActivity.intent(this, date, idx), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            b.setFullScreenIntent(screen, true)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .addAction(0, "سكّت الأذان", Notifier.action(this, ActionReceiver.SILENCE, 4400) { })
        }
        try {
            ServiceCompat.startForeground(this, Notifier.prayerId(idx), b.build(),
                if (Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0)
        } catch (e: Exception) {
            stopSelf()
            return START_NOT_STICKY
        }
        current = this
        // prayed already, or it's too late for this one: nothing to say
        if (!test && Notifier.prayerBuilder(this, date, idx, due) == null) { end(repost = false); return START_NOT_STICKY }

        if (kind == ADHAN) showScreen()
        if (soundAllowed()) play() else {
            if (getSystemService(AudioManager::class.java).ringerMode == AudioManager.RINGER_MODE_VIBRATE) {
                buzz(if (kind == ADHAN) longArrayOf(0, 400, 250, 400, 250, 700) else longArrayOf(0, 120))
            }
            main.postDelayed({ end(repost = true) }, if (kind == ADHAN) 20000 else 1500)
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        main.removeCallbacksAndMessages(null)
        release()
        if (current === this) current = null
        super.onDestroy()
    }

    /** Silent, vibrate, Do not disturb, or a call going on: the phone is asking for quiet. */
    private fun soundAllowed(): Boolean {
        val am = getSystemService(AudioManager::class.java)
        val nm = getSystemService(NotificationManager::class.java)
        if (am.ringerMode != AudioManager.RINGER_MODE_NORMAL) return false
        if (nm.currentInterruptionFilter > NotificationManager.INTERRUPTION_FILTER_ALL) return false
        if (am.mode == AudioManager.MODE_IN_CALL || am.mode == AudioManager.MODE_IN_COMMUNICATION || am.mode == AudioManager.MODE_RINGTONE) return false
        return true
    }

    private fun play() {
        val res = when (kind) {
            ADHAN -> if (idx == 0) R.raw.adhan_fajr else R.raw.adhan
            VOICE -> VOICES[idx]
            else -> R.raw.chime
        }
        val volume = when (kind) { ADHAN -> 1f; VOICE -> 0.85f; else -> 0.35f } // the chime stays very soft
        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM) // its own volume, heard even when media is turned down
            .setContentType(if (kind == VOICE) AudioAttributes.CONTENT_TYPE_SPEECH else AudioAttributes.CONTENT_TYPE_MUSIC)
            .build()
        val am = getSystemService(AudioManager::class.java)
        val fr = AudioFocusRequest.Builder(if (kind == ADHAN) AudioManager.AUDIOFOCUS_GAIN_TRANSIENT else AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            .setAudioAttributes(attrs).build()
        am.requestAudioFocus(fr)
        focus = fr
        try {
            val afd = resources.openRawResourceFd(res)
            val mp = MediaPlayer()
            mp.setAudioAttributes(attrs)
            mp.setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
            afd.close()
            mp.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK)
            mp.setVolume(volume, volume)
            mp.setOnCompletionListener { end(repost = true) }
            mp.setOnErrorListener { _, _, _ -> end(repost = true); true }
            mp.prepare()
            mp.start()
            player = mp
        } catch (e: Exception) {
            end(repost = true)
        }
    }

    // on the lock screen the full-screen notification opens it; with the phone in use, open it directly
    private fun showScreen() {
        val pm = getSystemService(PowerManager::class.java)
        val km = getSystemService(KeyguardManager::class.java)
        if (!pm.isInteractive || km.isKeyguardLocked) return
        try { startActivity(AdhanActivity.intent(this, date, idx).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (e: Exception) { }
    }

    /** Double tap on the adhan screen, its button, the notification button, or «صليت». */
    fun halt(repost: Boolean = true) = end(repost)

    /** stop = false: a new sound is taking over this same service. */
    private fun end(repost: Boolean, stop: Boolean = true) {
        main.removeCallbacksAndMessages(null)
        release()
        if (stop) ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        // the plain notification (صليت ✓ / فكّرني) stays, without the full-screen screen
        if (repost) Notifier.prayer(this, date, idx, due = kind == ADHAN || kind == REMIND)
        onDone?.invoke()
        if (stop) {
            if (current === this) current = null
            stopSelf()
        }
    }

    private fun release() {
        player?.let { try { it.stop() } catch (_: Exception) { }; it.release() }
        player = null
        focus?.let { getSystemService(AudioManager::class.java).abandonAudioFocusRequest(it) }
        focus = null
    }

    @Suppress("DEPRECATION")
    private fun buzz(pattern: LongArray) {
        try { getSystemService(Vibrator::class.java)?.vibrate(VibrationEffect.createWaveform(pattern, -1)) } catch (e: Exception) { }
    }
}
