/**
 * Creator post/live fan-out — resolve followers/subscribers via API key,
 * create in-app notifications, send Expo push (same delivery path as DMs via pushRelay).
 */

const crypto = require('crypto');
const axios = require('axios');
const { fetchPushTokensForUserIds, sendExpoPushBatch } = require('./pushRelay');
const { isPlatformBroadcaster } = require('./adminBroadcast');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const DEDUPE_TYPES = new Set(['live', 'video_post', 'photo_post', 'content_post', 'post']);
const NOTIFY_BATCH = 25;
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

function collectionUrl(collectionId) {
  const db = process.env.APPWRITE_DATABASE_ID;
  return `${appwriteBase()}/databases/${db}/collections/${collectionId}/documents`;
}

function uniqueIds(ids) {
  return [...new Set((ids || []).filter(Boolean).map(String))];
}

function parseSubscribers(raw) {
  if (Array.isArray(raw)) return uniqueIds(raw);
  if (typeof raw === 'string' && raw.trim()) {
    return uniqueIds(raw.split(',').map((part) => part.trim()));
  }
  return [];
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
    const response = await appwriteGet(`${collectionUrl(userCol)}?${queryString}`);

    for (const doc of response.documents || []) {
      if (!excludeUserId || doc.$id !== excludeUserId) ids.push(doc.$id);
    }

    if ((response.documents || []).length < pageSize) break;
    cursor = response.documents[response.documents.length - 1].$id;
  }

  return ids;
}

function resolveAudienceFromCreator(creator, creatorUserId) {
  const followers = Array.isArray(creator.followers) ? creator.followers : [];
  const favorites = Array.isArray(creator.profileLikes) ? creator.profileLikes : [];
  const subscribers = parseSubscribers(creator.notificationSubscribers);
  return uniqueIds([...followers, ...favorites, ...subscribers]).filter(
    (id) => id && id !== String(creatorUserId)
  );
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
  try {
    const response = await appwriteGet(`${collectionUrl(notifCol)}?${q}&limit=1`);
    return response.documents?.[0] || null;
  } catch (_) {
    return null;
  }
}

async function createNotificationDoc({
  type,
  fromUserId,
  fromUsername,
  fromUserAvatar,
  targetUserId,
  postId,
}) {
  const notifCol = process.env.APPWRITE_NOTIFICATIONS_COLLECTION_ID;
  if (!notifCol) throw new Error('APPWRITE_NOTIFICATIONS_COLLECTION_ID not configured');

  if (DEDUPE_TYPES.has(type)) {
    const existing = await findExistingNotification(type, fromUserId, targetUserId, postId);
    if (existing) return existing;
  }

  const docId = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  return appwritePost(collectionUrl(notifCol), {
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

function buildPushCopy(type, displayName, title, broadcast) {
  const trimmed = title && String(title).trim() ? String(title).trim() : '';

  if (broadcast) {
    if (type === 'live') {
      return { title: 'Admin is now LIVE!', body: 'Join the stream now.' };
    }
    return { title: 'Admin posted new content.', body: 'Tap to view.' };
  }

  if (type === 'live') {
    return {
      title: `${displayName} is LIVE now`,
      body: trimmed || 'Join the stream!',
    };
  }
  if (type === 'photo_post') {
    return {
      title: displayName,
      body: trimmed ? `just uploaded a new photo: ${trimmed}` : 'just uploaded a new photo.',
    };
  }
  if (type === 'content_post' || type === 'post') {
    return {
      title: displayName,
      body: trimmed ? `posted new content: ${trimmed}` : 'posted new content. Tap to view.',
    };
  }
  return {
    title: displayName,
    body: trimmed ? `just uploaded a new video: ${trimmed}` : 'just uploaded a new video.',
  };
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

async function notifyCreatorContent({
  creatorUserId,
  creatorEmail,
  type,
  postId,
  title,
  recipientIds,
}) {
  if (!process.env.APPWRITE_API_KEY) {
    throw new Error('APPWRITE_API_KEY not configured on server');
  }

  const userCol = process.env.APPWRITE_USER_COLLECTION_ID;
  const notifCol = process.env.APPWRITE_NOTIFICATIONS_COLLECTION_ID;
  if (!userCol || !notifCol) {
    throw new Error('APPWRITE_USER_COLLECTION_ID and APPWRITE_NOTIFICATIONS_COLLECTION_ID required');
  }

  const creator = await appwriteGet(`${collectionUrl(userCol)}/${creatorUserId}`);
  const fromUsername = creator?.username || 'Someone';
  const fromUserAvatar = normalizeAvatar(creator?.avatar);
  const broadcast = isPlatformBroadcaster({
    userId: creatorUserId,
    email: creatorEmail || creator?.email,
  });

  let recipients = [];
  if (Array.isArray(recipientIds) && recipientIds.length) {
    recipients = uniqueIds(recipientIds).filter((id) => id !== String(creatorUserId));
  } else if (broadcast) {
    recipients = await listAllUserIds(creatorUserId);
  } else {
    recipients = resolveAudienceFromCreator(creator, creatorUserId);
  }

  if (!recipients.length) {
    return { notified: 0, pushed: 0, recipients: 0, broadcast };
  }

  const notifiedIds = [];
  for (let i = 0; i < recipients.length; i += NOTIFY_BATCH) {
    const batch = recipients.slice(i, i + NOTIFY_BATCH);
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
    if (i + NOTIFY_BATCH < recipients.length) {
      await new Promise((r) => setTimeout(r, 80));
    }
  }

  const pushTargets = notifiedIds.length ? notifiedIds : recipients;
  const tokenEntries = await fetchPushTokensForUserIds(pushTargets);
  const { title: pushTitle, body } = buildPushCopy(type, fromUsername, title, broadcast);
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
      broadcast: broadcast || undefined,
    },
  }));

  let pushed = 0;
  for (let i = 0; i < messages.length; i += PUSH_BATCH) {
    const batch = messages.slice(i, i + PUSH_BATCH);
    const result = await sendExpoPushBatch(batch);
    if (result.ok) pushed += batch.length;
  }

  return {
    notified: notifiedIds.length,
    pushed,
    recipients: recipients.length,
    broadcast,
  };
}

async function handleCreatorContentNotifyRequest(req, res) {
  try {
    const { creatorUserId, creatorEmail, type, postId, title, recipientIds } = req.body || {};

    if (!creatorUserId || !type) {
      return res.status(400).json({ error: 'creatorUserId and type are required' });
    }

    if (!['live', 'video_post', 'photo_post', 'content_post', 'post'].includes(type)) {
      return res.status(400).json({ error: 'Invalid notification type' });
    }

    const result = await notifyCreatorContent({
      creatorUserId,
      creatorEmail,
      type,
      postId: postId || null,
      title: title || '',
      recipientIds,
    });

    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    const message = error?.response?.data?.message || error?.message || 'Creator notify failed';
    console.error('[creatorContentNotify]', message);
    return res.status(500).json({ error: message });
  }
}

module.exports = {
  handleCreatorContentNotifyRequest,
  notifyCreatorContent,
};
