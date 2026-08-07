#!/usr/bin/env node
/**
 * Verify Appwrite Friends Live Location schema (Step 1).
 *
 * Usage (from project root):
 *   node scripts/verify-user-locations-schema.cjs
 *
 * Requires server/.env or .env with:
 *   APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY,
 *   APPWRITE_DATABASE_ID
 * Optional:
 *   APPWRITE_USER_LOCATIONS_COLLECTION_ID (default: 6a74d4660024fc37b862)
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
const collectionId =
  process.env.APPWRITE_USER_LOCATIONS_COLLECTION_ID ||
  process.env.EXPO_PUBLIC_USER_LOCATIONS_COLLECTION_ID ||
  '6a74d4660024fc37b862';

const REQUIRED_ATTRS = [
  'userId',
  'latitude',
  'longitude',
  'accuracy',
  'heading',
  'speed',
  'altitude',
  'placeLabel',
  'isSharing',
  'privacyMode',
  'allowedViewerIds',
  'lastSeenAt',
  'updatedAtClient',
];

const EXPECTED_INDEXES = ['userId_unique', 'sharing_mode_idx', 'lastSeen_idx'];

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

function parseMissingAttribute(message) {
  const patterns = [
    /Unknown attribute[:\s]+["']?(\w+)["']?/i,
    /Attribute not found[:\s]+["']?(\w+)["']?/i,
    /attribute\s+["'](\w+)["']\s+is not defined/i,
  ];
  for (const pattern of patterns) {
    const match = String(message || '').match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

async function listCollection() {
  const url = `${endpoint}/databases/${databaseId}/collections/${collectionId}`;
  return getJson(url);
}

async function listAttributes() {
  const url = `${endpoint}/databases/${databaseId}/collections/${collectionId}/attributes`;
  return getJson(url);
}

async function listIndexes() {
  const url = `${endpoint}/databases/${databaseId}/collections/${collectionId}/indexes`;
  return getJson(url);
}

function buildProbePayload() {
  const now = new Date().toISOString();
  return {
    userId: `probe_user_${Date.now().toString(36)}`,
    latitude: 40.7231,
    longitude: -73.9982,
    accuracy: 12.5,
    heading: 90,
    speed: 0.5,
    altitude: 10,
    placeLabel: 'Schema probe place',
    isSharing: true,
    privacyMode: 'friends',
    allowedViewerIds: ['probe_viewer_1'],
    lastSeenAt: now,
    updatedAtClient: now,
  };
}

async function createDocument(docId, data) {
  const url = `${endpoint}/databases/${databaseId}/collections/${collectionId}/documents`;
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ documentId: docId, data }),
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_) {
    body = { raw: text };
  }
  return { ok: res.ok, status: res.status, body, text };
}

async function updateDocument(docId, data) {
  const url = `${endpoint}/databases/${databaseId}/collections/${collectionId}/documents/${docId}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ data }),
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_) {
    body = { raw: text };
  }
  return { ok: res.ok, status: res.status, body, text };
}

async function deleteDocument(docId) {
  const url = `${endpoint}/databases/${databaseId}/collections/${collectionId}/documents/${docId}`;
  await fetch(url, { method: 'DELETE', headers: headers() }).catch(() => {});
}

/** Appwrite 1.9+ REST queries are URL-encoded JSON objects. */
function equalQuery(attribute, value) {
  return JSON.stringify({
    method: 'equal',
    attribute,
    values: Array.isArray(value) ? value : [value],
  });
}

async function listDocuments(queries) {
  const qs = (queries || [])
    .map((q) => `queries[]=${encodeURIComponent(q)}`)
    .join('&');
  const url = `${endpoint}/databases/${databaseId}/collections/${collectionId}/documents${
    qs ? `?${qs}` : ''
  }`;
  return getJson(url);
}

function pass(msg) {
  console.log(`✅ ${msg}`);
}
function fail(msg) {
  console.log(`❌ ${msg}`);
}
function info(msg) {
  console.log(`ℹ️  ${msg}`);
}

