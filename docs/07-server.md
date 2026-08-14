<div align="right">

# ۰۷ — افزودن سرور (برای آینده)

الان بازی کاملاً آفلاین است. این سند نقشه راه اضافه کردن بخش‌های آنلاین است.

</div>

---

## چه چیزهایی به سرور نیاز دارند؟

در `index.html` بخش ۲ این لیست هست:

```js
var FEATURES = {
  leaderboard:false,   // جدول رتبه‌بندی واقعی
  shop:false,          // فروشگاه
  buyCoins:false,      // خرید سکه
  rewardedAds:false,   // تبلیغات جایزه‌ای
  online:false,        // بازی آنلاین
  duel:false,          // مسابقه دو نفره
  events:false,        // رویدادهای مناسبتی
  weekly:false,        // مراحل هفتگی
  tournament:false,    // تورنمنت
  friends:false        // سیستم دوستان
};
```

همه `false` هستند، پس نه در صفحه اصلی دیده می‌شوند و نه صفحه‌شان باز می‌شود.
کد جدول رتبه‌بندی از قبل نوشته شده و فقط منتظر سرور است.

---

## قدم ۱ — مجوز اینترنت

در `app/src/main/AndroidManifest.xml` اضافه کن:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

⚠️ بعد از این باید در فروشگاه‌ها هم اعلام کنی که برنامه به اینترنت وصل می‌شود.

---

## قدم ۲ — اجازه اتصال در WebView

در `MainActivity.kt` این خط جلوی باز شدن آدرس‌های بیرونی را می‌گیرد:

```kotlin
override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = true
```

باید طوری عوضش کنی که فقط دامنه خودت اجازه داشته باشد:

```kotlin
override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
    val host = request.url.host ?: return true
    return host != "api.yourdomain.com"   // فقط سرور خودت
}
```

همچنین چون صفحه از `file://` بارگذاری می‌شود، سرورت باید **CORS** را برای
`Origin: null` باز بگذارد، یا بهتر: به‌جای `file://` از
`WebViewAssetLoader` استفاده کنی تا صفحه با `https://appassets.androidplatform.net`
بارگذاری شود.

---

## قدم ۳ — طرح ساده سرور

کوچک‌ترین سروری که کار راه می‌اندازد:

```
POST /api/register     → ساخت حساب، برگرداندن توکن
POST /api/score        → ثبت امتیاز (سرور اعتبارسنجی می‌کند)
GET  /api/leaderboard  → گرفتن ۱۰۰ نفر برتر
GET  /api/config       → گرفتن تنظیمات بازی از راه دور
```

نمونه با Node.js + Express:

```js
app.post('/api/score', auth, async (req, res) => {
  const { stage, mode, score, timeMs } = req.body;

  // ❗ هرگز به عددی که بازی می‌فرستد اعتماد نکن
  const max = maxPossibleScore(stage, mode, timeMs);
  if (score > max) return res.status(400).json({ error: 'امتیاز غیرممکن' });
  if (timeMs < minPossibleTime(stage)) return res.status(400).json({ error: 'خیلی سریع' });

  await db.addScore(req.user.id, score);
  res.json({ ok: true });
});
```

---

## قدم ۴ — روشن کردن قابلیت

بعد از آماده شدن سرور:

```js
var FEATURES = { leaderboard:true, … };
```

و در `RENDER.board` به‌جای ربات‌های محلی، از سرور بگیر:

```js
RENDER.board=function(){
  fetch(API+'/leaderboard')
    .then(function(r){ return r.json(); })
    .then(function(list){ drawBoard(list); })
    .catch(function(){ toast('اتصال برقرار نشد'); });
};
```

---

## اصل طلایی امنیت

> **هیچ‌وقت به چیزی که از گوشی کاربر می‌آید اعتماد نکن.**

| کار | جای درستش |
|---|---|
| محاسبه امتیاز | هم بازی، هم **دوباره سرور** |
| کم و زیاد شدن سکه | فقط سرور |
| باز شدن مرحله | فقط سرور |
| خرید | فقط سرور + تأیید رسید از درگاه |

بازی فقط باید بگوید «چه اتفاقی افتاد»، و سرور تصمیم بگیرد «چه چیزی درست است».

---

## پیشنهاد ترتیب کار

1. **اول:** ذخیره ابری پیشرفت (ساده و کم‌خطر)
2. **بعد:** جدول رتبه‌بندی
3. **بعد:** فروشگاه و خرید سکه (نیاز به درگاه پرداخت)
4. **آخر:** بازی آنلاین و مسابقه دو نفره (سخت‌ترین)

هر کدام را جدا و کامل تست کن، بعد سراغ بعدی برو.
