#!/usr/bin/env node
/**
 * Step 5 static checks — background location + notifications wiring.
 * Usage: node scripts/verify-live-location-step5.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let failed = 0;

function pass(msg) {
  console.log(`✅ ${msg}`);
}
function fail(msg) {
  console.log(`❌ ${msg}`);
  failed += 1;
}

console.log('Friends Live Location — Step 5 verification\n');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.dependencies['expo-task-manager']) {
  pass(`expo-task-manager: ${pkg.dependencies['expo-task-manager']}`);
} else fail('expo-task-manager missing');

if (fs.existsSync(path.join(root, 'node_modules/expo-task-manager/package.json'))) {
  pass('expo-task-manager installed');
} else fail('expo-task-manager not installed');

const files = [
  'lib/locationBackground.js',
  'lib/locationSharingPrefs.js',
  'lib/locationSharingSession.js',
  'lib/locationNotifications.js',
  'docs/FRIENDS_LIVE_LOCATION_STEP5.md',
];
for (const f of files) {
  if (fs.existsSync(path.join(root, f))) pass(`${f} exists`);
  else fail(`${f} missing`);
}

const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
const bgModes = app.ios?.infoPlist?.UIBackgroundModes || [];
if (bgModes.includes('location')) pass('iOS UIBackgroundModes includes location');
else fail('iOS missing location background mode');

const perms = app.android?.permissions || [];
if (perms.includes('android.permission.ACCESS_BACKGROUND_LOCATION')) {
  pass('Android ACCESS_BACKGROUND_LOCATION');
} else fail('Android missing ACCESS_BACKGROUND_LOCATION');
if (perms.includes('android.permission.FOREGROUND_SERVICE_LOCATION')) {
  pass('Android FOREGROUND_SERVICE_LOCATION');
} else fail('Android missing FOREGROUND_SERVICE_LOCATION');

const locPlugin = (app.plugins || []).find((p) =>
  Array.isArray(p) ? p[0] === 'expo-location' : p === 'expo-location'
);
if (locPlugin?.[1]?.isIosBackgroundLocationEnabled === true) {
  pass('expo-location iOS background enabled');
} else fail('expo-location iOS background not enabled');
if (locPlugin?.[1]?.isAndroidBackgroundLocationEnabled === true) {
  pass('expo-location Android background enabled');
} else fail('expo-location Android background not enabled');

const layout = fs.readFileSync(path.join(root, 'app/_layout.jsx'), 'utf8');
if (layout.includes("locationBackground")) pass('_layout imports locationBackground');
else fail('_layout missing locationBackground import');

const live = fs.readFileSync(path.join(root, 'app/live-map/index.jsx'), 'utf8');
for (const needle of [
  'enableLocationSharingSession',
  'disableLocationSharingSession',
  'checkAndNotifyNearbyFriends',
]) {
  if (live.includes(needle)) pass(`live-map uses ${needle}`);
  else fail(`live-map missing ${needle}`);
}

const push = fs.readFileSync(path.join(root, 'lib/pushNotificationService.js'), 'utf8');
if (push.includes('location_share') && push.includes('location_nearby')) {
  pass('push handler alerts for location types');
} else fail('push handler missing location types');

const nav = fs.readFileSync(path.join(root, 'lib/notificationNavigation.js'), 'utf8');
if (nav.includes('location_share') && nav.includes('/live-map')) {
  pass('notification navigation opens live-map');
} else fail('notification navigation missing live-map');

const schema = fs.readFileSync(path.join(root, 'lib/locationSchema.js'), 'utf8');
if (schema.includes('LOCATION_NEARBY_RADIUS_M') && schema.includes('LOCATION_BG_TASK_NAME')) {
  pass('schema has nearby + background constants');
} else fail('schema missing Step 5 constants');

console.log('');
if (failed) {
  console.log(`Step 5 verification FAILED (${failed})`);
  process.exit(1);
}
console.log('Step 5 static verification PASSED.');
console.log('Rebuild native app before testing background GPS.');
process.exit(0);
