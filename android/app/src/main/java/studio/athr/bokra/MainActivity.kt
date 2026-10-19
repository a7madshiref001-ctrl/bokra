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
import android.speech.RecognizerIntent
import android.webkit.PermissionRequest
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

    // the web app records voice notes itself (getUserMedia); Android only has to let the mic through
    private var pendingMic: PermissionRequest? = null
    private val micPerm = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        val r = pendingMic
        pendingMic = null
        if (ok) r?.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) else r?.deny()
    }

    private val voiceLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        val text = res.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
        val arg = if (text != null) JSONObject.quote(text) else "null"
        web.evaluateJavascript("window.bokraVoiceResult && bokraVoiceResult($arg)", null)
    }

    /** Google voice typing in Egyptian Arabic; the text goes back to the web app. */
    fun startVoice() {
        val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ar-EG")
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "ar-EG")
            .putExtra(RecognizerIntent.EXTRA_PROMPT, "قول اللي عملته أو اللي عايز تعمله")
        try {
            voiceLauncher.launch(i)
        } catch (e: Exception) {
            web.evaluateJavascript("window.bokraVoiceResult && bokraVoiceResult(null, 'unavailable')", null)
        }
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

        WebUpdate.resetIfApkChanged(this)
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebUpdate.Handler(this))
            .build()

        web = WebView(this)
        web.setBackgroundColor(0xFF1C1B1A.toInt())
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            @Suppress("DEPRECATION")
            databaseEnabled = true
            allowFileAccess = false
            textZoom = 100
            setSupportZoom(false)
            mediaPlaybackRequiresUserGesture = false
            builtInZoomControls = false
            displayZoomControls = false
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

            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    if (request.origin.host != "appassets.androidplatform.net" || PermissionRequest.RESOURCE_AUDIO_CAPTURE !in request.resources) {
                        request.deny()
                    } else if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                    } else {
                        pendingMic?.deny()
                        pendingMic = request
                        micPerm.launch(Manifest.permission.RECORD_AUDIO)
                    }
                }
            }
        }
        web.addJavascriptInterface(Bridge(), "BokraNative")
        setContentView(web)
        web.loadUrl("https://appassets.androidplatform.net/assets/www/" + BuildConfig.START_PAGE)

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

    @Volatile private var updateReady = false

    /** New web files are in place: the page picks the moment to reload (not mid-recording or mid-typing). */
    fun webUpdated() = runOnUiThread {
        web.evaluateJavascript("window.bokraUpdateReady ? bokraUpdateReady() : false") { r -> if (r != "true") updateReady = true }
    }

    override fun onResume() {
        super.onResume()
        current = this
        if (updateReady) { updateReady = false; web.reload() }
        WebUpdate.check(this) { webUpdated() }
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
        @JavascriptInterface fun startVoice() { runOnUiThread { c.startVoice() } }
        /** Present from the APK that lets the web app record real audio. */
        @JavascriptInterface fun hasMic(): Boolean = true
        @JavascriptInterface fun nativeVersion(): Int = BuildConfig.VERSION_CODE
        @JavascriptInterface fun checkUpdate() { WebUpdate.check(c) { c.webUpdated() } }

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
