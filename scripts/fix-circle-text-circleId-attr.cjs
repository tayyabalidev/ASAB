'use strict';
/**
 * Adds correct `circleId` attribute + index on circleTextPosts when a typo
 * attribute `circleIdcircleId` was created by mistake.
 */
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
const collectionId =
  process.env.EXPO_PUBLIC_CIRCLE_TEXT_POSTS_COLLECTION_ID || '6abf905e001c06130427';

const headers = {
  'X-Appwrite-Project': projectId,
  'X-Appwrite-Key': apiKey,
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

async function api(method, urlPath, body) {
  const res = await fetch(`${endpoint}${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function waitForKey(key, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    const list = await api(
      'GET',
      `/databases/${databaseId}/collections/${collectionId}/attributes?limit=50`
    );
    const attr = (list.data.attributes || []).find((a) => a.key === key);
    if (attr?.status === 'available') return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function main() {
  if (!apiKey) {
    console.error('Missing APPWRITE_API_KEY');
    process.exit(1);
  }

  const list = await api(
    'GET',
    `/databases/${databaseId}/collections/${collectionId}/attributes?limit=50`
  );
  const keys = new Set((list.data.attributes || []).map((a) => a.key));
  console.log('Current keys:', [...keys].join(', '));

  if (!keys.has('circleId')) {
    const created = await api(
      'POST',
      `/databases/${databaseId}/collections/${collectionId}/attributes/string`,
      { key: 'circleId', size: 36, required: true, array: false }
    );
    console.log('Create circleId attribute:', created.status, created.ok ? 'ok' : created.data);
    if (!created.ok && created.status !== 409) process.exit(1);
    const ready = await waitForKey('circleId');
    console.log('circleId available:', ready);
  } else {
    console.log('circleId already exists');
  }

  const idxList = await api(
    'GET',
    `/databases/${databaseId}/collections/${collectionId}/indexes?limit=20`
  );
  const indexes = idxList.data.indexes || [];
  const misnamed = indexes.find(
    (idx) =>
      String(idx.key) === 'circleId' &&
      !(idx.attributes || []).includes('circleId')
  );
  if (misnamed) {
    const del = await api(
      'DELETE',
      `/databases/${databaseId}/collections/${collectionId}/indexes/${misnamed.key}`
    );
    console.log('Delete misnamed circleId index:', del.status, del.ok ? 'ok' : del.data);
    await new Promise((r) => setTimeout(r, 2000));
  }
  const hasIdx = indexes.some((idx) =>
    (idx.attributes || []).includes('circleId')
  );
  if (!hasIdx || misnamed) {
    const idx = await api(
      'POST',
      `/databases/${databaseId}/collections/${collectionId}/indexes`,
      {
        key: 'circleId_query',
        type: 'key',
        attributes: ['circleId'],
        orders: ['ASC'],
      }
    );
    console.log('Create circleId_query index:', idx.status, idx.ok ? 'ok' : idx.data);
  } else {
    console.log('circleId index already covers correct attribute');
  }

  if (keys.has('circleIdcircleId')) {
    console.log(
      '\nNote: delete typo attribute `circleIdcircleId` in Appwrite Console when no docs use it.'
    );
  }
  console.log('\nDone. Re-run: node scripts/verify-circle-text-posts.cjs');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
