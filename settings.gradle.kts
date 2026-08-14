// ---------------------------------------------------------------------
// «سلطان معما» — ساخته تیم SMRx
// اگر اینترنت تو به سرورهای گوگل (dl.google.com) دسترسی ندارد،
// در فایل gradle.properties مقدار useIranMirror را true کن تا
// کتابخانه‌ها از یک آینه داخلی گرفته شوند.
// ---------------------------------------------------------------------
val useIranMirror = providers.gradleProperty("useIranMirror").orNull.toBoolean()
val mirrorUrl = "https://en-mirror.ir"

pluginManagement {
    val useMirror = providers.gradleProperty("useIranMirror").orNull.toBoolean()
    repositories {
        if (useMirror) {
            maven { url = uri("https://en-mirror.ir") }
        }
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        if (useIranMirror) {
            maven { url = uri(mirrorUrl) }
        }
        google()
        mavenCentral()
    }
}

rootProject.name = "SultanMoamma"
include(":app")
