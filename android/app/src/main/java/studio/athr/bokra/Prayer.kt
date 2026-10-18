package studio.athr.bokra

import java.util.Calendar
import java.util.Locale
import java.util.TimeZone
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.asin
import kotlin.math.atan
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.roundToLong
import kotlin.math.sin
import kotlin.math.tan

/** Same astronomy as app/js/prayer.js (Egyptian authority: Fajr 19.5°, Isha 17.5°, Asr shadow 1). */
object Prayer {
    val KEYS = arrayOf("fajr", "dhuhr", "asr", "maghrib", "isha")
    val NAMES = arrayOf("الفجر", "الضهر", "العصر", "المغرب", "العشا")
    val SHORT = arrayOf("فجر", "ضهر", "عصر", "مغرب", "عشا")

    private fun rad(d: Double) = Math.toRadians(d)
    private fun deg(r: Double) = Math.toDegrees(r)
    private fun dsin(d: Double) = sin(rad(d))
    private fun dcos(d: Double) = cos(rad(d))
    private fun dtan(d: Double) = tan(rad(d))
    private fun fix(a: Double, b: Double): Double { val x = a - b * floor(a / b); return if (x < 0) x + b else x }

    private fun julian(year: Int, month: Int, day: Int): Double {
        var y = year; var m = month
        if (m <= 2) { y -= 1; m += 12 }
        val a = floor(y / 100.0)
        val b = 2 - a + floor(a / 4.0)
        return floor(365.25 * (y + 4716)) + floor(30.6001 * (m + 1)) + day + b - 1524.5
    }

    private fun sunPos(jd: Double): Pair<Double, Double> {
        val d = jd - 2451545.0
        val g = fix(357.529 + 0.98560028 * d, 360.0)
        val q = fix(280.459 + 0.98564736 * d, 360.0)
        val l = fix(q + 1.915 * dsin(g) + 0.020 * dsin(2 * g), 360.0)
        val e = 23.439 - 0.00000036 * d
        val ra = fix(deg(atan2(dcos(e) * dsin(l), dcos(l))) / 15.0, 24.0)
        val decl = deg(asin(dsin(e) * dsin(l)))
        return Pair(decl, q / 15.0 - ra)
    }

    /** Epoch millis of the 5 prayers for a calendar date. */
    fun times(year: Int, month: Int, day: Int, lat: Double, lng: Double, fajrAngle: Double = 19.5, ishaAngle: Double = 17.5): LongArray {
        val jDate = julian(year, month, day) - lng / (15.0 * 24.0)
        fun midDay(t: Double) = fix(12 - sunPos(jDate + t).second, 24.0)
        fun angleTime(angle: Double, t: Double, ccw: Boolean): Double {
            val decl = sunPos(jDate + t).first
            val noon = midDay(t)
            var v = (-dsin(angle) - dsin(decl) * dsin(lat)) / (dcos(decl) * dcos(lat))
            v = v.coerceIn(-1.0, 1.0)
            val tt = deg(acos(v)) / 15.0
            return noon + if (ccw) -tt else tt
        }
        fun asrTime(factor: Double, t: Double): Double {
            val decl = sunPos(jDate + t).first
            val angle = -deg(atan(1.0 / (factor + dtan(abs(lat - decl)))))
            return angleTime(angle, t, false)
        }
        var fajr = 5.0; var dhuhr = 12.0; var asr = 13.0; var sunset = 18.0; var isha = 18.0
        repeat(2) {
            val f = angleTime(fajrAngle, fajr / 24, true)
            val dh = midDay(dhuhr / 24)
            val a = asrTime(1.0, asr / 24)
            val ss = angleTime(0.833, sunset / 24, false)
            val i = angleTime(ishaAngle, isha / 24, false)
            fajr = f; dhuhr = dh; asr = a; sunset = ss; isha = i
        }
        val cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
        cal.clear()
        cal.set(year, month - 1, day, 0, 0, 0)
        val base = cal.timeInMillis
        fun toMs(h: Double) = base + ((h - lng / 15.0) * 60.0).roundToLong() * 60000L
        return longArrayOf(toMs(fajr), toMs(dhuhr), toMs(asr), toMs(sunset), toMs(isha))
    }

    fun timesForKey(key: String, lat: Double, lng: Double, fa: Double, ia: Double): LongArray {
        val p = key.split("-").map { it.toInt() }
        return times(p[0], p[1], p[2], lat, lng, fa, ia)
    }

    /** The app's "today": before dayStartHour it's still yesterday. */
    fun todayKey(dayStartHour: Int, now: Long = System.currentTimeMillis()): String {
        val c = Calendar.getInstance()
        c.timeInMillis = now
        if (c.get(Calendar.HOUR_OF_DAY) < dayStartHour) c.add(Calendar.DAY_OF_YEAR, -1)
        return key(c)
    }

    fun shiftKey(key: String, days: Int): String {
        val p = key.split("-").map { it.toInt() }
        val c = Calendar.getInstance()
        c.clear()
        c.set(p[0], p[1] - 1, p[2], 12, 0, 0)
        c.add(Calendar.DAY_OF_YEAR, days)
        return key(c)
    }

    private fun key(c: Calendar) = String.format(Locale.US, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))

    fun clock(ms: Long): String {
        val c = Calendar.getInstance()
        c.timeInMillis = ms
        var h = c.get(Calendar.HOUR_OF_DAY)
        val suf = if (h < 12) "ص" else "م"
        h %= 12
        if (h == 0) h = 12
        return String.format(Locale.US, "%d:%02d", h, c.get(Calendar.MINUTE)) + " " + suf
    }
}
