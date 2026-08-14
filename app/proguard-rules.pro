# بازی داخل WebView اجرا می‌شود و کد جاوااسکریپت آن مبهم‌سازی نمی‌شود.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
