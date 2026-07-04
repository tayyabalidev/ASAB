/**
 * Admin / CEO content broadcast — list all users via API key, create in-app
 * notifications, send Expo push (real-time on mobile).
 */

const crypto = require('crypto');
const axios = require('axios');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const DEDUPE_TYPES = new Set(['live', 'video_post', 'photo_post']);
const NOTIFY_BATCH = 25;
const PUSH_BATCH = 100;

function splitCsv(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function getAdminEmails() {
  return splitCsv(process.env.ADMIN_EMAILS || process.env.EXPO_PUBLIC_ADMIN_EMAILS).map((e) =>
    e.toLowerCase()
  );
}

function getBroadcasterUserIds() {
  return new Set([
    ...splitCsv(process.env.CEO_USER_IDS),
    ...splitCsv(process.env.CEO_USER_ID),
    ...splitCsv(process.env.EXPO_PUBLIC_CEO_USER_IDS),
    ...splitCsv(process.env.EXPO_PUBLIC_CEO_USER_ID),
  ]);
}

function getBroadcasterEmails() {
  return new Set(
    [
      ...splitCsv(process.env.CEO_EMAILS),
      ...splitCsv(process.env.CEO_USER_EMAIL),
      ...splitCsv(process.env.EXPO_PUBLIC_CEO_EMAILS),
      ...splitCsv(process.env.EXPO_PUBLIC_CEO_USER_EMAIL),
      ...getAdminEmails(),
    ].map((e) => e.toLowerCase())
  );
}

function isPlatformBroadcaster({ userId, email }) {
  const id = String(userId || '').trim();
  const em = String(email || '').trim().toLowerCase();
  if (id && getBroadcasterUserIds().has(id)) return true;
  if (em && getBroadcasterEmails().has(em)) return true;
  return false;
}

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

function collectionUrl(collectionId) {
  const base = appwriteBase();
  const db = process.env.APPWRITE_DATABASE_ID;
  return `${base}/databases/${db}/collections/${collectionId}/documents`;
}

function normalizeAvatar(avatar) {
  if (!avatar || typeof avatar !== 'string') return '';
  if (avatar.length <= 100) return avatar;
  const match = avatar.match(/\/files\/([^/?]+)/);
  if (match?.[1]) return match[1];
  return avatar.substring(0, 97) + '...';
}

async function appwriteGet(path) {
  const { data } = await axios.get(path, { headers: appwriteHeaders() });
  return data;
}

async function appwritePost(path, body) {
  const { data } = await axios.post(path, body, { headers: appwriteHeaders() });
  return data;
}

async function listAllUserIds(excludeUserId) {
  const userCol = process.env.APPWRITE_USER_COLLECTION_ID;
  if (!userCol) return [];

  const ids = [];
  const pageSize = 100;
  let cursor = null;

  while (true) {
    const queries = [`limit(${pageSize})`];
    if (cursor) queries.push(`cursorAfter("${cursor}")`);

    const queryString = queries.map((q) => `queries[]=${encodeURIComponent(q)}`).join('&');
    const url = `${collectionUrl(userCol)}?${queryString}`;
    const response = await appwriteGet(url);

    for (const doc of response.documents || []) {
      if (!excludeUserId || doc.$id !== excludeUserId) {
        ids.push(doc.$id);
      }
    }

    if ((response.documents || []).length < pageSize) break;
    cursor = response.documents[response.documents.length - 1].$id;
  }

  return ids;
}

async function findExistingNotification(type, fromUserId, targetUserId, postId) {
  const notifCol = process.env.APPWRITE_NOTIFICATIONS_COLLECTION_ID;
  if (!notifCol) return null;

  const queries = [
    `equal("type", "${type}")`,
    `equal("fromUserId", "${fromUserId}")`,
    `equal("targetUserId", "${targetUserId}")`,
  ];
  if (postId) queries.push(`equal("postId", "${postId}")`);

  const q = queries.map((query) => `queries[]=${encodeURIComponent(query)}`).join('&');
  const url = `${collectionUrl(notifCol)}?${q}&limit=1`;

  try {
    const response = await appwriteGet(url);
    return response.documents?.[0] || null;
  } catch (_) {
    return null;
  }
}

async function createNotificationDoc({ type, fromUserId, fromUsername, fromUserAvatar, targetUserId, postId }) {
  const notifCol = process.env.APPWRITE_NOTIFICATIONS_COLLECTION_ID;
  if (!notifCol) throw new Error('APPWRITE_NOTIFICATIONS_COLLECTION_ID not configured');

  if (DEDUPE_TYPES.has(type)) {
    const existing = await findExistingNotification(type, fromUserId, targetUserId, postId);
    if (existing) return existing;
  }

  const docId = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  const url = collectionUrl(notifCol);

  return appwritePost(url, {
    documentId: docId,
    data: {
      type,
      fromUserId,
      fromUsername: fromUsername || '',
      fromUserAvatar: fromUserAvatar || '',
      targetUserId,
      postId: postId || null,
      isRead: false,
      createdAt: new Date().toISOString(),
    },
  });
}

function buildPushCopy(type, displayName, title) {
  const trimmed = title && String(title).trim() ? String(title).trim() : '';
  if (type === 'live') {
    return { title: `${displayName} is live`, body: trimmed || 'Tap to watch the live stream' };
  }
  if (type === 'photo_post') {
    return { title: `${displayName} posted a photo`, body: trimmed || 'Tap to view the new post' };
  }
  return { title: `${displayName} posted a video`, body: trimmed || 'Tap to watch the new video' };
}

function buildDeepLink(type, postId, fromUserId) {
  const platform = process.env.APP_PLATFORM || 'com.bilal.asab';
  if (type === 'live' && postId) {
    return `${platform}://live-viewer?streamId=${encodeURIComponent(postId)}`;
  }
  if (postId) return `${platform}://post/${encodeURIComponent(postId)}`;
  if (fromUserId) return `${platform}://profile/${encodeURIComponent(fromUserId)}`;
  return null;
}

async function sendExpoPushBatch(messages) {
  if (!messages.length) return;
  await axios.post(EXPO_PUSH_URL, messages, {
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
  });
}

async function fetchPushTokensForUserIds(userIds) {
  const userCol = process.env.APPWRITE_USER_COLLECTION_ID;
  if (!userCol) return [];

  const tokens = [];
  for (const userId of userIds) {
    try {
      const url = `${collectionUrl(userCol)}/${userId}`;
      const user = await appwriteGet(url);
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

async function broadcastContentNotifications({
  creatorUserId,
  creatorEmail,
  type,
  postId,
  title,
}) {
  if (!process.env.APPWRITE_API_KEY) {
    throw new Error('APPWRITE_API_KEY not configured on server');
  }

  if (!isPlatformBroadcaster({ userId: creatorUserId, email: creatorEmail })) {
    throw new Error('Not authorized for platform broadcast');
  }

  const userCol = process.env.APPWRITE_USER_COLLECTION_ID;
  const notifCol = process.env.APPWRITE_NOTIFICATIONS_COLLECTION_ID;
  if (!userCol || !notifCol) {
    throw new Error('APPWRITE_USER_COLLECTION_ID and APPWRITE_NOTIFICATIONS_COLLECTION_ID required');
  }

  const creatorUrl = `${collectionUrl(userCol)}/${creatorUserId}`;
  const creator = await appwriteGet(creatorUrl);
  const fromUsername = creator?.username || 'ASAB';
  const fromUserAvatar = normalizeAvatar(creator?.avatar);

  const recipientIds = await listAllUserIds(creatorUserId);
  if (!recipientIds.length) {
    return { notified: 0, pushed: 0, recipients: 0 };
  }

  const notifiedIds = [];

  for (let i = 0; i < recipientIds.length; i += NOTIFY_BATCH) {
    const batch = recipientIds.slice(i, i + NOTIFY_BATCH);
    const results = await Promise.allSettled(
      batch.map((targetUserId) =>
        createNotificationDoc({
          type,
          fromUserId: creatorUserId,
          fromUsername,
          fromUserAvatar,
          targetUserId,
          postId,
        })
      )
    );

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') notifiedIds.push(batch[index]);
    });

    if (i + NOTIFY_BATCH < recipientIds.length) {
      await new Promise((r) => setTimeout(r, 80));
    }
  }

  const pushTargets = notifiedIds.length ? notifiedIds : recipientIds;
  const tokenEntries = await fetchPushTokensForUserIds(pushTargets);
  const { title: pushTitle, body } = buildPushCopy(type, fromUsername, title);
  const deepLink = buildDeepLink(type, postId, creatorUserId);
  const channelId = type === 'live' ? 'live-streams' : 'creator-content';
  const pushType = type === 'live' ? 'live' : type;

  const messages = tokenEntries.map(({ token }) => ({
    to: token,
    title: pushTitle,
    body,
    sound: 'default',
    priority: 'high',
    channelId,
    data: {
      type: pushType,
      streamId: type === 'live' ? postId : undefined,
      postId: type !== 'live' ? postId : undefined,
      fromUserId: creatorUserId,
      url: deepLink || undefined,
      broadcast: true,
    },
  }));

  for (let i = 0; i < messages.length; i += PUSH_BATCH) {
    await sendExpoPushBatch(messages.slice(i, i + PUSH_BATCH));
  }

  return {
    notified: notifiedIds.length,
    pushed: tokenEntries.length,
    recipients: recipientIds.length,
  };
}

async function handleBroadcastContentRequest(req, res) {
  try {
    const { creatorUserId, creatorEmail, type, postId, title } = req.body || {};

    if (!creatorUserId || !type) {
      return res.status(400).json({ error: 'creatorUserId and type are required' });
    }

    if (!['live', 'video_post', 'photo_post'].includes(type)) {
      return res.status(400).json({ error: 'Invalid notification type' });
    }

    const result = await broadcastContentNotifications({
      creatorUserId,
      creatorEmail,
      type,
      postId: postId || null,
      title: title || '',
    });

    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    const message = error?.response?.data?.message || error?.message || 'Broadcast failed';
    console.error('[adminBroadcast]', message);
    return res.status(error?.message?.includes('Not authorized') ? 403 : 500).json({ error: message });
  }
}

module.exports = {
  handleBroadcastContentRequest,
  isPlatformBroadcaster,
  broadcastContentNotifications,
};
