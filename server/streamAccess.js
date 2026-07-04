/**
 * Server-side paid live stream entitlement checks (Appwrite REST).
 */

const axios = require('axios');

function appwriteHeaders() {
  return {
    'X-Appwrite-Project': process.env.APPWRITE_PROJECT_ID,
    'X-Appwrite-Key': process.env.APPWRITE_API_KEY,
    'Content-Type': 'application/json',
  };
}

function appwriteBase() {
  const ep = (process.env.APPWRITE_ENDPOINT || '').replace(/\/$/, '');
  return ep || null;
}

function isConfigured() {
  return Boolean(
    appwriteBase() &&
      process.env.APPWRITE_PROJECT_ID &&
      process.env.APPWRITE_API_KEY &&
      process.env.APPWRITE_DATABASE_ID &&
      process.env.APPWRITE_LIVE_STREAMS_COLLECTION_ID &&
      process.env.APPWRITE_STREAM_PURCHASES_COLLECTION_ID
  );
}

async function getDocument(collectionId, documentId) {
  const base = appwriteBase();
  const db = process.env.APPWRITE_DATABASE_ID;
  const url = `${base}/databases/${db}/collections/${collectionId}/documents/${documentId}`;
  const { data } = await axios.get(url, { headers: appwriteHeaders() });
  return data;
}

async function listDocuments(collectionId, queries = []) {
  const base = appwriteBase();
  const db = process.env.APPWRITE_DATABASE_ID;
  const params = new URLSearchParams();
  queries.forEach((q) => params.append('queries[]', q));
  const qs = params.toString();
  const url = `${base}/databases/${db}/collections/${collectionId}/documents${qs ? `?${qs}` : ''}`;
  const { data } = await axios.get(url, { headers: appwriteHeaders() });
  return data?.documents || [];
}

function isPaidStream(stream) {
  if (!stream) return false;
  const price = parseFloat(stream.price);
  const hasPrice = Number.isFinite(price) && price > 0;
  if (!hasPrice) return false;
  if (stream.isPaid === true || stream.isPaid === 'true' || stream.isPaid === 1) {
    return true;
  }
  return hasPrice;
}

/**
 * @param {string} streamId
 * @param {string} userId
 * @returns {Promise<{ allowed: boolean, reason?: string }>}
 */
async function checkStreamAccess(streamId, userId) {
  if (!streamId || !userId) {
    return { allowed: false, reason: 'streamId and userId are required' };
  }

  if (!isConfigured()) {
    // Fail open when Appwrite is not configured (local dev without paid streams).
    return { allowed: true, reason: 'appwrite_not_configured' };
  }

  try {
    const stream = await getDocument(
      process.env.APPWRITE_LIVE_STREAMS_COLLECTION_ID,
      streamId
    );

    if (!isPaidStream(stream)) {
      return { allowed: true };
    }

    if (stream.hostId === userId) {
      return { allowed: true };
    }

    const purchases = await listDocuments(process.env.APPWRITE_STREAM_PURCHASES_COLLECTION_ID, [
      JSON.stringify({ method: 'equal', attribute: 'streamId', values: [streamId] }),
      JSON.stringify({ method: 'equal', attribute: 'buyerId', values: [userId] }),
      JSON.stringify({ method: 'equal', attribute: 'status', values: ['completed'] }),
      JSON.stringify({ method: 'limit', values: [1] }),
    ]);

    if (purchases.length > 0) {
      return { allowed: true };
    }

    return { allowed: false, reason: 'payment_required' };
  } catch (error) {
    const status = error?.response?.status;
    if (status === 404) {
      return { allowed: false, reason: 'stream_not_found' };
    }
    return { allowed: false, reason: error?.message || 'access_check_failed' };
  }
}

module.exports = {
  checkStreamAccess,
  isConfigured,
  isPaidStream,
};
