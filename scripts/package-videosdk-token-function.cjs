#!/usr/bin/env node
/**
 * Package videosdk-token Appwrite function for upload.
 * Output: dist/videosdk-token-deploy.zip
 *
 * Usage: node scripts/package-videosdk-token-function.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'appwrite-functions', 'videosdk-token');
const distDir = path.join(root, 'dist');
const zipPath = path.join(distDir, 'videosdk-token-deploy.zip');
const required = ['index.js', 'streamAccessCheck.js', 'package.json'];

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
console.log('\nAppwrite: Functions → videosdk-token → Deployments → upload this zip');
console.log('  Entrypoint: index.js | Build: npm install');
