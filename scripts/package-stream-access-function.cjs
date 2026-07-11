#!/usr/bin/env node
/**
 * Package stream-access Appwrite function for upload.
 * Output: dist/stream-access-deploy.zip (index.js, streamAccess.js, package.json at zip root)
 *
 * Usage: node scripts/package-stream-access-function.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'appwrite-functions', 'stream-access');
const distDir = path.join(root, 'dist');
const zipPath = path.join(distDir, 'stream-access-deploy.zip');
const required = ['index.js', 'streamAccess.js', 'package.json'];

for (const name of required) {
  const filePath = path.join(srcDir, name);
  if (!fs.existsSync(filePath)) {
    console.error(`Missing ${filePath}`);
    process.exit(1);
  }
}

fs.mkdirSync(distDir, { recursive: true });
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

const inputs = required.map((name) => path.join(srcDir, name));
const isWin = process.platform === 'win32';

if (isWin) {
  const ps = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path ${inputs.map((p) => `'${p.replace(/'/g, "''")}'`).join(',')} -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`,
    ],
    { stdio: 'inherit' }
  );
  if (ps.status !== 0) process.exit(ps.status || 1);
} else {
  const ps = spawnSync('zip', ['-j', zipPath, ...inputs], { stdio: 'inherit' });
  if (ps.status !== 0) process.exit(ps.status || 1);
}

const stat = fs.statSync(zipPath);
console.log(`\nCreated ${zipPath} (${stat.size} bytes)`);
console.log('\nAppwrite deploy checklist (stream-access function ONLY):');
console.log('  Files in zip: index.js, streamAccess.js, package.json');
console.log('  Do NOT upload streamAccessCheck.js here (that belongs to videosdk-token).');
console.log('  1. Functions → stream-access → Deployments → Create deployment');
console.log('  2. Upload dist/stream-access-deploy.zip');
console.log('  3. Entrypoint: index.js | Build: npm install');
console.log('  4. Wait until Active, then: node scripts/verify-stream-access-api.cjs');
