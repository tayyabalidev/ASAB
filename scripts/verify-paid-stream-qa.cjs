#!/usr/bin/env node
/**
 * Paid live streaming — automated QA smoke checks (Step 7).
 *
 * Usage: node scripts/verify-paid-stream-qa.cjs
 */
'use strict';

const { spawnSync } = require('child_process');
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

function runNodeScript(relPath) {
  const result = spawnSync(process.execPath, [path.join(root, relPath)], {
    cwd: root,
    encoding: 'utf8',
  });
  return result.status === 0;
}

function checkEnv(name, label) {
  const ok = Boolean(String(process.env[name] || '').trim());
  console.log(ok ? `✅ ${label}` : `⚠️  ${label} (missing ${name})`);
  return ok;
}

async function main() {
  console.log('Paid live streaming — QA smoke checks\n');

  const envChecks = [
    checkEnv('EXPO_PUBLIC_STREAM_PURCHASES_COLLECTION_ID', 'App streamPurchases collection ID'),
    checkEnv('EXPO_PUBLIC_PROCESSING_SERVER_URL', 'Processing server URL'),
    checkEnv('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'Stripe publishable key'),
    checkEnv('STRIPE_SECRET_KEY', 'Stripe secret key (server/function)'),
    checkEnv('STRIPE_WEBHOOK_SECRET', 'Stripe webhook secret (recommended for production)'),
    checkEnv('APPWRITE_STREAM_PURCHASES_COLLECTION_ID', 'Server streamPurchases collection ID'),
    checkEnv('APPWRITE_LIVE_STREAMS_COLLECTION_ID', 'Server liveStreams collection ID'),
  ];

  console.log('\nRunning schema verification...');
  const schemaOk = runNodeScript('scripts/verify-paid-stream-schema.cjs');
  console.log(schemaOk ? '✅ Appwrite schema' : '❌ Appwrite schema');

  console.log('\nRunning stream-access API smoke test...');
  const apiOk = runNodeScript('scripts/verify-stream-access-api.cjs');
  console.log(apiOk ? '✅ Stream-access API' : '❌ Stream-access API');

  console.log('\nManual test checklist:');
  const manual = [
    'Host: free stream still goes live without paid toggle',
    'Host: paid stream with ticket price appears with $ badge in list',
    'Viewer: free stream plays without paywall',
    'Viewer: paid stream shows paywall before player',
    'Viewer: successful purchase grants access and plays video',
    'Viewer: returning purchaser skips paywall',
    'Security: token request without purchase returns 403 for paid stream',
    'Redeploy: stream-access + videosdk-token functions with Appwrite env vars',
    'Stripe: webhook endpoint points to /api/stripe-webhook on processing server',
  ];
  manual.forEach((item, i) => console.log(`  ${i + 1}. [ ] ${item}`));

  console.log('');
  const ok = schemaOk && apiOk && envChecks.filter(Boolean).length >= 4;
  if (ok) {
    console.log('Automated checks passed. Complete the manual checklist above before release.');
    process.exit(0);
  }
  console.log('Some automated checks failed — fix before release.');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
