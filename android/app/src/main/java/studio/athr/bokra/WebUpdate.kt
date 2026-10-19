package studio.athr.bokra

import android.content.Context
import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * The phone app updates its own screens: every time it's opened (and every couple of minutes while open)
 * it checks version.json on GitHub Pages, downloads the new web files into the app's storage,
 * and tells the page, which reloads itself at a quiet moment.
 * Same origin as before, so nothing saved on the phone is lost. The bundled files stay as the fallback.
 */
object WebUpdate {
    private const val BASE = "https://a7madshiref001-ctrl.github.io/bokra/"
    private const val CHECK_EVERY = 20 * 1000L

    fun dir(c: Context) = File(c.filesDir, "www")

    @Volatile private var running = false

    /** A freshly installed APK carries its own files: drop any copy downloaded for an older APK. */
    fun resetIfApkChanged(c: Context) {
        val prefs = Store.prefs(c)
        if (prefs.getInt("web_for_apk", -1) != BuildConfig.VERSION_CODE) {
            dir(c).deleteRecursively()
            prefs.edit().remove("web_version").remove("web_checked").putInt("web_for_apk", BuildConfig.VERSION_CODE).apply()
        }
    }

    fun check(c: Context, force: Boolean = false, onReady: () -> Unit) {
        val prefs = Store.prefs(c)
        val now = System.currentTimeMillis()
        if (running || (!force && now - prefs.getLong("web_checked", 0) < CHECK_EVERY)) return
        running = true
        thread {
            try {
                prefs.edit().putLong("web_checked", now).apply()
                val v = JSONObject(fetch(BASE + "version.json?t=$now"))
                val ver = v.optString("version")
                if (ver.isEmpty() || ver == prefs.getString("web_version", "")) return@thread
                if (v.optInt("native", 0) > BuildConfig.VERSION_CODE) return@thread // needs a newer APK first
                val files = v.getJSONArray("files")
                val tmp = File(c.filesDir, "www_tmp")
                tmp.deleteRecursively()
                for (i in 0 until files.length()) {
                    val p = files.getString(i)
                    if (p.contains("..")) continue
                    val out = File(tmp, p)
                    out.parentFile?.mkdirs()
                    download(BASE + p + "?v=" + ver, out)
                }
                val dst = dir(c)
                val old = File(c.filesDir, "www_old")
                old.deleteRecursively()
                if (dst.exists() && !dst.renameTo(old)) dst.deleteRecursively()
                if (!tmp.renameTo(dst)) return@thread
                old.deleteRecursively()
                prefs.edit().putString("web_version", ver).apply()
                onReady()
            } catch (e: Exception) {
                // offline or GitHub unreachable: keep what we have
            } finally {
                running = false
            }
        }
    }

    private fun open(url: String): HttpURLConnection {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 10000
        conn.readTimeout = 15000
        conn.useCaches = false
        if (conn.responseCode !in 200..299) { conn.disconnect(); throw IllegalStateException("HTTP ${conn.responseCode}") }
        return conn
    }

    private fun fetch(url: String): String {
        val conn = open(url)
        try { return conn.inputStream.bufferedReader().use { it.readText() } } finally { conn.disconnect() }
    }

    private fun download(url: String, out: File) {
        val conn = open(url)
        try { conn.inputStream.use { input -> out.outputStream().use { input.copyTo(it) } } } finally { conn.disconnect() }
    }

    private fun mime(name: String): String = when (name.substringAfterLast('.', "").lowercase()) {
        "html" -> "text/html"
        "js", "mjs" -> "text/javascript"
        "css" -> "text/css"
        "json" -> "application/json"
        "webmanifest" -> "application/manifest+json"
        "svg" -> "image/svg+xml"
        "png" -> "image/png"
        "jpg", "jpeg" -> "image/jpeg"
        "webp" -> "image/webp"
        else -> "application/octet-stream"
    }

    /** Serves /assets/www/... from the downloaded copy when there is one, otherwise from the APK. */
    class Handler(private val c: Context) : WebViewAssetLoader.PathHandler {
        private val bundled = WebViewAssetLoader.AssetsPathHandler(c)
        override fun handle(path: String): WebResourceResponse? {
            if (path.startsWith("www/")) {
                val f = File(dir(c), path.removePrefix("www/"))
                if (f.isFile) {
                    val type = mime(f.name)
                    val enc = if (type.startsWith("text/") || type.contains("json") || type.contains("svg")) "utf-8" else null
                    return WebResourceResponse(type, enc, FileInputStream(f))
                }
            }
            return bundled.handle(path)
        }
    }
}
