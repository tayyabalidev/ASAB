/**
 * Ensures android/app/src/main/res/values/colors.xml defines colors required by
 * native Android resources. Runs on EAS Build (eas-build-post-install) so uploads
 * are not blocked by a stripped colors.xml (e.g. after expo prebuild).
 */
const fs = require("fs");
const path = require("path");

const colorsPath = path.join(
  __dirname,
  "..",
  "android",
  "app",
  "src",
  "main",
  "res",
  "values",
  "colors.xml"
);

if (!fs.existsSync(colorsPath)) {
  console.log("[ensure-android-colors] No colors.xml — skipping.");
  process.exit(0);
}

const REQUIRED = {
  colorPrimary: "#000000",
  colorPrimaryDark: "#000000",
  colorAccent: "#FF4500",
  iconBackground: "#000000",
  splashscreen_background: "#000000",
  notification_icon_color: "#FFFFFF",
};

let content = fs.readFileSync(colorsPath, "utf8");
let changed = false;

for (const [name, hex] of Object.entries(REQUIRED)) {
  if (!new RegExp(`name=["']${name}["']`).test(content)) {
    content = content.replace(
      /<\/resources>/i,
      `  <color name="${name}">${hex}</color>\n</resources>`
    );
    changed = true;
    console.log(`[ensure-android-colors] Added color/${name}`);
  }
}

if (changed) {
  fs.writeFileSync(colorsPath, content);
} else {
  console.log("[ensure-android-colors] All required colors present.");
}
