/**
 * Mux direct uploads + webhook → Appwrite video document updates.
 * Env: MUX_TOKEN_ID, MUX_TOKEN_SECRET, MUX_WEBHOOK_SECRET,
 *      APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY,
 *      APPWRITE_DATABASE_ID, APPWRITE_VIDEO_COLLECTION_ID
 */

const crypto = require('crypto');
const axios = require('axios');

function muxAuthHeader() {
  const id = process.env.MUX_TOKEN_ID;
  const secret = process.env.MUX_TOKEN_SECRET;
  if (!id || !secret) return null;
  return `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
}

function appwriteHeaders() {
  return {
    'X-Appwrite-Project': process.env.APPWRITE_PROJECT_ID,
    'X-Appwrite-Key': process.env.APPWRITE_API_KEY,
    'Content-Type': 'application/json',
  };
}

function appwriteBase() {
  const ep = (process.env.APPWRITE_ENDPOINT || '').replace(/\/$/, '');
  return ep;
}

async function appwriteGetDocument(documentId) {
  const base = appwriteBase();
  const db = process.env.APPWRITE_DATABASE_ID;
  const col = process.env.APPWRITE_VIDEO_COLLECTION_ID;
  const url = `${base}/databases/${db}/collections/${col}/documents/${documentId}`;
  const { data } = await axios.get(url, { headers: appwriteHeaders() });
  return data;
}

async function appwritePatchDocument(documentId, patch) {
  const base = appwriteBase();
  const db = process.env.APPWRITE_DATABASE_ID;
  const col = process.env.APPWRITE_VIDEO_COLLECTION_ID;
  const url = `${base}/databases/${db}/collections/${col}/documents/${documentId}`;
  await axios.patch(url, { data: patch }, { headers: appwriteHeaders() });
}

/**
 * Verify Mux-Signature: t=timestamp,v1=hex
 */
function verifyMuxSignature(rawBodyBuffer, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  const parts = sigHeader.split(',');
  let t;
  let v1;
  for (const p of parts) {
    const idx = p.indexOf('=');
    if (idx === -1) continue;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    if (k === 't') t = v;
    if (k === 'v1') v1 = v;
  }
  if (!t || !v1) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(t, 10)) > 300) return false;
  const payload = `${t}.${rawBodyBuffer.toString('utf8')}`;
  const h = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(v1, 'hex'));
  } catch {
    return false;
  }
}

async function verifyAppwriteJwtAndGetAccount(jwt) {
  const base = appwriteBase();
  if (!base || !process.env.APPWRITE_PROJECT_ID || !jwt) return null;
  try {
    const { data } = await axios.get(`${base}/account`, {
      headers: {
        'X-Appwrite-Project': process.env.APPWRITE_PROJECT_ID,
        'X-Appwrite-JWT': jwt,
      },
    });
    return data;
  } catch {
    return null;
  }
}

async function createMuxDirectUpload(passthroughObj) {
  const auth = muxAuthHeader();
  if (!auth) throw new Error('Mux is not configured (missing MUX_TOKEN_ID / MUX_TOKEN_SECRET)');

  const cors =
    process.env.MUX_CORS_ORIGIN ||
    process.env.EXPO_PUBLIC_MUX_CORS_ORIGIN ||
    '*';

  const passthrough = JSON.stringify(passthroughObj);

  const { data } = await axios.post(
    'https://api.mux.com/video/v1/uploads',
    {
      cors_origin: cors,
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
    }
  );

  const row = data.data;
  return {
    uploadId: row.id,
    uploadUrl: row.url,
  };
}

async function handleDirectUploadRequest(req, res) {
  try {
    const jwt = req.headers['x-appwrite-jwt'] || req.headers['X-Appwrite-JWT'];
    const { documentId } = req.body || {};
    if (!documentId) {
      return res.status(400).json({ error: 'documentId required' });
    }

    const account = await verifyAppwriteJwtAndGetAccount(jwt);
    if (!account || !account.$id) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    let doc;
    try {
      doc = await appwriteGetDocument(documentId);
    } catch (e) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const creatorId = typeof doc.creator === 'string' ? doc.creator : doc.creator?.$id;
    if (!creatorId || creatorId !== account.$id) {
      return res.status(403).json({ error: 'Not allowed to upload for this post' });
    }

    const { uploadId, uploadUrl } = await createMuxDirectUpload({
      documentId,
      creatorId: account.$id,
    });

    try {
      await appwritePatchDocument(documentId, {
        mux_upload_id: uploadId,
        mux_status: 'uploading',
      });
    } catch (patchErr) {
      // Optional attributes may be missing in schema — continue; client still uploads.
    }

    return res.json({ uploadId, uploadUrl });
  } catch (err) {
    const msg = err.response?.data || err.message;
    return res.status(500).json({ error: String(msg) });
  }
}

function parsePassthrough(data) {
  const raw = data?.passthrough;
  if (!raw || typeof raw !== 'string') return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function handleMuxWebhook(req, res) {
  const secret = process.env.MUX_WEBHOOK_SECRET;
  const sig = req.headers['mux-signature'] || req.headers['Mux-Signature'];
  const raw = req.body;

  if (!secret || !verifyMuxSignature(raw, sig, secret)) {
    return res.status(401).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  const type = event.type;
  const data = event.data;

  try {
    if (type === 'video.upload.asset_created') {
      const documentId = parsePassthrough(data).documentId;
      const assetId = data.asset_id;
      if (documentId && assetId) {
        try {
          await appwritePatchDocument(documentId, {
            mux_asset_id: assetId,
            mux_status: 'processing',
          });
        } catch (_) {}
      }
    }

    if (type === 'video.asset.ready') {
      const { documentId } = parsePassthrough(data);
      const playbackId = data.playback_ids?.[0]?.id;
      if (documentId && playbackId) {
        const hls = `https://stream.mux.com/${playbackId}.m3u8`;
        const thumb = `https://image.mux.com/${playbackId}/thumbnail.jpg?time=1&width=720`;
        const durationSec =
          typeof data.duration === 'number' ? data.duration : undefined;
        const patch = {
          mux_playback_id: playbackId,
          mux_asset_id: data.id,
          video: hls,
          mux_status: 'ready',
          thumbnail: thumb,
        };
        if (durationSec != null) {
          patch.duration = durationSec;
        }
        try {
          await appwritePatchDocument(documentId, patch);
        } catch (patchErr) {
          const minimal = { video: hls, mux_status: 'ready' };
          try {
            await appwritePatchDocument(documentId, minimal);
          } catch (e2) {
            console.error('[mux] Appwrite patch failed:', patchErr.message, e2.message);
          }
        }
      }
    }

    if (type === 'video.asset.errored') {
      const { documentId } = parsePassthrough(data);
      if (documentId) {
        try {
          await appwritePatchDocument(documentId, {
            mux_status: 'error',
          });
        } catch (_) {}
      }
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  return res.status(200).json({ received: true });
}

module.exports = {
  handleDirectUploadRequest,
  handleMuxWebhook,
};
