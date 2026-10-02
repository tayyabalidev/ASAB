/**
 * Create Appwrite collection circleTextPosts for Circle text-only feed items.
 * Prints the collection ID to paste into .env as EXPO_PUBLIC_CIRCLE_TEXT_POSTS_COLLECTION_ID
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

if (!apiKey) {
  console.error('Missing APPWRITE_API_KEY');
  process.exit(1);
}

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
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function ensureAttribute(collectionId, attr) {
  const list = await api(
    'GET',
    `/databases/${databaseId}/collections/${collectionId}/attributes`
  );
  const existing = (list.json.attributes || []).some((a) => a.key === attr.key);
  if (existing) {
    console.log('  attr exists', attr.key);
    return;
  }
  const type = attr.type;
  let path;
  let payload;
  if (type === 'string') {
    path = `/databases/${databaseId}/collections/${collectionId}/attributes/string`;
    payload = {
      key: attr.key,
      size: attr.size || 255,
      required: !!attr.required,
      array: !!attr.array,
    };
  } else if (type === 'integer') {
    path = `/databases/${databaseId}/collections/${collectionId}/attributes/integer`;
    payload = {
      key: attr.key,
      required: !!attr.required,
      array: !!attr.array,
    };
  } else {
    throw new Error(`Unsupported attr type ${type}`);
  }
  const created = await api('POST', path, payload);
  console.log('  attr', attr.key, created.status, created.ok ? 'ok' : JSON.stringify(created.json));
}

async function waitReady(collectionId, keys, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    const list = await api(
      'GET',
      `/databases/${databaseId}/collections/${collectionId}/attributes`
    );
    const attrs = list.json.attributes || [];
    const ready = keys.every((key) => {
      const a = attrs.find((x) => x.key === key);
      return a && a.status === 'available';
    });
    if (ready) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function main() {
  // Reuse if already present
  const list = await api('GET', `/databases/${databaseId}/collections?limit=100`);
  const found = (list.json.collections || []).find(
    (c) =>
      c.name === 'circleTextPosts' ||
      c.$id === process.env.EXPO_PUBLIC_CIRCLE_TEXT_POSTS_COLLECTION_ID
  );
  let collectionId = found?.$id;
  if (collectionId) {
    console.log('Using existing collection', collectionId, found.name);
  } else {
    const created = await api('POST', `/databases/${databaseId}/collections`, {
      collectionId: 'unique()',
      name: 'circleTextPosts',
      permissions: [
        'read("any")',
        'create("users")',
        'update("users")',
        'delete("users")',
      ],
      documentSecurity: false,
      enabled: true,
    });
    if (!created.ok) {
      console.error('Create collection failed', created.status, created.json);
      process.exit(1);
    }
    collectionId = created.json.$id;
    console.log('Created collection', collectionId);
  }

  const attrs = [
    { key: 'circleId', type: 'string', size: 36, required: true },
    { key: 'body', type: 'string', size: 2000, required: true },
    { key: 'title', type: 'string', size: 120, required: false },
    { key: 'creatorId', type: 'string', size: 36, required: true },
    { key: 'creatorUsername', type: 'string', size: 128, required: false },
    { key: 'creatorAvatar', type: 'string', size: 2048, required: false },
    { key: 'createdAt', type: 'string', size: 64, required: false },
  ];

  for (const attr of attrs) {
    await ensureAttribute(collectionId, attr);
  }

  const ready = await waitReady(
    collectionId,
    attrs.map((a) => a.key)
  );
  console.log('attributes ready', ready);

  // Index on circleId
  const indexes = await api(
    'GET',
    `/databases/${databaseId}/collections/${collectionId}/indexes`
  );
  const hasCircleId = (indexes.json.indexes || []).some((idx) =>
    (idx.attributes || []).includes('circleId')
  );
  if (!hasCircleId) {
    const idx = await api(
      'POST',
      `/databases/${databaseId}/collections/${collectionId}/indexes`,
      {
        key: 'circleId',
        type: 'key',
        attributes: ['circleId'],
        orders: ['ASC'],
      }
    );
    console.log('index circleId', idx.status, idx.ok ? 'ok' : JSON.stringify(idx.json));
  } else {
    console.log('index circleId exists');
  }

  console.log('\nSet in .env:');
  console.log(`EXPO_PUBLIC_CIRCLE_TEXT_POSTS_COLLECTION_ID=${collectionId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
