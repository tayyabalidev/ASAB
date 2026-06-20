import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { databases, appwriteConfig } from './appwrite';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const LIVE_CHANNEL_ID = 'live-streams';
const MESSAGE_CHANNEL_ID = 'messages';

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
        const shouldAlert = type === 'live' || type === 'message';
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

async function ensureAndroidChannels() {
  await ensureAndroidLiveChannel();
  await ensureAndroidMessageChannel();
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
 * Notify followers that a host went live (device push + in-app notification is separate).
 */
export async function sendLiveStreamPushNotifications({
  hostUserId,
  hostUsername,
  streamId,
  streamTitle,
  followerIds,
}) {
  if (!isPushAvailable() || !streamId || !followerIds?.length) return;

  const recipients = followerIds.filter((id) => id && id !== hostUserId);
  if (!recipients.length) return;

  const tokenEntries = await fetchPushTokensForUsers(recipients);
  if (!tokenEntries.length) return;

  const displayName = hostUsername || 'Someone';
  const title = `${displayName} is live`;
  const body =
    streamTitle && String(streamTitle).trim()
      ? String(streamTitle).trim()
      : 'Tap to watch the live stream';

  const deepLink = `${appwriteConfig.platform}://live-viewer?streamId=${encodeURIComponent(streamId)}`;

  const messages = tokenEntries.map(({ token }) => ({
    to: token,
    title,
    body,
    sound: 'default',
    priority: 'high',
    channelId: LIVE_CHANNEL_ID,
    data: {
      type: 'live',
      streamId,
      fromUserId: hostUserId,
      url: deepLink,
    },
  }));

  const chunkSize = 100;
  for (let i = 0; i < messages.length; i += chunkSize) {
    await sendExpoPushBatch(messages.slice(i, i + chunkSize));
  }
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

  const tokenEntries = await fetchPushTokensForUsers([toUserId]);
  if (!tokenEntries.length) return;

  const displayName = fromUsername || 'Someone';
  const title = displayName;
  const body =
    messagePreview && String(messagePreview).trim()
      ? String(messagePreview).trim().slice(0, 180)
      : 'Sent you a message';

  const deepLink = `${appwriteConfig.platform}://chat?userId=${encodeURIComponent(fromUserId)}`;

  await sendExpoPushBatch(
    tokenEntries.map(({ token }) => ({
      to: token,
      title,
      body,
      sound: 'default',
      priority: 'high',
      channelId: MESSAGE_CHANNEL_ID,
      data: {
        type: 'message',
        fromUserId,
        userId: fromUserId,
        url: deepLink,
      },
    }))
  );
}

export function navigateFromPushPayload(router, data) {
  if (!router || !data) return false;

  const type = data.type;
  const streamId = data.streamId;
  const fromUserId = data.fromUserId || data.userId;

  if (type === 'message' && fromUserId) {
    router.push({
      pathname: '/chat',
      params: { userId: String(fromUserId) },
    });
    return true;
  }

  if (type === 'live' && streamId) {
    router.push({
      pathname: '/live-viewer',
      params: { streamId: String(streamId) },
    });
    return true;
  }

  if (data.url && typeof data.url === 'string') {
    const messageMatch = data.url.match(/chat\?userId=([^&]+)/i);
    if (messageMatch?.[1]) {
      router.push({
        pathname: '/chat',
        params: { userId: decodeURIComponent(messageMatch[1]) },
      });
      return true;
    }

    const liveMatch = data.url.match(/live-viewer\?streamId=([^&]+)/i);
    if (liveMatch?.[1]) {
      router.push({
        pathname: '/live-viewer',
        params: { streamId: decodeURIComponent(liveMatch[1]) },
      });
      return true;
    }
  }

  return false;
}

export function extractPushData(notification) {
  return notification?.request?.content?.data || null;
}
