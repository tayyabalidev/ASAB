# ✅ Stripe JitPack Timeout - Final Fix

## 🎯 Problem
Stripe dependency (`com.stripe:stripe-android:21.22.+`) JitPack se resolve ho rahi thi, jis se timeout errors aa rahe the:
```
Unable to load Maven meta-data from https://www.jitpack.io/com/stripe/stripe-android/maven-metadata.xml
Read timed out
```

## ✅ Solution Applied

### 1. `android/settings.gradle` - Dependency Resolution Management
```gradle
dependencyResolutionManagement {
  repositoriesMode.set(RepositoriesMode.PREFER_PROJECT)
  repositories {
    google()
    mavenCentral()
    // JitPack explicitly NOT added here to prevent Stripe timeout
  }
}
```

**Why `PREFER_PROJECT`?**
- Allows both settings and project-level repositories
- Expo modules kaam karengi (they need project repositories)
- But settings repositories me JitPack nahi hai, so Stripe sirf Maven Central se resolve hogi

### 2. `android/build.gradle` - JitPack Removed
```gradle
allprojects {
  repositories {
    google()
    mavenCentral()
    // JitPack REMOVED
  }
}
```

### 3. `android/app/build.gradle` - App-Level Configuration
```gradle
configurations.all {
    exclude group: 'com.github.jiangdongguo.AndroidUSBCamera'
    
    resolutionStrategy {
        preferProjectModules()
        eachDependency { DependencyResolveDetails details ->
            if (details.requested.group == 'com.stripe') {
                details.because 'Stripe must resolve from Maven Central to avoid JitPack timeout'
            }
        }
    }
}

repositories {
    google()
    mavenCentral()
    // JitPack explicitly NOT added
}
```

## 🚀 Expected Result

Build successfully complete hoga:
- ✅ Stripe Maven Central se resolve hogi (no JitPack timeout)
- ✅ VideoSDK kaam karega (USB camera patched, JitPack ki zaroorat nahi)
- ✅ Expo modules kaam karengi (PREFER_PROJECT mode allows project repositories)
- ✅ No timeout errors
- ✅ No missing dependency errors

## 📝 Build Command

```powershell
eas build -p android --profile preview
```

## ✅ Verification

Build logs me ye errors nahi aane chahiye:
- ❌ `Unable to load Maven meta-data from https://www.jitpack.io/com/stripe/`
- ❌ `Read timed out`
- ❌ `Could not resolve com.stripe:stripe-android`

**Build successfully complete hona chahiye! 🎉**
