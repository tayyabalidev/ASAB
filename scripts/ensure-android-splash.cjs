/**
 * Keeps Android native splash logos aligned with splash1.png after prebuild/EAS.
 */
const fs = require("fs");
const path = require("path");

const splashSource = path.join(__dirname, "..", "assets", "images", "splash1.png");
const densities = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];

if (!fs.existsSync(splashSource)) {
  console.log("[ensure-android-splash] splash1.png missing — skipping.");
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
    "splashscreen_logo.png"
  );
  if (!fs.existsSync(path.dirname(target))) continue;
  fs.copyFileSync(splashSource, target);
  updated += 1;
}

console.log(
  updated
    ? `[ensure-android-splash] Synced splash1.png to ${updated} Android density buckets.`
    : "[ensure-android-splash] No Android splash targets found."
);
