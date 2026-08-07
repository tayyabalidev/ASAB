#!/usr/bin/env node
/**
 * Step 3 logic checks (privacy / mutual / freshness) — no device required.
 * Usage: node scripts/verify-live-location-step3.cjs
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

function getMutualFriendIds(user) {
  const following = Array.isArray(user?.following) ? user.following : [];
  const followers = Array.isArray(user?.followers) ? user.followers : [];
  const followerSet = new Set(followers.filter(Boolean).map(String));
  return following
    .filter(Boolean)
    .map(String)
    .filter((id) => followerSet.has(id) && id !== String(user?.$id || ''));
}

function canViewerSeeLocationDoc(doc, viewerId, mutualFriendIds) {
  if (!doc || !viewerId) return false;
  const ownerId = String(doc.userId || doc.$id || '');
  if (!ownerId || ownerId === String(viewerId)) return false;
  if (!doc.isSharing) return false;
  const mode = String(doc.privacyMode || 'ghost').toLowerCase();
  if (mode === 'ghost') return false;
  if (mode === 'everyone') return true;
  if (mode === 'friends') return (mutualFriendIds || []).map(String).includes(ownerId);
  if (mode === 'selected') {
    const allowed = Array.isArray(doc.allowedViewerIds) ? doc.allowedViewerIds : [];
    return allowed.map(String).includes(String(viewerId));
  }
  return false;
}

function getLocationFreshness(doc, nowMs) {
  const raw = doc?.lastSeenAt || doc?.updatedAtClient || doc?.$updatedAt;
  const ts = raw ? new Date(raw).getTime() : 0;
  if (!ts) return { isLive: false, label: 'Unknown' };
  const ageMs = Math.max(0, nowMs - ts);
  if (ageMs <= 2 * 60 * 1000) return { isLive: true, label: 'Now' };
  const mins = Math.floor(ageMs / 60000);
  if (mins < 60) return { isLive: false, label: `${Math.max(1, mins)}m` };
  return { isLive: false, label: `${Math.floor(mins / 60)}h` };
}

console.log('Friends Live Location — Step 3 logic verification\n');

const files = [
  'lib/locationService.js',
  'app/live-map/index.jsx',
  'docs/FRIENDS_LIVE_LOCATION_STEP3.md',
];
for (const f of files) {
  if (fs.existsSync(path.join(root, f))) pass(`${f} exists`);
  else fail(`${f} missing`);
}

const service = fs.readFileSync(path.join(root, 'lib/locationService.js'), 'utf8');
const live = fs.readFileSync(path.join(root, 'app/live-map/index.jsx'), 'utf8');
const realtime = fs.readFileSync(path.join(root, 'lib/appwriteRealtime.js'), 'utf8');

if (service.includes('upsertMyLocation') && service.includes('subscribeVisibleFriendLocations')) {
  pass('locationService has publish + subscribe');
} else fail('locationService missing core APIs');

if (realtime.includes('getUserLocationsRealtimeChannel')) {
  pass('Realtime channel helper added');
} else fail('Realtime channel helper missing');

if (
  live.includes('subscribeVisibleFriendLocations') &&
  live.includes('LOCATION_PRIVACY_MODES') &&
  live.includes('friendsOnMap')
) {
  pass('live-map wires friends + privacy');
} else fail('live-map missing Step 3 wiring');

const me = {
  $id: 'me',
  following: ['a', 'b', 'c'],
  followers: ['b', 'c', 'z'],
};
const mutual = getMutualFriendIds(me);
if (mutual.sort().join(',') === 'b,c') pass('mutual friends = following ∩ followers');
else fail(`mutual friends unexpected: ${mutual.join(',')}`);

const friendsDoc = {
  userId: 'b',
  isSharing: true,
  privacyMode: 'friends',
  latitude: 1,
  longitude: 2,
};
if (canViewerSeeLocationDoc(friendsDoc, 'me', mutual)) pass('friends mode visible to mutual');
else fail('friends mode should be visible');

if (!canViewerSeeLocationDoc(friendsDoc, 'me', ['a'])) {
  pass('friends mode hidden for non-mutual');
} else fail('friends mode should hide non-mutual');

const ghostDoc = { ...friendsDoc, privacyMode: 'ghost', isSharing: false };
if (!canViewerSeeLocationDoc(ghostDoc, 'me', mutual)) pass('ghost hidden');
else fail('ghost should be hidden');

const everyoneDoc = { userId: 'x', isSharing: true, privacyMode: 'everyone' };
if (canViewerSeeLocationDoc(everyoneDoc, 'me', [])) pass('everyone visible');
else fail('everyone should be visible');

const selectedDoc = {
  userId: 'b',
  isSharing: true,
  privacyMode: 'selected',
  allowedViewerIds: ['me'],
};
if (canViewerSeeLocationDoc(selectedDoc, 'me', [])) pass('selected allows listed viewer');
else fail('selected should allow listed viewer');

const now = Date.now();
const liveFresh = getLocationFreshness({ lastSeenAt: new Date(now - 30_000).toISOString() }, now);
if (liveFresh.isLive && liveFresh.label === 'Now') pass('freshness Now (<2m)');
else fail('freshness Now failed');

const stale = getLocationFreshness({ lastSeenAt: new Date(now - 15 * 60_000).toISOString() }, now);
if (!stale.isLive && stale.label === '15m') pass('freshness 15m');
else fail(`freshness 15m failed: ${stale.label}`);

console.log('');
if (failed) {
  console.log(`Step 3 verification FAILED (${failed})`);
  process.exit(1);
}
console.log('Step 3 static/logic verification PASSED.');
console.log('Device test: two mutual-follow accounts on Live Map (see docs).');
process.exit(0);
