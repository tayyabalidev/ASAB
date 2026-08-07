import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { databases, appwriteConfig } from './appwrite';
import { navigateFromPushData } from './notificationNavigation';
import { relayPushNotification } from './pushRelayClient';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const LIVE_CHANNEL_ID = 'live-streams';
const MESSAGE_CHANNEL_ID = 'messages';
const CREATOR_CONTENT_CHANNEL_ID = 'creator-content';
const ACTIVITY_CHANNEL_ID = 'activity';

const isExpoGo =
  !Constants.expoConfig || Constants.executionEnvironment === 'storeClient';

let handlerConfigured = false;

export function isPushAvailable() {
  return !isExpoGo && Device.isDevice;
}

function getEasProjectId() {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId ||
    null
  );
}

/**
 * Show alerts for live-stream and message pushes; keep badge-only for other types.
 */
export function configurePushNotificationHandler() {
  if (isExpoGo || handlerConfigured) return;

  try {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const type = notification.request.content.data?.type;
        const shouldAlert =
          type === 'live' ||
          type === 'message' ||
          type === 'like' ||
          type === 'comment' ||
          type === 'follow' ||
          type === 'profile_like' ||
          type === 'video_post' ||
          type === 'photo_post' ||
          type === 'content_post' ||
          type === 'post' ||
          type === 'location_share' ||
          type === 'location_nearby' ||
          type === 'location_invite';
        return {
          shouldShowAlert: shouldAlert,
          shouldPlaySound: shouldAlert,
          shouldSetBadge: true,
        };
      },
    });
    handlerConfigured = true;
  } catch (_) {
    /* notifications unavailable (e.g. Expo Go) */
  }
}

async function ensureAndroidLiveChannel() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(LIVE_CHANNEL_ID, {
    name: 'Live Streams',
    description: 'Alerts when someone you follow goes live',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF9C01',
    sound: 'default',
  });
}

async function ensureAndroidMessageChannel() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(MESSAGE_CHANNEL_ID, {
    name: 'Messages',
    description: 'Alerts when someone sends you a message',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#8A2BE2',
    sound: 'default',
  });
}

async function ensureAndroidCreatorContentChannel() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(CREATOR_CONTENT_CHANNEL_ID, {
    name: 'Creator Updates',
    description: 'Alerts when creators you follow post new content',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 200, 200, 200],
    lightColor: '#32CD32',
    sound: 'default',
  });
}

async function ensureAndroidActivityChannel() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(ACTIVITY_CHANNEL_ID, {
    name: 'Activity',
    description: 'Likes, comments, and follows',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 200, 200],
    lightColor: '#FF6B6B',
    sound: 'default',
  });
}

async function ensureAndroidChannels() {
  await ensureAndroidLiveChannel();
  await ensureAndroidMessageChannel();
  await ensureAndroidCreatorContentChannel();
  await ensureAndroidActivityChannel();
}

export async function savePushToken(userId, token) {
  if (!userId || !token) return false;

  try {
    await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
      userId,
      { expoPushToken: token }
    );
    return true;
  } catch (error) {
    if (__DEV__) {
      console.warn(
        '[push] Failed to save expoPushToken — add string attribute "expoPushToken" on users collection in Appwrite.',
        error?.message || error
      );
    }
    return false;
  }
}

export async function registerForPushNotifications(userId) {
  if (!isPushAvailable() || !userId) return null;

  configurePushNotificationHandler();
  await ensureAndroidChannels();

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    const projectId = getEasProjectId();
    if (!projectId) {
      if (__DEV__) {
        console.warn('[push] Missing EAS projectId — cannot register push token.');
      }
      return null;
    }

    const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResult?.data;
    if (!token) return null;

    await savePushToken(userId, token);
    return token;
  } catch (error) {
    if (__DEV__) {
      console.warn('[push] registerForPushNotifications failed', error?.message || error);
    }
    return null;
  }
}

