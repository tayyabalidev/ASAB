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
const textId = process.env.EXPO_PUBLIC_CIRCLE_TEXT_POSTS_COLLECTION_ID || '6abf905e001c06130427';
const headers = { 'X-Appwrite-Project': projectId, 'X-Appwrite-Key': apiKey, Accept: 'application/json' };
(async () => {
  const attrs = await fetch(`${endpoint}/databases/${databaseId}/collections/${textId}/attributes?limit=50`, { headers }).then((r) => r.json());
  for (const a of attrs.attributes || []) {
    console.log(a.key, a.type, 'required=' + a.required, 'status=' + a.status, 'size=' + (a.size || ''));
  }
})();
