package studio.athr.bokra

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Lets the widget and notification buttons write to Supabase directly, without opening the app. */
object Sync {
    fun upsert(c: Context, items: List<JSONObject>): Boolean {
        if (items.isEmpty()) return true
        var s = Store.session(c) ?: return false
        val url = s.optString("url")
        val key = s.optString("key")
        if (url.isBlank() || key.isBlank()) return false
        if (System.currentTimeMillis() / 1000 > s.optLong("expires_at") - 90) s = refresh(c, s) ?: return false
        val uid = s.optJSONObject("user")?.optString("id").orEmpty()
        if (uid.isBlank()) return false
        val now = Store.isoNow()
        val rows = JSONArray()
        for (it in items) {
            rows.put(
                JSONObject()
                    .put("id", it.getString("id"))
                    .put("user_id", uid)
                    .put("kind", it.getString("kind"))
                    .put("data", it.getJSONObject("data"))
                    .put("updated_at", now)
                    .put("deleted", false)
            )
        }
        return try {
            var code = post(url, key, s.optString("access_token"), rows)
            if (code == 401) {
                s = refresh(c, s) ?: return false
                code = post(url, key, s.optString("access_token"), rows)
            }
            code in 200..299
        } catch (e: Exception) {
            false
        }
    }

    private fun post(url: String, key: String, token: String, rows: JSONArray): Int {
        val conn = URL("$url/rest/v1/bokra_items?on_conflict=user_id,id").openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 8000
            conn.readTimeout = 8000
            conn.doOutput = true
            conn.setRequestProperty("apikey", key)
            conn.setRequestProperty("Authorization", "Bearer $token")
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("Prefer", "resolution=merge-duplicates,return=minimal")
            conn.outputStream.use { it.write(rows.toString().toByteArray(Charsets.UTF_8)) }
            return conn.responseCode
        } finally {
            conn.disconnect()
        }
    }

    private fun refresh(c: Context, s: JSONObject): JSONObject? {
        val url = s.optString("url")
        val key = s.optString("key")
        return try {
            val conn = URL("$url/auth/v1/token?grant_type=refresh_token").openConnection() as HttpURLConnection
            try {
                conn.requestMethod = "POST"
                conn.connectTimeout = 8000
                conn.readTimeout = 8000
                conn.doOutput = true
                conn.setRequestProperty("apikey", key)
                conn.setRequestProperty("Content-Type", "application/json")
                val body = JSONObject().put("refresh_token", s.optString("refresh_token")).toString()
                conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
                if (conn.responseCode !in 200..299) return null
                val j = JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
                val user = j.optJSONObject("user")
                val expiresAt = if (j.has("expires_at")) j.optLong("expires_at") else System.currentTimeMillis() / 1000 + j.optLong("expires_in", 3600)
                val ns = JSONObject()
                    .put("access_token", j.optString("access_token"))
                    .put("refresh_token", j.optString("refresh_token"))
                    .put("expires_at", expiresAt)
                    .put("user", JSONObject().put("id", user?.optString("id") ?: s.optJSONObject("user")?.optString("id")).put("email", user?.optString("email")))
                    .put("url", url)
                    .put("key", key)
                Store.setSession(c, ns.toString())
                ns
            } finally {
                conn.disconnect()
            }
        } catch (e: Exception) {
            null
        }
    }

    fun prayerItem(date: String, key: String): JSONObject =
        JSONObject()
            .put("id", "p:$date:$key")
            .put("kind", "prayer")
            .put("data", JSONObject().put("date", date).put("key", key).put("done", true))
}
