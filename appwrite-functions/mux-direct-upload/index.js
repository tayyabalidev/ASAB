/**
 * Appwrite Function — Mux direct upload (for React Native publishVideoWithMux).
 *
 * IMPORTANT: Appwrite's `res` is NOT Express. Never call `res.status(...)` — it crashes with:
 *   TypeError: Cannot read properties of undefined (reading 'status')
 * Use: return res.json(body, statusCode, headers)  (same pattern as videosdk-token).
 *
 * Invoked via SDK: functions.createExecution(fnId, JSON.stringify({ documentId }), false)
 * Headers include x-appwrite-user-jwt when the user is logged in.
 *
 * Function variables (Console → Settings → Variables):
 *   MUX_TOKEN_ID, MUX_TOKEN_SECRET
 *   APPWRITE_DATABASE_ID, APPWRITE_VIDEO_COLLECTION_ID
 * Optional: MUX_CORS_ORIGIN (default *)
 *
 * Uses APPWRITE_FUNCTION_API_ENDPOINT + APPWRITE_FUNCTION_PROJECT_ID + x-appwrite-key at runtime.
 */
'use strict';

const axios = require('axios');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, X-Appwrite-JWT, x-appwrite-user-jwt, x-appwrite-key, Authorization',
};

function normalizeHeaders(h) {
  const out = {};
  if (!h) return out;
  if (Array.isArray(h)) {
    for (const entry of h) {
      const name = String(entry.name || entry.key || '').toLowerCase();
      const value = entry.value ?? entry.content ?? '';
      if (name) out[name] = value;
    }
    return out;
  }
  if (typeof h === 'object') {
    for (const [k, v] of Object.entries(h)) {
      out[String(k).toLowerCase()] = typeof v === 'string' ? v : String(v ?? '');
    }
  }
  return out;
}

