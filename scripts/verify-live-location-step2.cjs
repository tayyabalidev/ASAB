#!/usr/bin/env node
/**
 * Step 2 static verification — Friends Live Location (maps + permissions).
 * Usage: node scripts/verify-live-location-step2.cjs
 *
 * Cannot exercise real GPS/map rendering without a device/emulator build.
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
function warn(msg) {
  console.log(`⚠️  ${msg}`);
}
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}
function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

console.log('Friends Live Location — Step 2 verification\n');

const pkg = JSON.parse(read('package.json'));
if (pkg.dependencies['react-native-maps']) {
  pass(`react-native-maps dependency: ${pkg.dependencies['react-native-maps']}`);
} else fail('react-native-maps missing from package.json');

if (pkg.dependencies['expo-location']) {
  pass(`expo-location dependency: ${pkg.dependencies['expo-location']}`);
} else fail('expo-location missing from package.json');

if (exists('node_modules/react-native-maps/package.json')) {
  pass('react-native-maps installed in node_modules');
} else fail('react-native-maps not installed — run npx expo install react-native-maps');

if (exists('node_modules/expo-location/package.json')) {
  pass('expo-location installed in node_modules');
} else fail('expo-location not installed');

const app = JSON.parse(read('app.json')).expo;
const plugins = app.plugins || [];
const locPlugin = plugins.find((p) =>
  Array.isArray(p) ? p[0] === 'expo-location' : p === 'expo-location'
);
if (locPlugin) pass('expo-location plugin configured in app.json');
else fail('expo-location plugin missing from app.json');

if (locPlugin?.[1]?.isIosBackgroundLocationEnabled === false) {
  pass('iOS background location disabled (correct for Step 2)');
}
if (locPlugin?.[1]?.isAndroidBackgroundLocationEnabled === false) {
  pass('Android background location disabled (correct for Step 2)');
}

if (app.ios?.infoPlist?.NSLocationWhenInUseUsageDescription) {
  pass('iOS NSLocationWhenInUseUsageDescription set');
} else fail('Missing NSLocationWhenInUseUsageDescription');

if (app.ios?.infoPlist?.NSLocationAlwaysAndWhenInUseUsageDescription) {
  pass('iOS NSLocationAlwaysAndWhenInUseUsageDescription set');
} else fail('Missing NSLocationAlwaysAndWhenInUseUsageDescription');

const perms = app.android?.permissions || [];
if (perms.includes('android.permission.ACCESS_FINE_LOCATION')) {
  pass('Android ACCESS_FINE_LOCATION present');
} else fail('Missing ACCESS_FINE_LOCATION');
if (perms.includes('android.permission.ACCESS_COARSE_LOCATION')) {
  pass('Android ACCESS_COARSE_LOCATION present');
} else fail('Missing ACCESS_COARSE_LOCATION');

const files = [
  'app/live-map/index.jsx',
  'lib/locationPermissions.js',
  'docs/FRIENDS_LIVE_LOCATION_STEP2.md',
];
for (const f of files) {
  if (exists(f)) pass(`${f} exists`);
  else fail(`${f} missing`);
}

const layout = read('app/_layout.jsx');
if (layout.includes('live-map/index')) pass('Root stack registers live-map/index');
else fail('live-map/index not registered in app/_layout.jsx');

const friends = read('app/(tabs)/friends.jsx');
if (friends.includes('/live-map') && friends.includes('Live Map')) {
  pass('Friends tab has Live Map entry');
} else fail('Friends tab missing Live Map entry');

const live = read('app/live-map/index.jsx');
if (live.includes('react-native-maps') && live.includes('MapView')) {
  pass('live-map screen uses MapView');
} else fail('live-map screen missing MapView');
if (live.includes('watchForegroundLocation')) {
  pass('live-map uses watchForegroundLocation');
} else fail('live-map missing location watch');
if (live.includes('userInterfaceStyle') && live.includes('DARK_MAP_STYLE')) {
  pass('light/dark map styling present');
} else fail('light/dark map styling incomplete');

const helper = read('lib/locationPermissions.js');
for (const name of [
  'requestForegroundLocationPermission',
  'watchForegroundLocation',
  'reverseGeocodeLabel',
]) {
  if (helper.includes(`function ${name}`) || helper.includes(`async function ${name}`)) {
    pass(`helper exports logic for ${name}`);
  } else fail(`helper missing ${name}`);
}

const appwrite = read('lib/appwrite.js');
if (appwrite.includes('userLocationsCollectionId') && appwrite.includes('6a74d4660024fc37b862')) {
  pass('userLocationsCollectionId wired in appwriteConfig');
} else fail('userLocationsCollectionId not wired');

const cfg = read('app.config.js');
if (cfg.includes('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY') && cfg.includes('googleMaps')) {
  pass('app.config.js wires Google Maps API key');
} else fail('app.config.js missing Google Maps wiring');

// Load resolved Expo config
let resolved;
try {
  // Clear cache in case
  const configPath = path.join(root, 'app.config.js');
  delete require.cache[require.resolve(configPath)];
  resolved = require(configPath)();
} catch (e) {
  fail(`Could not evaluate app.config.js: ${e.message}`);
}

if (resolved) {
  const rPlugins = resolved.expo?.plugins || [];
  const rLoc = rPlugins.find((p) =>
    Array.isArray(p) ? p[0] === 'expo-location' : p === 'expo-location'
  );
  if (rLoc) pass('Resolved config includes expo-location plugin');
  else fail('Resolved config missing expo-location plugin');

  const hasAndroidKey = !!resolved.expo?.android?.config?.googleMaps?.apiKey;
  const hasIosKey = !!resolved.expo?.ios?.config?.googleMapsApiKey;
  if (hasAndroidKey) pass('Google Maps API key present for Android in resolved config');
  else {
    warn('No EXPO_PUBLIC_GOOGLE_MAPS_API_KEY — Android map tiles may be blank until you add it');
  }
  if (hasIosKey) pass('Google Maps API key present for iOS in resolved config');
  else {
    pass('iOS can use Apple Maps without Google key (OK for Step 2)');
  }
}

console.log('\n--- Runtime note ---');
console.log('This script cannot open the device map or GPS from Cursor.');
console.log('On a rebuilt development client:');
console.log('  Friends → Live Map → allow location → confirm green pin.');
console.log('');

if (failed) {
  console.log(`Step 2 verification FAILED (${failed} issue(s)).`);
  process.exit(1);
}
console.log('Step 2 static verification PASSED.');
console.log('Next: rebuild native app and manually confirm map + GPS on device.');
process.exit(0);
