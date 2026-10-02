#!/usr/bin/env node
/**
 * Verify ASAB Circles Appwrite schema (collections + attributes + indexes).
 *
 * Usage (from project root):
 *   node scripts/verify-circles-schema.cjs
 *
 * Loads server/.env + .env for APPWRITE_API_KEY and collection IDs.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

const root = path.join(__dirname, '..');
loadEnvFile(path.join(root, '.env'));
loadEnvFile(path.join(root, 'server', '.env'));

const endpoint = (
  process.env.APPWRITE_ENDPOINT ||
  process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT ||
  'https://nyc.cloud.appwrite.io/v1'
).replace(/\/$/, '');
const projectId =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID ||
  '6854922e0036a1e8dee6';
const apiKey = process.env.APPWRITE_API_KEY || '';
const databaseId =
  process.env.APPWRITE_DATABASE_ID ||
  process.env.EXPO_PUBLIC_APPWRITE_DATABASE_ID ||
  '685494a1002f8417c2b2';

const COLLECTIONS = {
  circles:
    process.env.EXPO_PUBLIC_CIRCLES_COLLECTION_ID ||
    process.env.APPWRITE_CIRCLES_COLLECTION_ID ||
    '6abc123b0031a48ca183',
  circleMembers:
    process.env.EXPO_PUBLIC_CIRCLE_MEMBERS_COLLECTION_ID ||
    process.env.APPWRITE_CIRCLE_MEMBERS_COLLECTION_ID ||
    '6abc14db000b5a73a03e',
  circleEvents:
    process.env.EXPO_PUBLIC_CIRCLE_EVENTS_COLLECTION_ID ||
    process.env.APPWRITE_CIRCLE_EVENTS_COLLECTION_ID ||
    '6abd52b900061e9918a8',
  videos:
    process.env.APPWRITE_VIDEO_COLLECTION_ID ||
    process.env.EXPO_PUBLIC_VIDEO_COLLECTION_ID ||
    '685494f9001c3ccb2ba2',
  photos:
    process.env.EXPO_PUBLIC_PHOTO_COLLECTION_ID ||
    process.env.APPWRITE_PHOTO_COLLECTION_ID ||
    '691cb9d500277594ea2d',
  circleTextPosts:
    process.env.EXPO_PUBLIC_CIRCLE_TEXT_POSTS_COLLECTION_ID ||
    '6abf905e001c06130427',
};

const EXPECTED = {
  circles: {
    required: [
      'name',
      'slug',
      'description',
      'tagline',
      'avatar',
      'banner',
      'tags',
      'filterKeys',
      'icon',
      'memberCount',
      'creatorId',
      'visibility',
    ],
    optional: ['createdAt'],
    indexHints: ['slug', 'memberCount'],
  },
  circleMembers: {
    required: [
      'circleId',
      'userId',
      'username',
      'avatar',
      'role',
      'joinedAt',
    ],
    indexHints: ['circleId', 'userId'],
  },
  circleEvents: {
    required: [
      'circleId',
      'title',
      'note',
      'placeLabel',
      'startsAt',
      'whenLabel',
      'creatorId',
      'creatorUsername',
      'creatorAvatar',
      'createdAt',
      'rsvpUserIds',
      'rsvpUsernames',
    ],
    indexHints: ['circleId', 'startsAt'],
  },
  videos: {
    required: ['circleId'],
    optionalExtra: true,
    indexHints: ['circleId'],
  },
  photos: {
    required: ['circleId'],
    optionalExtra: true,
    indexHints: ['circleId'],
  },
  circleTextPosts: {
    required: [
      'circleId',
      'body',
      'title',
      'creatorId',
      'creatorUsername',
      'creatorAvatar',
      'createdAt',
    ],
    indexHints: ['circleId'],
  },
};

let failures = 0;
let warnings = 0;

function ok(msg) {
  console.log(`✅ ${msg}`);
}
function warn(msg) {
  warnings += 1;
  console.log(`⚠️  ${msg}`);
}
function fail(msg) {
  failures += 1;
  console.log(`❌ ${msg}`);
}
function info(msg) {
  console.log(`   ${msg}`);
}

function headers() {
  return {
    'X-Appwrite-Project': projectId,
    'X-Appwrite-Key': apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function getJson(url) {
  const res = await fetch(url, { headers: headers() });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data, text };
}

async function listAllAttributes(collectionId) {
  const attrs = [];
  let total = null;
  let offset = 0;
  const limit = 100;
  while (true) {
    const url = `${endpoint}/databases/${databaseId}/collections/${collectionId}/attributes?limit=${limit}&offset=${offset}`;
    const res = await getJson(url);
    if (!res.ok) return { ok: false, status: res.status, data: res.data, attrs: [] };
    const batch = res.data?.attributes || [];
    attrs.push(...batch);
    total = typeof res.data?.total === 'number' ? res.data.total : attrs.length;
    if (attrs.length >= total || batch.length < limit) break;
    offset += limit;
  }
  return { ok: true, attrs };
}

async function listIndexes(collectionId) {
  const url = `${endpoint}/databases/${databaseId}/collections/${collectionId}/indexes?limit=100`;
  const res = await getJson(url);
  if (!res.ok) return { ok: false, status: res.status, indexes: [], data: res.data };
  return { ok: true, indexes: res.data?.indexes || [] };
}

async function getCollection(collectionId) {
  const url = `${endpoint}/databases/${databaseId}/collections/${collectionId}`;
  return getJson(url);
}

async function listDocuments(collectionId, limit = 5) {
  const url = `${endpoint}/databases/${databaseId}/collections/${collectionId}/documents?limit=${limit}`;
  return getJson(url);
}

function attrKey(a) {
  return a?.key || a?.$id || '';
}

function indexCovers(indexes, attribute) {
  return (indexes || []).some((idx) => {
    const keys = idx.attributes || idx.keys || [];
    return keys.map(String).includes(String(attribute));
  });
}

function indexMisnamed(indexes, attribute) {
  return (indexes || []).some((idx) => {
    const name = String(idx.key || idx.$id || '');
    const keys = (idx.attributes || idx.keys || []).map(String);
    return name === attribute && !keys.includes(attribute);
  });
}

async function verifyCollection(label, collectionId, spec) {
  console.log(`\n—— ${label} (${collectionId}) ——`);
  const col = await getCollection(collectionId);
  if (!col.ok) {
    fail(`Collection not reachable (HTTP ${col.status})`);
    info(JSON.stringify(col.data?.message || col.data || {}).slice(0, 200));
    return;
  }
  ok(`Collection exists: ${col.data?.name || label}`);

  const { ok: attrsOk, attrs, status, data } = await listAllAttributes(collectionId);
  if (!attrsOk) {
    fail(`Could not list attributes (HTTP ${status})`);
    info(JSON.stringify(data?.message || data || {}).slice(0, 200));
    return;
  }

  const keys = new Set(attrs.map(attrKey).filter(Boolean));
  info(`Attributes (${keys.size}): ${[...keys].sort().join(', ') || '(none)'}`);

  const missing = (spec.required || []).filter((k) => !keys.has(k));
  if (missing.length) {
    if (spec.optionalExtra) {
      fail(`Missing required for Circles: ${missing.join(', ')}`);
      info('Add optional String attribute `circleId` (size 36) on this collection.');
    } else {
      fail(`Missing attributes: ${missing.join(', ')}`);
    }
  } else {
    ok(`All expected attributes present (${spec.required.length})`);
  }

  const idxRes = await listIndexes(collectionId);
  if (!idxRes.ok) {
    warn(`Could not list indexes (HTTP ${idxRes.status})`);
  } else {
    const indexNames = idxRes.indexes.map((i) => i.key || i.$id).filter(Boolean);
    info(`Indexes: ${indexNames.join(', ') || '(none)'}`);
    for (const hint of spec.indexHints || []) {
      if (indexCovers(idxRes.indexes, hint)) {
        ok(`Index covers \`${hint}\``);
      } else if (indexMisnamed(idxRes.indexes, hint)) {
        fail(
          `Index named \`${hint}\` exists but indexes the wrong attribute(s) — recreate it on \`${hint}\``
        );
      } else {
        warn(`No index including \`${hint}\` (queries may be slow / fail at scale)`);
      }
    }
  }

  const docs = await listDocuments(collectionId, 3);
  if (docs.ok) {
    ok(`Documents readable (total≈${docs.data?.total ?? '?'}, sample=${(docs.data?.documents || []).length})`);
  } else {
    warn(`Could not list documents (HTTP ${docs.status}) — check API key scopes`);
  }
}

async function main() {
  console.log('ASAB Circles schema verification');
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Project:  ${projectId}`);
  console.log(`Database: ${databaseId}`);

  if (!apiKey) {
    fail('APPWRITE_API_KEY not set — cannot verify remotely.');
    info('Add APPWRITE_API_KEY to server/.env (Appwrite Console → API Keys).');
    process.exit(1);
  }
  ok('APPWRITE_API_KEY loaded');

  await verifyCollection('circles', COLLECTIONS.circles, EXPECTED.circles);
  await verifyCollection('circleMembers', COLLECTIONS.circleMembers, EXPECTED.circleMembers);
  await verifyCollection('circleEvents', COLLECTIONS.circleEvents, EXPECTED.circleEvents);
  await verifyCollection('videos (+circleId)', COLLECTIONS.videos, EXPECTED.videos);
  await verifyCollection('photos (+circleId)', COLLECTIONS.photos, EXPECTED.photos);
  await verifyCollection(
    'circleTextPosts',
    COLLECTIONS.circleTextPosts,
    EXPECTED.circleTextPosts
  );

  console.log('\n—— Summary ——');
  if (failures === 0 && warnings === 0) {
    console.log('✅ All Circles schema checks passed.');
    process.exit(0);
  }
  if (failures === 0) {
    console.log(`⚠️  Passed with ${warnings} warning(s). App should work; add indexes when you can.`);
    process.exit(0);
  }
  console.log(`❌ ${failures} failure(s), ${warnings} warning(s). Fix missing attributes in Appwrite Console.`);
  process.exit(1);
}

main().catch((err) => {
  fail(err?.message || String(err));
  process.exit(1);
});
