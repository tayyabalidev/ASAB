/* Sync circle.memberCount from real circleMembers rows. Also drop vanity 'popular' from empty seeds. */
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
const circlesId = process.env.EXPO_PUBLIC_CIRCLES_COLLECTION_ID || '6abc123b0031a48ca183';
const membersId = process.env.EXPO_PUBLIC_CIRCLE_MEMBERS_COLLECTION_ID || '6abc14db000b5a73a03e';

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

async function main() {
  const circlesRes = await fetch(
    `${endpoint}/databases/${databaseId}/collections/${circlesId}/documents?limit=100`,
    { headers }
  );
  const circles = await circlesRes.json();
  if (!circlesRes.ok) {
    console.error('circles fetch failed', circles);
    process.exit(1);
  }

  const membersRes = await fetch(
    `${endpoint}/databases/${databaseId}/collections/${membersId}/documents?limit=100`,
    { headers }
  );
  const members = await membersRes.json();
  if (!membersRes.ok) {
    console.error('members fetch failed', members);
    process.exit(1);
  }

  const countByCircle = {};
  for (const m of members.documents || []) {
    const id = String(m.circleId || '');
    if (!id) continue;
    countByCircle[id] = (countByCircle[id] || 0) + 1;
  }

  console.log('membership totals:', countByCircle);

  for (const c of circles.documents || []) {
    const real = countByCircle[c.$id] || 0;
    const prev = Number(c.memberCount || 0);
    let keys = Array.isArray(c.filterKeys) ? [...c.filterKeys] : ['all'];
    keys = keys.filter((k) => k !== 'popular');
    if (!keys.includes('all')) keys.unshift('all');
    if (real >= 5 && !keys.includes('popular')) keys.push('popular');

    console.log(`${c.slug || c.name}: memberCount ${prev} -> ${real}; filterKeys=${keys.join(',')}`);

    const patch = await fetch(
      `${endpoint}/databases/${databaseId}/collections/${circlesId}/documents/${c.$id}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ data: { memberCount: real, filterKeys: keys } }),
      }
    );
    const body = await patch.json().catch(() => ({}));
    if (!patch.ok) {
      console.error('  update failed', patch.status, body);
    } else {
      console.log('  ok');
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
