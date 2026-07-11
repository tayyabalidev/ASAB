#!/usr/bin/env node
/**
 * Verify Appwrite paid live streaming schema (Step 1).
 *
 * Usage (from project root):
 *   node scripts/verify-paid-stream-schema.cjs
 *
 * Requires server/.env or .env with:
 *   APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY,
 *   APPWRITE_DATABASE_ID, APPWRITE_LIVE_STREAMS_COLLECTION_ID,
 *   APPWRITE_STREAM_PURCHASES_COLLECTION_ID
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

const endpoint =
  process.env.APPWRITE_ENDPOINT ||
  process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT ||
  'https://nyc.cloud.appwrite.io/v1';
const projectId =
  process.env.APPWRITE_PROJECT_ID || process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID || '6854922e0036a1e8dee6';
const apiKey = process.env.APPWRITE_API_KEY || '';
const databaseId =
  process.env.APPWRITE_DATABASE_ID || process.env.EXPO_PUBLIC_APPWRITE_DATABASE_ID || '685494a1002f8417c2b2';
const liveStreamsId =
  process.env.APPWRITE_LIVE_STREAMS_COLLECTION_ID || '68f20f1f00332e083aff';
const streamPurchasesId = process.env.APPWRITE_STREAM_PURCHASES_COLLECTION_ID || '';

const LIVE_STREAM_PAID_KEYS = ['isPaid', 'price', 'currency'];
const PURCHASE_KEYS = [
  'streamId',
  'buyerId',
  'hostId',
  'amount',
  'platformFee',
  'hostReceives',
  'status',
  'paymentIntentId',
  'currency',
  'purchasedAt',
];

function appwriteHeaders() {
  return {
    'X-Appwrite-Project': projectId,
    'X-Appwrite-Key': apiKey,
    'Content-Type': 'application/json',
  };
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

async function listAttributes(collectionId) {
  const url = `${endpoint.replace(/\/$/, '')}/databases/${databaseId}/collections/${collectionId}/attributes`;
  const res = await fetch(url, { headers: appwriteHeaders() });
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`Attributes list failed (${res.status}): ${body}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  const data = await res.json();
  return (data.attributes || []).map((a) => a.key);
}

/** Fallback when API key lacks collections.read — probe via create/delete test document. */
async function probeAttributes(collectionId, payload, label) {
  const base = `${endpoint.replace(/\/$/, '')}/databases/${databaseId}/collections/${collectionId}/documents`;
  const docId = `schema_probe_${Date.now()}`;
  const createRes = await fetch(base, {
    method: 'POST',
    headers: appwriteHeaders(),
    body: JSON.stringify({ documentId: docId, data: payload }),
  });

  if (createRes.ok) {
    await fetch(`${base}/${docId}`, { method: 'DELETE', headers: appwriteHeaders() }).catch(() => {});
    const keys = Object.keys(payload);
    console.log(`✅ ${label}: all ${keys.length} attributes present (probe create/delete)`);
    return keys;
  }

  const body = await createRes.text();
  const missing = parseMissingAttribute(body);
  if (missing) {
    const err = new Error(`missing attribute "${missing}"`);
    err.missing = missing;
    err.probeBody = body;
    throw err;
  }
  throw new Error(`Probe failed (${createRes.status}): ${body.slice(0, 280)}`);
}

async function resolveAttributes(collectionId, probePayload, label) {
  try {
    return { keys: await listAttributes(collectionId), method: 'list' };
  } catch (e) {
    const body = String(e.body || e.message || '');
    const needsCollectionsRead =
      e.status === 401 && body.includes('collections.read');
    if (!needsCollectionsRead) throw e;

    console.log(
      `ℹ️  ${label}: API key lacks collections.read — using document probe (databases.read/write only)`
    );
    const keys = await probeAttributes(collectionId, probePayload, label);
    return { keys, method: 'probe' };
  }
}

function reportMissing(label, expected, found) {
  const missing = expected.filter((k) => !found.includes(k));
  const extra = found.filter((k) => expected.includes(k));
  if (missing.length === 0) {
    console.log(`✅ ${label}: all ${expected.length} attributes present`);
    return true;
  }
  console.log(`❌ ${label}: missing ${missing.join(', ')}`);
  if (extra.length) console.log(`   found: ${extra.join(', ')}`);
  return false;
}

async function main() {
  console.log('Paid live streaming — Appwrite schema verification\n');

  if (!apiKey) {
    console.log('⚠️  APPWRITE_API_KEY not set — cannot verify remotely.');
    console.log('   Add APPWRITE_API_KEY to server/.env (Appwrite Console → API Keys).');
    console.log('\nManual checklist:');
    console.log('  liveStreams: add Boolean isPaid, Float price, String currency');
    console.log('  streamPurchases: create collection with attributes from lib/liveStreamSchema.js');
    process.exit(1);
  }

  if (!streamPurchasesId) {
    console.log('⚠️  APPWRITE_STREAM_PURCHASES_COLLECTION_ID not set.');
    console.log('   Create streamPurchases in Appwrite, copy collection ID to .env');
    process.exit(1);
  }

  let ok = true;

  try {
    const { keys: liveAttrs } = await resolveAttributes(
      liveStreamsId,
      {
        hostId: 'schema_probe_host',
        hostUsername: 'probe',
        hostAvatar: '',
        title: 'Schema probe',
        description: '',
        category: 'General',
        isLive: false,
        status: 'ended',
        viewerCount: 0,
        startTime: new Date().toISOString(),
        thumbnail: '',
        liveMode: 'camera',
        videosdkRoomId: 'probe_room',
        isPaid: false,
        price: 0,
        currency: 'USD',
      },
      'liveStreams (paid fields)'
    );
    ok = reportMissing('liveStreams (paid fields)', LIVE_STREAM_PAID_KEYS, liveAttrs) && ok;
  } catch (e) {
    if (e.missing) {
      console.log(`❌ liveStreams (paid fields): missing ${e.missing}`);
    } else {
      console.log(`❌ liveStreams: ${e.message}`);
    }
    ok = false;
  }

  try {
    const { keys: purchaseAttrs } = await resolveAttributes(
      streamPurchasesId,
      {
        streamId: 'probe_stream_id',
        buyerId: 'probe_buyer_id',
        hostId: 'probe_host_id',
        amount: 9.99,
        platformFee: 1,
        hostReceives: 8.99,
        status: 'pending',
        paymentIntentId: '',
        currency: 'USD',
        purchasedAt: new Date().toISOString(),
      },
      'streamPurchases'
    );
    ok = reportMissing('streamPurchases', PURCHASE_KEYS, purchaseAttrs) && ok;
  } catch (e) {
    if (e.missing) {
      console.log(`❌ streamPurchases: missing ${e.missing}`);
    } else {
      console.log(`❌ streamPurchases: ${e.message}`);
    }
    ok = false;
  }

  console.log('');
  if (ok) {
    console.log('Schema looks good. Set EXPO_PUBLIC_STREAM_PURCHASES_COLLECTION_ID in .env and proceed to Step 2.');
    process.exit(0);
  }
  console.log('Fix missing attributes in Appwrite Console, then re-run this script.');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
