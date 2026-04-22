/**
 * Appwrite Function — VideoSDK JWT for ASAB calls.
 *
 * Contract (matches lib/videosdkHelper.js):
 *   GET /?meetingId=<room>&participantId=<optional>
 *   Response: { "token": "<jwt>" }
 *
 * Function env (Appwrite console): VIDEOSDK_API_KEY, VIDEOSDK_SECRET_KEY
 *
 * Must `return` every res.* (Appwrite requirement).
 */
'use strict';

const jwt = require('jsonwebtoken');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
};

function parseQuery(req) {
  if (req.query && typeof req.query === 'object' && !Array.isArray(req.query)) {
    const m = req.query.meetingId ?? req.query['meetingId'];
    const p = req.query.participantId ?? req.query['participantId'];
    if (m != null && m !== '' || p != null && p !== '') {
      return {
        meetingId: m != null && m !== '' ? String(m) : '',
        participantId: p != null && p !== '' ? String(p) : '',
      };
    }
  }
  const raw =
    (typeof req.queryString === 'string' && req.queryString) ||
    (typeof req.url === 'string' && req.url.includes('?') ? req.url.split('?')[1] : '') ||
    '';
  const params = new URLSearchParams(raw);
  return {
    meetingId: params.get('meetingId') || '',
    participantId: params.get('participantId') || '',
  };
}

module.exports = async ({ req, res, log }) => {
  try {
    // Appwrite may pass lowercase "get" / "options" — strict !== "GET" causes false 405s.
    const method = String(req.method || "GET").toUpperCase();

    if (method === "OPTIONS") {
      return res.send('', 204, cors);
    }

    if (method !== "GET") {
      return res.json({ error: 'Method not allowed' }, 405, cors);
    }

    const apiKey = String(process.env.VIDEOSDK_API_KEY || '').trim();
    const secretKey = String(process.env.VIDEOSDK_SECRET_KEY || '').trim();

    const { meetingId, participantId } = parseQuery(req);
    const qs =
      typeof req.queryString === 'string' && req.queryString
        ? req.queryString
        : typeof req.url === 'string' && req.url.includes('?')
          ? req.url.split('?')[1]
          : '';
    const healthRequested =
      new URLSearchParams(qs).get('health') === '1' ||
      (req.query && String(req.query.health) === '1');
    if (healthRequested) {
      return res.json(
        {
          ok: true,
          videoSdkKeysPresent: Boolean(apiKey && secretKey),
          hint: !apiKey || !secretKey
            ? 'Add VIDEOSDK_API_KEY and VIDEOSDK_SECRET_KEY to this function (Settings → Variables), save, redeploy.'
            : 'Keys present; use ?meetingId=...&participantId=... for token.',
        },
        200,
        cors
      );
    }

    if (!apiKey || !secretKey) {
      log('Missing VIDEOSDK_API_KEY or VIDEOSDK_SECRET_KEY in function env');
      return res.json(
        {
          error: 'VideoSDK not configured',
          message:
            'VIDEOSDK_API_KEY or VIDEOSDK_SECRET_KEY missing at runtime. Set them on this function in Appwrite, then redeploy.',
        },
        503,
        cors
      );
    }

    const payload = {
      apikey: apiKey,
      permissions: ['allow_join', 'allow_mod'],
      version: 2,
      roles: ['rtc'],
    };
    if (meetingId) payload.roomId = meetingId;
    if (participantId) payload.participantId = participantId;

    const token = jwt.sign(payload, secretKey, {
      expiresIn: '2h',
      algorithm: 'HS256',
    });

    return res.json({ token }, 200, {
      ...cors,
      'Content-Type': 'application/json',
    });
  } catch (e) {
    try {
      log(String(e && e.message ? e.message : e));
    } catch (_) {}
    return res.json(
      { error: 'Token generation failed', message: e.message || 'unknown' },
      500,
      cors
    );
  }
};
