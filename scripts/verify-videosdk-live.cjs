#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv').config();

function normalizeBase(url) {
  return String(url || '').trim().replace(/\/$/, '');
}

function decodeJwtPayload(token) {
  try {
    const payloadPart = String(token || '').split('.')[1] || '';
    if (!payloadPart) return null;
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch (_) {
    return null;
  }
}

async function readJson(url, method = 'GET') {
  const response = await fetch(url, {
    method,
    headers: { Accept: 'application/json' },
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch (_) {
    body = raw;
  }
  if (!response.ok) {
    throw new Error(`${method} ${url} failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  const tokenBase = normalizeBase(
    process.env.EXPO_PUBLIC_VIDEOSDK_TOKEN_URL ||
      process.env.EXPO_PUBLIC_SERVER_URL ||
      process.env.EXPO_PUBLIC_PROCESSING_SERVER_URL
  );
  const roomBase = normalizeBase(
    process.env.EXPO_PUBLIC_VIDEOSDK_ROOM_URL ||
      process.env.EXPO_PUBLIC_SERVER_URL ||
      process.env.EXPO_PUBLIC_PROCESSING_SERVER_URL
  );
  const tokenPath =
    process.env.EXPO_PUBLIC_VIDEOSDK_TOKEN_PATH !== undefined
      ? String(process.env.EXPO_PUBLIC_VIDEOSDK_TOKEN_PATH || '')
      : tokenBase.includes('.appwrite.run')
        ? ''
        : '/get-token';
  const roomPath =
    process.env.EXPO_PUBLIC_VIDEOSDK_ROOM_PATH !== undefined
      ? String(process.env.EXPO_PUBLIC_VIDEOSDK_ROOM_PATH || '')
      : roomBase.includes('.appwrite.run')
        ? ''
        : '/create-room';

  if (!tokenBase || !roomBase) {
    throw new Error('Missing EXPO_PUBLIC_VIDEOSDK_TOKEN_URL or EXPO_PUBLIC_VIDEOSDK_ROOM_URL');
  }

  const participantId = process.env.VIDEOSDK_VERIFY_PARTICIPANT_ID || 'verify-host';
  const roomUrlBase = `${roomBase}${roomPath.startsWith('/') || !roomPath ? roomPath : `/${roomPath}`}`;
  const combinedUrl = `${roomUrlBase}?participantId=${encodeURIComponent(participantId)}&debug=1`;

  let roomResponse = null;
  let tokenResponse = null;
  let roomId = '';
  let token = '';
  const verificationMode = 'single-endpoint';

  const combinedResponse = await readJson(combinedUrl, 'POST');
  roomId =
    combinedResponse?.meetingId ||
    combinedResponse?.roomId ||
    combinedResponse?.id ||
    combinedResponse?.room_id ||
    '';
  token = typeof combinedResponse?.token === 'string' ? combinedResponse.token : '';
  if (!roomId || !token) {
    throw new Error(
      `Combined endpoint missing fields (meetingId/token): ${JSON.stringify(combinedResponse)}`
    );
  }
  roomResponse = combinedResponse;
  tokenResponse = combinedResponse;

  const claims = decodeJwtPayload(token) || {};
  const perms = Array.isArray(claims.permissions) ? claims.permissions : [];

  console.log('--- VideoSDK Live Verification ---');
  console.log(`mode: ${verificationMode}`);
  console.log(`roomBase: ${roomBase}`);
  console.log(`tokenBase: ${tokenBase}`);
  console.log(`roomId: ${roomId}`);
  console.log(`token.apikey: ${claims.apikey || 'n/a'}`);
  console.log(`token.roomId: ${claims.roomId || 'n/a'}`);
  console.log(`token.permissions: ${perms.join(',') || 'n/a'}`);
  if (roomResponse?.debug) {
    console.log(`room.debug: ${JSON.stringify(roomResponse.debug)}`);
  }
  if (tokenResponse?.debug) {
    console.log(`token.debug: ${JSON.stringify(tokenResponse.debug)}`);
  }

  const failures = [];
  if (!perms.includes('allow_mod')) failures.push('token missing allow_mod');
  if (String(claims.roomId || '') !== String(roomId)) failures.push('token roomId does not match created roomId');
  if (failures.length > 0) {
    throw new Error(`Verification failed: ${failures.join('; ')}`);
  }

  console.log('PASS: token + room are aligned for host HLS start.');
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
