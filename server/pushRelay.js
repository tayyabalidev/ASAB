/**
 * Server-side Expo push relay — reads expoPushToken via Appwrite API key
 * so mobile clients don't need permission to read other users' tokens.
 */

const axios = require('axios');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const PUSH_BATCH = 100;

function appwriteHeaders() {
  return {
    'X-Appwrite-Project': process.env.APPWRITE_PROJECT_ID,
    'X-Appwrite-Key': process.env.APPWRITE_API_KEY,
    'Content-Type': 'application/json',
  };
}

function appwriteBase() {
  return (process.env.APPWRITE_ENDPOINT || '').replace(/\/$/, '');
}

function userDocUrl(userId) {
  const db = process.env.APPWRITE_DATABASE_ID;
  const col = process.env.APPWRITE_USER_COLLECTION_ID;
  return `${appwriteBase()}/databases/${db}/collections/${col}/documents/${userId}`;
}

async function fetchPushTokensForUserIds(userIds) {
  const tokens = [];
  for (const userId of userIds) {
    if (!userId) continue;
    try {
      const { data: user } = await axios.get(userDocUrl(userId), { headers: appwriteHeaders() });
      const token = user?.expoPushToken;
      if (token && typeof token === 'string' && token.startsWith('ExponentPushToken')) {
        tokens.push({ userId, token });
      }
    } catch (_) {
      /* skip */
    }
  }
  return tokens;
}

async function sendExpoPushBatch(messages) {
  if (!messages.length) return { ok: true, sent: 0 };
  const { data, status } = await axios.post(EXPO_PUSH_URL, messages, {
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    validateStatus: () => true,
  });
  return { ok: status >= 200 && status < 300, sent: messages.length, data };
}

/**
 * POST /api/push/send
 * Body: { toUserIds: string[], title, body, channelId?, data? }
 */
async function handlePushSendRequest(req, res) {
  try {
    if (!process.env.APPWRITE_API_KEY) {
      return res.status(503).json({ error: 'APPWRITE_API_KEY not configured' });
    }

    const { toUserIds, title, body, channelId, data } = req.body || {};
    const recipients = [...new Set((toUserIds || []).filter(Boolean))];

    if (!recipients.length) {
      return res.status(400).json({ error: 'toUserIds is required' });
    }
    if (!title && !body) {
      return res.status(400).json({ error: 'title or body is required' });
    }

    const tokenEntries = await fetchPushTokensForUserIds(recipients);
    if (!tokenEntries.length) {
      return res.status(200).json({ ok: true, pushed: 0, recipients: recipients.length });
    }

    const messages = tokenEntries.map(({ token }) => ({
      to: token,
      title: title || 'ASAB',
      body: body || '',
      sound: 'default',
      priority: 'high',
      channelId: channelId || undefined,
      data: data && typeof data === 'object' ? data : undefined,
    }));

    let pushed = 0;
    for (let i = 0; i < messages.length; i += PUSH_BATCH) {
      const batch = messages.slice(i, i + PUSH_BATCH);
      const result = await sendExpoPushBatch(batch);
      if (result.ok) pushed += batch.length;
    }

    return res.status(200).json({ ok: true, pushed, recipients: recipients.length });
  } catch (error) {
    const message = error?.response?.data?.message || error?.message || 'Push relay failed';
    console.error('[pushRelay]', message);
    return res.status(500).json({ error: message });
  }
}

module.exports = { handlePushSendRequest, fetchPushTokensForUserIds, sendExpoPushBatch };