async function fetchPushTokensForUsers(userIds) {
  const uniqueIds = [...new Set((userIds || []).filter(Boolean))];
  const tokens = [];

  for (const userId of uniqueIds) {
    try {
      const user = await databases.getDocument(
        appwriteConfig.databaseId,
        appwriteConfig.userCollectionId,
        userId
      );
      const token = user?.expoPushToken;
      if (token && typeof token === 'string' && token.startsWith('ExponentPushToken')) {
        tokens.push({ userId, token });
      }
    } catch (_) {
      /* skip missing users */
    }
  }

  return tokens;
}

async function sendExpoPushBatch(messages) {
  if (!messages.length) return;

  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });

  if (!response.ok && __DEV__) {
    const body = await response.text().catch(() => '');
    console.warn('[push] Expo push API error', response.status, body);
  }
}

/**
 * Deliver push to user IDs.
 * Prefer server relay (API key reads expoPushToken) — same path that makes DM pushes reliable.
 * Fall back to client-readable tokens when relay is unset or fails.
 */
async function deliverPushToUsers({ toUserIds, title, body, channelId, data }) {
  const recipients = [...new Set((toUserIds || []).filter(Boolean))];
  if (!recipients.length) return;

  const relayed = await relayPushNotification({
    toUserIds: recipients,
    title,
    body,
    channelId,
    data,
  });
  if (relayed) return;

  const tokenEntries = await fetchPushTokensForUsers(recipients);
  if (!tokenEntries.length) return;

  const messages = tokenEntries.map(({ token }) => ({
    to: token,
    title,
    body,
    sound: 'default',
    priority: 'high',
    channelId,
    data,
  }));

  const chunkSize = 100;
  for (let i = 0; i < messages.length; i += chunkSize) {
    await sendExpoPushBatch(messages.slice(i, i + chunkSize));
  }
}

function buildCreatorContentPushCopy(type, displayName, title, broadcast = false) {
  const trimmedTitle = title && String(title).trim() ? String(title).trim() : '';

  if (broadcast) {
    if (type === 'live') {
      return {
        title: 'Admin is now LIVE!',
        body: 'Join the stream now.',
      };
    }

    return {
      title: 'Admin posted new content.',
      body: 'Tap to view.',
    };
  }

  if (type === 'live') {
    return {
      title: `${displayName} is LIVE now`,
      body: trimmedTitle || 'Join the stream!',
    };
  }

  if (type === 'photo_post') {
    return {
      title: displayName,
      body: trimmedTitle
        ? `just uploaded a new photo: ${trimmedTitle}`
        : 'just uploaded a new photo.',
    };
  }

  if (type === 'content_post' || type === 'post') {
    return {
      title: displayName,
      body: trimmedTitle
        ? `posted new content: ${trimmedTitle}`
        : 'posted new content. Tap to view.',
    };
  }

  return {
    title: displayName,
    body: trimmedTitle
      ? `just uploaded a new video: ${trimmedTitle}`
      : 'just uploaded a new video.',
  };
}

function buildCreatorContentDeepLink(type, postId, fromUserId) {
  if (type === 'live' && postId) {
    return `${appwriteConfig.platform}://live-viewer?streamId=${encodeURIComponent(postId)}`;
  }
  if (postId) {
    return `${appwriteConfig.platform}://home?postId=${encodeURIComponent(postId)}`;
  }
  if (fromUserId) {
    return `${appwriteConfig.platform}://profile/${encodeURIComponent(fromUserId)}`;
  }
  return null;
}

/**
 * Notify bell subscribers about new creator content (video, photo, live).
 */
export async function sendCreatorContentPushNotifications({
  type,
  creatorUserId,
  creatorUsername,
  postId,
  title,
  subscriberIds,
  broadcast = false,
}) {
  if (!subscriberIds?.length || !type) return;

  const recipients = subscriberIds.filter((id) => id && id !== creatorUserId);
  if (!recipients.length) return;

  const displayName = creatorUsername || 'Someone';
  const { title: pushTitle, body } = buildCreatorContentPushCopy(type, displayName, title, broadcast);
  const deepLink = buildCreatorContentDeepLink(type, postId, creatorUserId);
  const channelId = type === 'live' ? LIVE_CHANNEL_ID : CREATOR_CONTENT_CHANNEL_ID;
  const pushType = type === 'live' ? 'live' : type;

  await deliverPushToUsers({
    toUserIds: recipients,
    title: pushTitle,
    body,
    channelId,
    data: {
      type: pushType,
      streamId: type === 'live' ? postId : undefined,
      postId: type !== 'live' ? postId : undefined,
      fromUserId: creatorUserId,
      url: deepLink || undefined,
      broadcast: broadcast || undefined,
    },
  });
}