async function main() {
  console.log('Friends Live Location — Step 1 Appwrite verification\n');
  console.log(`Endpoint:     ${endpoint}`);
  console.log(`Project:      ${projectId}`);
  console.log(`Database:     ${databaseId}`);
  console.log(`Collection:   ${collectionId}\n`);

  if (!apiKey) {
    fail('APPWRITE_API_KEY not set — cannot verify remotely.');
    info('Add APPWRITE_API_KEY to server/.env (Appwrite Console → Overview → API Keys).');
    info('Key needs at least: databases.read, databases.write (collections.read helps).');
    process.exit(1);
  }

  let ok = true;

  // --- Collection exists ---
  const col = await listCollection();
  if (!col.ok) {
    fail(`Collection not reachable (${col.status}): ${col.text.slice(0, 240)}`);
    process.exit(1);
  }
  pass(`Collection exists: ${col.data?.name || collectionId}`);

  // --- Attributes ---
  const attrsRes = await listAttributes();
  let attrKeys = [];
  let attrDetails = [];

  if (attrsRes.ok) {
    attrDetails = attrsRes.data?.attributes || [];
    attrKeys = attrDetails.map((a) => a.key);
    const missing = REQUIRED_ATTRS.filter((k) => !attrKeys.includes(k));
    const notAvailable = attrDetails.filter(
      (a) => REQUIRED_ATTRS.includes(a.key) && a.status && a.status !== 'available'
    );

    if (missing.length) {
      fail(`Missing attributes: ${missing.join(', ')}`);
      ok = false;
    } else {
      pass(`All ${REQUIRED_ATTRS.length} required attributes present`);
    }

    if (notAvailable.length) {
      fail(
        `Attributes not available yet: ${notAvailable
          .map((a) => `${a.key}(${a.status})`)
          .join(', ')}`
      );
      ok = false;
    } else if (!missing.length) {
      pass('All required attributes status = available');
    }

    const allowed = attrDetails.find((a) => a.key === 'allowedViewerIds');
    if (allowed && allowed.array !== true) {
      fail('allowedViewerIds must be an array attribute');
      ok = false;
    } else if (allowed) {
      pass('allowedViewerIds is an array');
    }
  } else {
    info(
      `Cannot list attributes (${attrsRes.status}) — will probe with create/update/delete`
    );
  }

  // --- Indexes ---
  const idxRes = await listIndexes();
  if (idxRes.ok) {
    const indexes = idxRes.data?.indexes || [];
    const names = indexes.map((i) => i.key || i.$id);
    const missingIdx = EXPECTED_INDEXES.filter((n) => !names.includes(n));
    if (missingIdx.length) {
      fail(`Missing indexes: ${missingIdx.join(', ')} (found: ${names.join(', ') || 'none'})`);
      ok = false;
    } else {
      pass(`Indexes present: ${EXPECTED_INDEXES.join(', ')}`);
    }
    const badStatus = indexes.filter(
      (i) => EXPECTED_INDEXES.includes(i.key || i.$id) && i.status && i.status !== 'available'
    );
    if (badStatus.length) {
      fail(
        `Indexes not available: ${badStatus
          .map((i) => `${i.key || i.$id}(${i.status})`)
          .join(', ')}`
      );
      ok = false;
    }
  } else {
    info(`Cannot list indexes (${idxRes.status}) — skipping index check`);
  }

  // --- Document lifecycle tests (A–F style) ---
  const probeUserId = `probe_${Date.now().toString(36)}`;
  const docId = probeUserId;
  const payload = buildProbePayload();
  payload.userId = probeUserId;

  const created = await createDocument(docId, payload);
  if (!created.ok) {
    const missing = parseMissingAttribute(created.text);
    if (missing) {
      fail(`Create failed — missing attribute "${missing}"`);
    } else {
      fail(`Create failed (${created.status}): ${created.text.slice(0, 320)}`);
    }
    ok = false;
  } else {
    pass('Test A: create document OK');

    const updated = await updateDocument(docId, {
      latitude: 40.724,
      longitude: -73.997,
      placeLabel: 'SoHo, New York',
      lastSeenAt: new Date().toISOString(),
    });
    if (!updated.ok) {
      fail(`Test B: update failed (${updated.status}): ${updated.text.slice(0, 240)}`);
      ok = false;
    } else {
      pass('Test B: update (simulate live move) OK');
    }

    const ghost = await updateDocument(docId, {
      isSharing: false,
      privacyMode: 'ghost',
      placeLabel: '',
    });
    if (!ghost.ok) {
      fail(`Test C: ghost mode update failed (${ghost.status}): ${ghost.text.slice(0, 240)}`);
      ok = false;
    } else {
      pass('Test C: ghost mode update OK');
    }

    const selected = await updateDocument(docId, {
      isSharing: true,
      privacyMode: 'selected',
      allowedViewerIds: ['friend_a', 'friend_b'],
      latitude: 40.7231,
      longitude: -73.9982,
      placeLabel: 'Lower East Side, New York',
    });
    if (!selected.ok) {
      fail(`Test D: selected friends update failed (${selected.status}): ${selected.text.slice(0, 240)}`);
      ok = false;
    } else {
      pass('Test D: selected friends (allowedViewerIds) OK');
    }

    // Query by userId
    const qUser = await listDocuments([equalQuery('userId', probeUserId)]);
    if (!qUser.ok) {
      fail(`Test E: query by userId failed (${qUser.status}): ${qUser.text.slice(0, 240)}`);
      ok = false;
    } else {
      const total = qUser.data?.total ?? qUser.data?.documents?.length ?? 0;
      if (total >= 1) pass(`Test E: query by userId OK (total=${total})`);
      else {
        fail('Test E: query by userId returned 0 documents');
        ok = false;
      }
    }

    // Query isSharing = true
    const qShare = await listDocuments([equalQuery('isSharing', true)]);
    if (!qShare.ok) {
      fail(`Test F: query isSharing failed (${qShare.status}): ${qShare.text.slice(0, 240)}`);
      ok = false;
    } else {
      pass(`Test F: query isSharing=true OK (total=${qShare.data?.total ?? '?'})`);
    }

    // Unique index: second doc with same userId should fail
    const dup = await createDocument(`${docId}_dup`, { ...payload, userId: probeUserId });
    if (dup.ok) {
      fail('Unique index check: duplicate userId was allowed (userId_unique may be missing)');
      await deleteDocument(`${docId}_dup`);
      ok = false;
    } else {
      pass('Unique index: duplicate userId rejected');
    }

    await deleteDocument(docId);
    pass('Cleanup: probe document deleted');
  }

  console.log('');
  if (ok) {
    console.log('Step 1 looks good — collection schema + CRUD/query tests passed.');
    console.log('Safe to move to Step 2 (maps / location permissions).');
    process.exit(0);
  }
  console.log('Step 1 has errors. Fix in Appwrite Console, then re-run:');
  console.log('  node scripts/verify-user-locations-schema.cjs');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
