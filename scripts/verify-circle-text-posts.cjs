'use strict';
const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(__dirname, '..', '.env'));
loadEnvFile(path.join(__dirname, '..', 'server', '.env'));

const endpoint = (process.env.APPWRITE_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1').replace(/\/$/, '');
const projectId = process.env.APPWRITE_PROJECT_ID || '6854922e0036a1e8dee6';
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID || '685494a1002f8417c2b2';
const textId =
  process.env.EXPO_PUBLIC_CIRCLE_TEXT_POSTS_COLLECTION_ID || '6abf905e001c06130427';
const videoId = process.env.APPWRITE_VIDEO_COLLECTION_ID || '685494f9001c3ccb2ba2';

const REQUIRED = [
  'circleId',
  'body',
  'title',
  'creatorId',
  'creatorUsername',
  'creatorAvatar',
  'createdAt',
];

const headers = {
  'X-Appwrite-Project': projectId,
  'X-Appwrite-Key': apiKey,
  Accept: 'application/json',
};

async function getJson(url) {
  const res = await fetch(url, { headers });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  if (!apiKey) {
    console.error('Missing APPWRITE_API_KEY');
    process.exit(1);
  }
  console.log('Circle text posts collection:', textId);

  const col = await getJson(`${endpoint}/databases/${databaseId}/collections/${textId}`);
  if (!col.ok) {
    console.error('Collection not found', col.status, col.data);
    process.exit(1);
  }
  console.log('OK collection name:', col.data.name);

  const attrsRes = await getJson(
    `${endpoint}/databases/${databaseId}/collections/${textId}/attributes?limit=50`
  );
  const keys = new Set((attrsRes.data.attributes || []).map((a) => a.key));
  const missing = REQUIRED.filter((k) => !keys.has(k));
  if (missing.length) {
    console.error('Missing attributes:', missing.join(', '));
    process.exit(1);
  }
  console.log('OK attributes:', [...keys].sort().join(', '));

  const idxRes = await getJson(
    `${endpoint}/databases/${databaseId}/collections/${textId}/indexes?limit=20`
  );
  const hasCircleIndex = (idxRes.data.indexes || []).some((idx) =>
    (idx.attributes || []).includes('circleId')
  );
  if (!hasCircleIndex) {
    console.warn('WARN: no index on circleId (feed query may fail at scale)');
  } else {
    console.log('OK index on circleId');
  }

  const docs = await getJson(
    `${endpoint}/databases/${databaseId}/collections/${textId}/documents?limit=3`
  );
  console.log('Documents total:', docs.data.total ?? '?');

  const vids = await getJson(
    `${endpoint}/databases/${databaseId}/collections/${videoId}/documents?limit=25`
  );
  const scoped = (vids.data.documents || []).filter(
    (d) => d.circleId && String(d.circleId).trim()
  );
  console.log('Sample videos with circleId:', scoped.length, 'of', (vids.data.documents || []).length);

  console.log('\nAll circle text post checks passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
