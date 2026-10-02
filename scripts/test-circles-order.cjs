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
const circlesId = process.env.EXPO_PUBLIC_CIRCLES_COLLECTION_ID || '6abc123b0031a48ca183';
const headers = { 'X-Appwrite-Project': projectId, 'X-Appwrite-Key': apiKey, Accept: 'application/json' };
(async () => {
  const q =
    'queries[]=' +
    encodeURIComponent('orderDesc("memberCount")') +
    '&queries[]=' +
    encodeURIComponent('limit(5)');
  const res = await fetch(
    `${endpoint}/databases/${databaseId}/collections/${circlesId}/documents?${q}`,
    { headers }
  );
  const data = await res.json();
  console.log('status', res.status);
  if (!res.ok) console.log(data);
  else console.log((data.documents || []).map((d) => `${d.slug}:${d.memberCount}`).join(', '));
})();
