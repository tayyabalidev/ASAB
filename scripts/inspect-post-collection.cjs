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
const headers = {
  'X-Appwrite-Project': projectId,
  'X-Appwrite-Key': apiKey,
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

async function main() {
  const postId = '68861f35001b5a7a28da';
  const res = await fetch(
    `${endpoint}/databases/${databaseId}/collections/${postId}`,
    { headers }
  );
  const col = await res.json();
  console.log('post collection', res.status, col.name, (col.attributes || []).map((a) => a.key).join(', '));

  const list = await fetch(
    `${endpoint}/databases/${databaseId}/collections?limit=100`,
    { headers }
  ).then((r) => r.json());
  for (const c of list.collections || []) {
    if (/circle|text|post/i.test(c.name)) {
      console.log(c.$id, c.name);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
