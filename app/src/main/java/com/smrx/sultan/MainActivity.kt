package com.smrx.sultan

import android.annotation.SuppressLint
import android.content.pm.ApplicationInfo
import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback

/**
 * پوسته اندرویدی بازی «سلطان معما».
 *
 * کل بازی داخل فایل assets/index.html است و اینجا فقط در یک WebView
 * تمام‌صفحه نمایش داده می‌شود. هیچ ارتباط اینترنتی لازم نیست.
 */
class MainActivity : ComponentActivity() {

    private var web: WebView? = null

    @SuppressLint("SetJavaScriptEnabled", "ClickableViewAccessibility")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val w = WebView(this)
        web = w
        w.layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )
        setContentView(w)

        w.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true          // برای ذخیره پیشرفت بازیکن (localStorage)
            allowFileAccess = true
            allowContentAccess = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mediaPlaybackRequiresUserGesture = false   // اجازه پخش صداهای کوتاه بازی
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            textZoom = 100                    // اندازه متن بازی به تنظیمات گوشی وابسته نباشد
            useWideViewPort = false
            loadWithOverviewMode = false
        }

        w.setBackgroundColor(Color.parseColor("#150E35"))
        w.overScrollMode = View.OVER_SCROLL_NEVER
        w.isVerticalScrollBarEnabled = false
        w.isHorizontalScrollBarEnabled = false
        // انتخاب متن در بازی با CSS خاموش است؛ فقط در کادر پشتیبان‌گیری پنل مدیریت
        // باز است تا کاربر بتواند متن را کپی کند.

        // بازی آفلاین است؛ هیچ آدرس بیرونی نباید باز شود
        w.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = true
        }

        val debuggable = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        if (debuggable) WebView.setWebContentsDebuggingEnabled(true)

        val restored = savedInstanceState != null && w.restoreState(savedInstanceState) != null
        if (!restored) w.loadUrl(GAME_URL)

        // دکمه بازگشت گوشی: اول خود بازی تصمیم می‌گیرد (بستن پنجره / برگشت به منو)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val view = web
                if (view == null) {
                    finish()
                    return
                }
                view.evaluateJavascript(
                    "(function(){try{return window.onAndroidBack&&window.onAndroidBack()===true;}catch(e){return false;}})()"
                ) { result ->
                    if (result != "true") finish()
                }
            }
        })
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web?.saveState(outState)
    }

    override fun onPause() {
        super.onPause()
        web?.onPause()
    }

    override fun onResume() {
        super.onResume()
        web?.onResume()
    }

    override fun onDestroy() {
        web?.let { v ->
            (v.parent as? ViewGroup)?.removeView(v)
            v.destroy()
        }
        web = null
        super.onDestroy()
    }

    private companion object {
        const val GAME_URL = "file:///android_asset/index.html"
    }
}
