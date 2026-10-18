plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val keystorePath: String? = System.getenv("BOKRA_KEYSTORE")
val hasKeystore = keystorePath != null && file(keystorePath).exists()

android {
    namespace = "studio.athr.bokra"
    compileSdk = 34

    defaultConfig {
        applicationId = "studio.athr.bokra"
        minSdk = 26
        targetSdk = 34
        versionCode = (System.getenv("BOKRA_VERSION_CODE") ?: "1").toInt()
        versionName = System.getenv("BOKRA_VERSION_NAME") ?: "1.0.0"
    }

    signingConfigs {
        if (hasKeystore) {
            create("bokra") {
                storeFile = file(keystorePath!!)
                storePassword = System.getenv("BOKRA_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("BOKRA_KEY_ALIAS") ?: "bokra"
                keyPassword = System.getenv("BOKRA_KEYSTORE_PASSWORD")
                storeType = "pkcs12"
            }
        }
    }

    // full = the real app; demo = a separate app (own id and storage) that opens the sample-data demo
    flavorDimensions += "mode"
    productFlavors {
        create("full") {
            dimension = "mode"
            resValue("string", "app_name", "BOKRA")
            buildConfigField("String", "START_PAGE", "\"index.html\"")
            buildConfigField("boolean", "DEMO", "false")
        }
        create("demo") {
            dimension = "mode"
            applicationIdSuffix = ".demo"
            versionNameSuffix = "-demo"
            resValue("string", "app_name", "BOKRA Demo")
            buildConfigField("String", "START_PAGE", "\"demo/index.html\"")
            buildConfigField("boolean", "DEMO", "true")
        }
    }
    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (hasKeystore) signingConfigs.getByName("bokra") else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    // the web app (../app) is bundled inside the APK as assets/www
    sourceSets {
        getByName("main") {
            assets.srcDir(layout.buildDirectory.dir("webassets").get().asFile)
        }
    }
}

val copyWeb by tasks.registering(Copy::class) {
    from(rootProject.file("../app"))
    into(layout.buildDirectory.dir("webassets/www"))
    exclude("sw.js")
}
tasks.named("preBuild") { dependsOn(copyWeb) }

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.2")
    implementation("androidx.webkit:webkit:1.11.0")
}
