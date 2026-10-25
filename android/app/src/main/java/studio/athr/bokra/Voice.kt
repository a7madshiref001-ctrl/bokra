package studio.athr.bokra

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Voice notes recorded from the home-screen widget, while BOKRA is closed.
 * Each one is a file in filesDir/voice plus an entry in a small queue. When the phone is signed in,
 * it goes straight to Supabase (the same bucket and row the web app would write). Either way, the next
 * time BOKRA opens, the page takes each one into its own storage and the native copy is dropped.
 */
object Voice {
    private const val BUCKET = "bokra-voice"
    private const val Q = "voice_queue"
    const val MIME = "audio/mp4"

    fun dir(c: Context) = File(c.filesDir, "voice").apply { mkdirs() }

    /** Same shape as the web app's ids (uid('i_')). */
    fun newId(): String {
        val r = (0 until 5).map { "0123456789abcdefghijklmnopqrstuvwxyz".random() }.joinToString("")
        return "i_" + java.lang.Long.toString(System.currentTimeMillis(), 36) + r
    }

    private fun read(c: Context): JSONArray =
        try { JSONArray(Store.prefs(c).getString(Q, "[]")) } catch (e: Exception) { JSONArray() }

    private fun write(c: Context, a: JSONArray) { Store.prefs(c).edit().putString(Q, a.toString()).apply() }

    @Synchronized fun add(c: Context, note: JSONObject) { write(c, read(c).put(note)) }

    @Synchronized fun list(c: Context): String = read(c).toString()

    /** The page has it now (in its own storage, or it was already in Supabase). */
    @Synchronized fun taken(c: Context, id: String) {
        val a = read(c)
        val keep = JSONArray()
        for (i in 0 until a.length()) {
            val n = a.getJSONObject(i)
            if (n.optString("id") == id) File(dir(c), n.optString("file")).delete() else keep.put(n)
        }
        write(c, keep)
    }

    @Synchronized private fun markUp(c: Context, id: String, path: String) {
        val a = read(c)
        for (i in 0 until a.length()) {
            val n = a.getJSONObject(i)
            if (n.optString("id") == id) n.put("up", true).put("path", path)
        }
        write(c, a)
    }

    /** The inbox row, as the web app writes it for a recording (see addVoice in model.js). */
    private fun row(n: JSONObject, path: String): JSONObject {
        val audio = JSONObject()
            .put("mime", MIME)
            .put("dur", n.optInt("dur"))
            .put("size", n.optLong("size"))
            .put("peaks", n.optJSONArray("peaks") ?: JSONArray())
            .put("up", true)
            .put("path", path)
        val data = JSONObject()
            .put("source", "voice")
            .put("audio", audio)
            .put("created_at", n.optString("created_at"))
            .put("processed", false)
            .put("via", "widget")
        return JSONObject().put("id", n.getString("id")).put("kind", "inbox").put("data", data)
    }

    /** Sends the notes that aren't in Supabase yet. Offline or signed out: they wait for the next try (or for the page). */
    fun uploadPending(c: Context) {
        val q = JSONArray(list(c))
        for (i in 0 until q.length()) {
            val n = q.getJSONObject(i)
            if (n.optBoolean("up")) continue
            val f = File(dir(c), n.optString("file"))
            if (!f.isFile) continue
            var s = Sync.auth(c) ?: return
            val uid = s.optJSONObject("user")?.optString("id").orEmpty()
            if (uid.isBlank()) return
            val path = "$uid/${n.getString("id")}.m4a"
            if (!put(s, path, f)) {
                s = Sync.refresh(c, s) ?: return
                if (!put(s, path, f)) return
            }
            if (!Sync.upsert(c, listOf(row(n, path)))) return
            markUp(c, n.getString("id"), path)
        }
    }

    private fun put(s: JSONObject, path: String, f: File): Boolean {
        return try {
            val conn = URL("${s.optString("url")}/storage/v1/object/$BUCKET/$path").openConnection() as HttpURLConnection
            try {
                conn.requestMethod = "POST"
                conn.connectTimeout = 10000
                conn.readTimeout = 30000
                conn.doOutput = true
                conn.setFixedLengthStreamingMode(f.length())
                conn.setRequestProperty("apikey", s.optString("key"))
                conn.setRequestProperty("Authorization", "Bearer ${s.optString("access_token")}")
                conn.setRequestProperty("Content-Type", MIME)
                conn.setRequestProperty("x-upsert", "true")
                conn.outputStream.use { out -> f.inputStream().use { it.copyTo(out) } }
                conn.responseCode in 200..299
            } finally {
                conn.disconnect()
            }
        } catch (e: Exception) {
            false
        }
    }
}
