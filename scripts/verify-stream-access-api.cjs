#!/usr/bin/env node
/**
 * Smoke-test stream-access API (Step 2).
 *
 * Usage:
 *   node scripts/verify-stream-access-api.cjs
 *   node scripts/verify-stream-access-api.cjs --base http://localhost:3001
 *
 * Env: EXPO_PUBLIC_PROCESSING_SERVER_URL or PROCESSING_SERVER_URL
 */
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

const argBase = process.argv.find((a) => a.startsWith('--base='))?.split('=')[1];
const base = (
  argBase ||
  process.env.PROCESSING_SERVER_URL ||
  process.env.EXPO_PUBLIC_PROCESSING_SERVER_URL ||
  'http://localhost:3001'
).replace(/\/$/, '');

async function getJson(pathname) {
  const res = await fetch(`${base}${pathname}`);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  return { status: res.status, data };
}

async function main() {
  console.log(`Stream-access API smoke test\nBase URL: ${base}\n`);

  const health = await getJson('/api/health');
  console.log(`GET /api/health → ${health.status}`, health.data);

  const check = await getJson(
    '/api/check-stream-access?streamId=nonexistent_stream&userId=probe_user'
  );
  console.log(`GET /api/check-stream-access → ${check.status}`, check.data);

  const root = await getJson('/');
  console.log(`GET / → ${root.status}`, root.data);

  const webhookProbe = await fetch(`${base}/api/stripe-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': 'probe' },
    body: '{}',
  });
  const webhookText = await webhookProbe.text();
  let webhookBody;
  try {
    webhookBody = JSON.parse(webhookText);
  } catch {
    webhookBody = { raw: webhookText.slice(0, 120) };
  }
  console.log(`POST /api/stripe-webhook → ${webhookProbe.status}`, webhookBody);

  const requiredRoutes = [
    '/api/health',
    '/api/check-stream-access',
    '/api/create-stream-access-payment-intent',
    '/api/confirm-stream-access-payment',
    '/api/stripe-webhook',
  ];
  const deployedRoutes = Array.isArray(root.data?.routes) ? root.data.routes : [];
  const missingRoutes = requiredRoutes.filter((route) => !deployedRoutes.includes(route));
  const webhookDeployed = webhookProbe.status !== 404;

  const okHealth = health.status === 200 && (health.data?.status === 'ok' || health.data?.service);
  const okCheck =
    check.status === 200 &&
    typeof check.data?.allowed === 'boolean' &&
    (check.data.reason === 'stream_not_found' || check.data.reason === 'appwrite_not_configured');

  console.log('');
  if (okHealth && okCheck && missingRoutes.length === 0 && webhookDeployed) {
    console.log('✅ Stream-access API is reachable and fully deployed (5 routes + webhook).');
    if (check.data?.reason === 'appwrite_not_configured') {
      console.log('   Note: Appwrite env vars missing on deployed function — set them before production.');
    }
    process.exit(0);
  }

  if (okHealth && okCheck) {
    console.log('⚠️  Stream-access is online but running an OLD deployment.');
    if (missingRoutes.length) {
      console.log(`   Missing routes: ${missingRoutes.join(', ')}`);
    }
    if (!webhookDeployed) {
      console.log('   /api/stripe-webhook returns 404 — Stripe webhooks will not work.');
    }
    console.log('\n   Fix: node scripts/package-stream-access-function.cjs');
    console.log('   Then Appwrite → stream-access → Deployments → upload dist/stream-access-deploy.zip');
    console.log('   Entrypoint index.js, build npm install, wait until Active.');
    process.exit(1);
  }

  console.log('❌ Stream-access API check failed.');
  if (health.status === 404) {
    console.log('   Deploy appwrite-functions/stream-access/ or run: cd server && npm start');
  }
  process.exit(1);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
