/**
 * Keeps Android notification icons aligned with asabicon.png after prebuild/EAS.
 */
const fs = require("fs");
const path = require("path");

const iconSource = path.join(__dirname, "..", "assets", "images", "asabicon.png");
const densities = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];

if (!fs.existsSync(iconSource)) {
  console.log("[ensure-android-icon] asabicon.png missing — skipping.");
  process.exit(0);
}

let updated = 0;
for (const density of densities) {
  const target = path.join(
    __dirname,
    "..",
    "android",
    "app",
    "src",
    "main",
    "res",
    `drawable-${density}`,
    "notification_icon.png"
  );
  if (!fs.existsSync(path.dirname(target))) continue;
  fs.copyFileSync(iconSource, target);
  updated += 1;
}

console.log(
  updated
    ? `[ensure-android-icon] Synced asabicon.png to ${updated} Android density buckets.`
    : "[ensure-android-icon] No Android notification icon targets found."
);
