plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// ---------------------------------------------------------------------
// بازی «سلطان معما» — تیم SMRx
//
// کل بازی یک فایل HTML است: app/src/main/assets/index.html
// این ماژول فقط یک WebView تمام‌صفحه است که همان فایل را اجرا می‌کند.
//
// اجرا: در اندروید استودیو دکمه ▶ Run را بزن.
// ساخت خروجی:  ./gradlew assembleDebug   یا   ./gradlew assembleRelease
// ---------------------------------------------------------------------

// کلید امضا از فایل keystore.properties (کنار همین پروژه) خوانده می‌شود.
// اگر نبود، نسخه release بدون امضا ساخته می‌شود و بیلد نمی‌شکند.
val keystorePropsFile = rootProject.file("keystore.properties")

fun readProps(f: File): Map<String, String> {
    if (!f.isFile) return emptyMap()
    return f.readLines(Charsets.UTF_8)
        .map { it.trim() }
        .filter { it.isNotEmpty() && !it.startsWith("#") && it.contains("=") }
        .associate { line ->
            val i = line.indexOf('=')
            line.substring(0, i).trim() to line.substring(i + 1).trim()
        }
}

val signProps = readProps(keystorePropsFile)
val storePath = signProps["storeFile"]?.trim()?.trim('"')?.replace('\\', '/')
val storeFileResolved: File? = storePath?.let {
    val f = File(it)
    if (f.isAbsolute) f else rootProject.file(it)
}
val signReady = storeFileResolved != null && storeFileResolved.isFile &&
        !signProps["storePassword"].isNullOrBlank() && !signProps["keyAlias"].isNullOrBlank()

if (keystorePropsFile.exists() && !signReady) {
    logger.warn(
        """

        ============ هشدار امضای برنامه ============
        فایل keystore.properties هست ولی کامل نیست.
        مسیر کلید: ${storeFileResolved?.absolutePath ?: "(خالی)"}
        پس نسخه release بدون امضا ساخته می‌شود.
        ===========================================

        """.trimIndent()
    )
}

android {
    namespace = "com.smrx.sultan"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.smrx.sultan"
        minSdk = 24
        targetSdk = 36
        versionCode = 3
        versionName = "1.2"
    }

    signingConfigs {
        if (signReady) {
            create("release") {
                storeFile = storeFileResolved
                storePassword = signProps["storePassword"]
                keyAlias = signProps["keyAlias"]
                keyPassword = signProps["keyPassword"] ?: signProps["storePassword"]
            }
        }
    }

    buildTypes {
        release {
            if (signReady) signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
}