function getBodyJson(req) {
  if (req.bodyJson && typeof req.bodyJson === 'object' && !Array.isArray(req.bodyJson)) {
    return req.bodyJson;
  }
  const text =
    (typeof req.bodyText === 'string' && req.bodyText) ||
    (typeof req.bodyRaw === 'string' && req.bodyRaw) ||
    (typeof req.body === 'string' && req.body) ||
    '';
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function muxAuthHeader() {
  const id = String(process.env.MUX_TOKEN_ID || '').trim();
  const secret = String(process.env.MUX_TOKEN_SECRET || '').trim();
  if (!id || !secret) return null;
  return `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
}

module.exports = async ({ req, res, log }) => {
  try {
    // Appwrite may pass lowercase "post" / "options" — strict !== "POST" causes false 405s.
    const method = String(req.method || "POST").toUpperCase();

    if (method === "OPTIONS") {
      return res.send('', 204, cors);
    }

    if (method !== "POST") {
      return res.json({ error: 'Method not allowed' }, 405, cors);
    }

    const headers = normalizeHeaders(req.headers);
    const userJwt =
      headers['x-appwrite-user-jwt'] ||
      headers['x-appwrite-jwt'] ||
      '';
    const dynamicKey = headers['x-appwrite-key'] || '';

    const endpoint = String(
      process.env.APPWRITE_FUNCTION_API_ENDPOINT ||
        process.env.APPWRITE_ENDPOINT ||
        ''
    ).replace(/\/$/, '');
    const projectId =
      process.env.APPWRITE_FUNCTION_PROJECT_ID ||
      process.env.APPWRITE_PROJECT_ID ||
      '';
    const databaseId = String(process.env.APPWRITE_DATABASE_ID || '').trim();
    const collectionId = String(process.env.APPWRITE_VIDEO_COLLECTION_ID || '').trim();

    const body = getBodyJson(req);
    const documentId = body.documentId || body.document_id;

    if (!documentId) {
      return res.json({ error: 'documentId required' }, 400, cors);
    }
    if (!userJwt) {
      return res.json(
        {
          error: 'Missing session',
          message:
            'No x-appwrite-user-jwt — run this function as a logged-in user (createExecution with client session).',
        },
        401,
        cors
      );
    }
    if (!endpoint || !projectId) {
      log('Missing APPWRITE_FUNCTION_API_ENDPOINT or APPWRITE_FUNCTION_PROJECT_ID');
      return res.json({ error: 'Function Appwrite endpoint/project not configured' }, 500, cors);
    }
    if (!databaseId || !collectionId) {
      return res.json(
        {
          error: 'Set APPWRITE_DATABASE_ID and APPWRITE_VIDEO_COLLECTION_ID on this function',
        },
        500,
        cors
      );
    }
    if (!dynamicKey) {
      return res.json(
        {
          error: 'Missing dynamic API key',
          message:
            'x-appwrite-key header missing — ensure function has required scopes (databases.read, databases.write).',
        },
        500,
        cors
      );
    }

    let account;
    try {
      const { data } = await axios.get(`${endpoint}/account`, {
        headers: {
          'X-Appwrite-Project': projectId,
          'X-Appwrite-JWT': userJwt,
        },
        timeout: 20000,
      });
      account = data;
    } catch (e) {
      const status = e.response?.status;
      log(`Account JWT verify failed: ${status} ${e.message}`);
      return res.json({ error: 'Invalid or expired session' }, 401, cors);
    }

    if (!account || !account.$id) {
      return res.json({ error: 'Invalid or expired session' }, 401, cors);
    }

    let doc;
    try {
      const { data } = await axios.get(
        `${endpoint}/databases/${databaseId}/collections/${collectionId}/documents/${documentId}`,
        {
          headers: {
            'X-Appwrite-Project': projectId,
            'X-Appwrite-JWT': userJwt,
          },
          timeout: 20000,
        }
      );
      doc = data;
    } catch (e) {
      log(`Get document failed: ${e.response?.status} ${e.message}`);
      return res.json({ error: 'Post not found' }, 404, cors);
    }

    const creatorId =
      typeof doc.creator === 'string' ? doc.creator : doc.creator && doc.creator.$id;
    if (!creatorId || creatorId !== account.$id) {
      return res.json({ error: 'Not allowed to upload for this post' }, 403, cors);
    }

    const auth = muxAuthHeader();
    if (!auth) {
      log('Missing MUX_TOKEN_ID or MUX_TOKEN_SECRET');
      return res.json(
        {
          error: 'Mux is not configured',
          message: 'Set MUX_TOKEN_ID and MUX_TOKEN_SECRET on this function, redeploy.',
        },
        503,
        cors
      );
    }

    const corsOrigin =
      String(process.env.MUX_CORS_ORIGIN || process.env.EXPO_PUBLIC_MUX_CORS_ORIGIN || '*').trim() ||
      '*';
    const passthrough = JSON.stringify({
      documentId,
      creatorId: account.$id,
    });

    let muxRow;
    try {
      const { data } = await axios.post(
        'https://api.mux.com/video/v1/uploads',
        {
          cors_origin: corsOrigin,
          passthrough,
          new_asset_settings: {
            playback_policy: ['public'],
            passthrough,
          },
        },
        {
          headers: {
            Authorization: auth,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );
      muxRow = data && data.data;
    } catch (e) {
      const detail =
        e.response?.data != null
          ? JSON.stringify(e.response.data)
          : e.message || String(e);
      log(`Mux API error: ${detail}`);
      return res.json(
        { error: 'Mux direct upload create failed', message: String(detail).slice(0, 2000) },
        502,
        cors
      );
    }

    if (!muxRow || !muxRow.url || !muxRow.id) {
      log(`Unexpected Mux response shape: ${JSON.stringify(muxRow)}`);
      return res.json({ error: 'Mux returned an unexpected response' }, 502, cors);
    }

    const uploadId = muxRow.id;
    const uploadUrl = muxRow.url;

    try {
      await axios.patch(
        `${endpoint}/databases/${databaseId}/collections/${collectionId}/documents/${documentId}`,
        {
          data: {
            mux_upload_id: uploadId,
            mux_status: 'uploading',
          },
        },
        {
          headers: {
            'X-Appwrite-Project': projectId,
            'X-Appwrite-Key': dynamicKey,
            'Content-Type': 'application/json',
          },
          timeout: 20000,
        }
      );
    } catch (patchErr) {
      log(
        `Appwrite patch optional fields failed (schema may omit mux_*): ${patchErr.response?.status} ${patchErr.message}`
      );
    }

    return res.json({ uploadId, uploadUrl }, 200, {
      ...cors,
      'Content-Type': 'application/json',
    });
  } catch (e) {
    try {
      log(String(e && e.message ? e.message : e));
    } catch (_) {}
    return res.json(
      { error: 'Mux direct upload failed', message: e.message || 'unknown' },
      500,
      cors
    );
  }
};