/**
 * Notify followers that a host went live (device push + in-app notification is separate).
 */
export async function sendLiveStreamPushNotifications({
  hostUserId,
  hostUsername,
  streamId,
  streamTitle,
  followerIds,
}) {
  if (!streamId || !followerIds?.length) return;

  const recipients = followerIds.filter((id) => id && id !== hostUserId);
  if (!recipients.length) return;

  const displayName = hostUsername || 'Someone';
  const title = `${displayName} is live`;
  const body =
    streamTitle && String(streamTitle).trim()
      ? String(streamTitle).trim()
      : 'Tap to watch the live stream';

  const deepLink = `${appwriteConfig.platform}://live-viewer?streamId=${encodeURIComponent(streamId)}`;

  await deliverPushToUsers({
    toUserIds: recipients,
    title,
    body,
    channelId: LIVE_CHANNEL_ID,
    data: {
      type: 'live',
      streamId,
      fromUserId: hostUserId,
      url: deepLink,
    },
  });
}

/**
 * Notify a user that they received a direct message (device push).
 */
export async function sendMessagePushNotification({
  fromUserId,
  fromUsername,
  toUserId,
  messagePreview,
}) {
  if (!toUserId || !fromUserId || toUserId === fromUserId) return;

  const displayName = fromUsername || 'Someone';
  const title = displayName;
  const body =
    messagePreview && String(messagePreview).trim()
      ? String(messagePreview).trim().slice(0, 180)
      : 'Sent you a message';

  const deepLink = `${appwriteConfig.platform}://chat?userId=${encodeURIComponent(fromUserId)}`;

  await deliverPushToUsers({
    toUserIds: [toUserId],
    title,
    body,
    channelId: MESSAGE_CHANNEL_ID,
    data: {
      type: 'message',
      fromUserId,
      userId: fromUserId,
      url: deepLink,
    },
  });
}

/**
 * Push for likes, comments, follows (activity alerts).
 */
export async function sendActivityPushNotification({
  type,
  fromUserId,
  fromUsername,
  toUserId,
  postId = null,
}) {
  if (!toUserId || !fromUserId || toUserId === fromUserId || !type) return;

  const displayName = fromUsername || 'Someone';
  let title = displayName;
  let body = 'interacted with you';
  let deepLink = `${appwriteConfig.platform}://inbox`;

  if (type === 'like') {
    body = 'liked your post';
    if (postId) deepLink = `${appwriteConfig.platform}://home?postId=${encodeURIComponent(postId)}`;
  } else if (type === 'comment') {
    body = 'commented on your post';
    if (postId) deepLink = `${appwriteConfig.platform}://home?postId=${encodeURIComponent(postId)}`;
  } else if (type === 'follow' || type === 'profile_like') {
    body = type === 'follow' ? 'started following you' : 'liked your profile';
    deepLink = `${appwriteConfig.platform}://profile/${encodeURIComponent(fromUserId)}`;
  } else {
    return;
  }

  await deliverPushToUsers({
    toUserIds: [toUserId],
    title,
    body,
    channelId: ACTIVITY_CHANNEL_ID,
    data: {
      type,
      fromUserId,
      postId: postId || undefined,
      url: deepLink,
    },
  });
}

export function navigateFromPushPayload(router, data) {
  return navigateFromPushData(router, data);
}

export { navigateFromPushData, navigateFromInboxNotification, normalizeRouteParam } from './notificationNavigation';

export function extractPushData(notification) {
  return notification?.request?.content?.data || null;
}
