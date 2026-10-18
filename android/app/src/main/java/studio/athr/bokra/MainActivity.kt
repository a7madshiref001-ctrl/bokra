package studio.athr.bokra

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.NotificationManagerCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    lateinit var web: WebView
    private var fileCb: ValueCallback<Array<Uri>>? = null
    private val pickFile = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        fileCb?.onReceiveValue(if (uri != null) arrayOf(uri) else null)
        fileCb = null
    }

    companion object {
        @Volatile var current: MainActivity? = null
        fun poke() {
            val a = current ?: return
            a.runOnUiThread { a.web.evaluateJavascript("window.bokraResume && bokraResume()", null) }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Notifier.channels(this)

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web = WebView(this)
        web.setBackgroundColor(0xFFF7F5F2.toInt())
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            @Suppress("DEPRECATION")
            databaseEnabled = true
            allowFileAccess = false
            textZoom = 100
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == "appassets.androidplatform.net") return false
                try { startActivity(Intent(Intent.ACTION_VIEW, request.url)) } catch (e: Exception) { }
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCb?.onReceiveValue(null)
                fileCb = cb
                pickFile.launch("*/*")
                return true
            }
        }
        web.addJavascriptInterface(Bridge(), "BokraNative")
        setContentView(web)
        web.loadUrl("https://appassets.androidplatform.net/assets/www/index.html")

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                web.evaluateJavascript("window.bokraBack ? bokraBack() : false") { r ->
                    if (r != "true") {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                        isEnabled = true
                    }
                }
            }
        })

        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
        Scheduler.scheduleAll(this)
    }

    override fun onResume() {
        super.onResume()
        current = this
        web.evaluateJavascript("window.bokraResume && bokraResume()", null)
        BokraWidget.refresh(this)
    }

    override fun onPause() {
        super.onPause()
        if (current === this) current = null
    }

    fun openSettings(which: String) {
        val pkg = Uri.parse("package:$packageName")
        val i = when (which) {
            "notifications" -> Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
            "exact" -> if (Build.VERSION.SDK_INT >= 31) Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, pkg) else Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)
            "battery" -> Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, pkg)
            "usage" -> Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
            else -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)
        }
        try { startActivity(i) } catch (e: Exception) {
            try { startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)) } catch (_: Exception) { }
        }
    }

    /** window.BokraNative in the web app. */
    inner class Bridge {
        private val c get() = this@MainActivity

        @JavascriptInterface fun getSession(): String = Store.prefs(c).getString("session", "") ?: ""
        @JavascriptInterface fun setSession(json: String) { Store.setSession(c, json) }

        @JavascriptInterface fun updateState(json: String) {
            if (Store.setState(c, json)) {
                Scheduler.scheduleAll(c)
                BokraWidget.refresh(c)
            }
        }

        @JavascriptInterface fun drainActions(): String = Store.drain(c)

        @JavascriptInterface fun screenTimeMinutes(): String =
            ScreenTime.todayMinutes(c, Store.dayStart(Store.state(c))).toString()

        @JavascriptInterface fun permissions(): String {
            val pm = getSystemService(PowerManager::class.java)
            return JSONObject()
                .put("notifications", NotificationManagerCompat.from(c).areNotificationsEnabled())
                .put("exact", Scheduler.canExact(c))
                .put("battery", pm.isIgnoringBatteryOptimizations(packageName))
                .put("usage", ScreenTime.hasAccess(c))
                .toString()
        }

        @JavascriptInterface fun openSettings(which: String) { runOnUiThread { c.openSettings(which) } }
        @JavascriptInterface fun testNotification() { Notifier.test(c) }

        @JavascriptInterface fun share(json: String) {
            val j = try { JSONObject(json) } catch (e: Exception) { JSONObject() }
            runOnUiThread {
                val send = Intent(Intent.ACTION_SEND).setType("text/plain")
                    .putExtra(Intent.EXTRA_SUBJECT, j.optString("title", "BOKRA"))
                    .putExtra(Intent.EXTRA_TEXT, j.optString("text"))
                startActivity(Intent.createChooser(send, j.optString("title", "BOKRA")))
            }
        }
    }
}
