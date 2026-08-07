#!/usr/bin/env node
/**
 * Step 4 static checks — actions, search, clustering wiring.
 * Usage: node scripts/verify-live-location-step4.cjs
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

console.log('Friends Live Location — Step 4 verification\n');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.dependencies['react-native-map-clustering']) {
  pass(`react-native-map-clustering: ${pkg.dependencies['react-native-map-clustering']}`);
} else fail('react-native-map-clustering missing from package.json');

if (fs.existsSync(path.join(root, 'node_modules/react-native-map-clustering/package.json'))) {
  pass('react-native-map-clustering installed');
} else fail('react-native-map-clustering not in node_modules');

const files = [
  'lib/liveMapActions.js',
  'app/live-map/index.jsx',
  'docs/FRIENDS_LIVE_LOCATION_STEP4.md',
];
for (const f of files) {
  if (fs.existsSync(path.join(root, f))) pass(`${f} exists`);
  else fail(`${f} missing`);
}

const actions = fs.readFileSync(path.join(root, 'lib/liveMapActions.js'), 'utf8');
for (const name of ['openFriendProfile', 'openFriendChat', 'callFriend', 'startOutgoingCall']) {
  if (actions.includes(name)) pass(`liveMapActions references ${name}`);
  else fail(`liveMapActions missing ${name}`);
}

const live = fs.readFileSync(path.join(root, 'app/live-map/index.jsx'), 'utf8');
const checks = [
  ['ClusteredMapView', 'clustering map'],
  ['cluster={false}', 'self pin excluded from cluster'],
  ['searchQuery', 'search state'],
  ['Search for friends', 'search placeholder'],
  ['filteredFriends', 'filtered list'],
  ['actionFriend', 'action sheet state'],
  ['openFriendActions', 'open actions helper'],
  ['View profile', 'profile action'],
  ['Message', 'message action'],
  ['Audio call', 'audio call action'],
  ['Video call', 'video call action'],
];
for (const [needle, label] of checks) {
  if (live.includes(needle)) pass(label);
  else fail(`missing: ${label} (${needle})`);
}

console.log('');
if (failed) {
  console.log(`Step 4 verification FAILED (${failed})`);
  process.exit(1);
}
console.log('Step 4 static verification PASSED.');
process.exit(0);
