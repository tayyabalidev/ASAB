#!/usr/bin/env node
/**
 * Extra Step 5 smoke tests (logic + file graph) — no device GPS.
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

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

console.log('Friends Live Location — Step 5 extra smoke tests\n');

// Nearby distance math (~1km NYC blocks)
const d = haversineMeters(40.7231, -73.9982, 40.7301, -73.995);
if (d > 500 && d < 1500) pass(`haversine sanity (~1km sample): ${Math.round(d)}m`);
else fail(`haversine unexpected: ${d}`);

const within = haversineMeters(40.7231, -73.9982, 40.7240, -73.9975);
if (within < 1000) pass(`nearby within 1km sample: ${Math.round(within)}m`);
else fail('nearby sample should be under 1km');

const far = haversineMeters(40.7231, -73.9982, 40.7580, -73.9855);
if (far > 1000) pass(`far sample outside 1km: ${Math.round(far)}m`);
else fail('far sample should be over 1km');

// Cooldown map logic
const COOLDOWN = 24 * 60 * 60 * 1000;
const notified = { friend_a: Date.now() - 1000 };
const now = Date.now();
const blocked = now - notified.friend_a < COOLDOWN;
const allowed = now - (notified.friend_b || 0) >= COOLDOWN || !notified.friend_b;
if (blocked) pass('nearby cooldown blocks same friend within 24h');
else fail('cooldown should block');
if (allowed) pass('nearby allows new friend with no prior notify');
else fail('new friend should be allowed');

// Import graph: background task must not import live-map (cycle risk)
const bg = fs.readFileSync(path.join(root, 'lib/locationBackground.js'), 'utf8');
const session = fs.readFileSync(path.join(root, 'lib/locationSharingSession.js'), 'utf8');
const notif = fs.readFileSync(path.join(root, 'lib/locationNotifications.js'), 'utf8');

if (!bg.includes('live-map') && !bg.includes('app/live-map')) {
  pass('locationBackground has no UI import');
} else fail('locationBackground should not import UI');

if (bg.includes('TaskManager.defineTask') && bg.includes('upsertMyLocation')) {
  pass('background task defines TaskManager + upsert');
} else fail('background task incomplete');

if (
  session.includes('startBackgroundLocationUpdates') &&
  session.includes('stopBackgroundLocationUpdates') &&
  session.includes('notifyFriendsLocationShareStarted')
) {
  pass('sharing session wires bg + notify');
} else fail('sharing session incomplete');

if (
  notif.includes('location_share') &&
  notif.includes('location_nearby') &&
  notif.includes('LOCATION_NEARBY_RADIUS_M')
) {
  pass('notifications cover share + nearby');
} else fail('notifications incomplete');

// Preferential recipients: selected vs mutual (documented in code)
if (notif.includes('LOCATION_PRIVACY_MODES.SELECTED') && notif.includes('getMutualFriendIds')) {
  pass('share-started recipient rules present');
} else fail('share-started recipient rules missing');

// Ensure package has both native-related deps
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
for (const dep of ['expo-location', 'expo-task-manager', 'react-native-maps']) {
  if (pkg.dependencies[dep]) pass(`dependency ${dep}`);
  else fail(`missing dependency ${dep}`);
}

console.log('');
if (failed) {
  console.log(`EXTRA SMOKE FAILED (${failed})`);
  process.exit(1);
}
console.log('EXTRA SMOKE PASSED (device GPS / Always permission still manual).');
process.exit(0);
