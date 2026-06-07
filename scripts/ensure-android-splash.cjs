/**
 * Keeps Android native launch splash as a solid background only (no centered logo).
 * Full-screen splash imagery is handled in JS (components/SplashScreen.jsx).
 */
const fs = require("fs");
const path = require("path");

const launcherBackgroundPath = path.join(
  __dirname,
  "..",
  "android",
  "app",
  "src",
  "main",
  "res",
  "drawable",
  "ic_launcher_background.xml"
);

const BACKGROUND_ONLY = `<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item android:drawable="@color/splashscreen_background"/>
</layer-list>
`;

if (!fs.existsSync(launcherBackgroundPath)) {
  console.log("[ensure-android-splash] ic_launcher_background.xml missing — skipping.");
  process.exit(0);
}

const current = fs.readFileSync(launcherBackgroundPath, "utf8");
if (current.trim() !== BACKGROUND_ONLY.trim()) {
  fs.writeFileSync(launcherBackgroundPath, BACKGROUND_ONLY);
  console.log("[ensure-android-splash] Removed centered splash logo from native launch background.");
} else {
  console.log("[ensure-android-splash] Native launch background already background-only.");
}
