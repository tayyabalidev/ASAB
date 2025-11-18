# 🚀 Easiest Method to Fix Agora SDK Linking

## **Method 1: Using Expo Prebuild (EASIEST - Recommended)**

This is the simplest method that handles everything automatically:

### Step 1: Generate/Update Native Folders
```bash
npx expo prebuild --clean
```

This command will:
- Generate `ios/` and `android/` folders if they don't exist
- Link all native modules including `react-native-agora`
- Configure everything automatically

### Step 2: Install iOS Dependencies (if testing on iOS)
```bash
cd ios
pod install
cd ..
```

### Step 3: Rebuild the App

**For iOS:**
```bash
npx expo run:ios
```

**For Android:**
```bash
npx expo run:android
```

That's it! The app will rebuild with Agora SDK properly linked.

---

## **Method 2: Manual Linking (If Method 1 doesn't work)**

### For iOS:
```bash
cd ios
pod install
cd ..
npx expo run:ios
```

### For Android:
```bash
npx expo run:android
```

---

## **Method 3: Using EAS Build (For Production/Testing)**

If you want to build for a physical device without Xcode/Android Studio:

1. Install EAS CLI:
```bash
npm install -g eas-cli
```

2. Login:
```bash
eas login
```

3. Configure:
```bash
eas build:configure
```

4. Build:
```bash
# For iOS
eas build --platform ios --profile development

# For Android
eas build --platform android --profile development
```

---

## ⚠️ Important Notes:

1. **Cannot use Expo Go** - `react-native-agora` requires native modules, so you MUST use a development build
2. **First build takes longer** - The first build after linking can take 5-10 minutes
3. **Physical device recommended** - Live streaming works best on real devices

---

## ✅ Quick Test After Setup:

Once the app rebuilds successfully:
1. Open the app
2. Go to "Go Live" or watch a live stream
3. You should see the live video instead of the error message

---

## 🐛 Troubleshooting:

**If `npx expo prebuild` fails:**
- Make sure you have the latest Expo CLI: `npm install -g @expo/cli`
- Clear cache: `npx expo start --clear`

**If pod install fails (iOS):**
- Update CocoaPods: `sudo gem install cocoapods`
- Clear pod cache: `cd ios && rm -rf Pods Podfile.lock && pod install`

**If build fails:**
- Make sure you have Xcode (iOS) or Android Studio (Android) installed
- Check that all dependencies are installed: `npm install`


