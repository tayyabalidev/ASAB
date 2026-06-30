import { AppState } from 'react-native';
import { client, appwriteConfig, getNotifications } from './appwrite';
import { badgeService } from './badgeService';

const POLL_INTERVAL_ACTIVE_MS = 8000;
const POLL_INTERVAL_BACKGROUND_MS = 25000;
/** Realtime websockets are flaky in Expo dev / fast refresh; keep polling as the reliable path. */
const ENABLE_NOTIFICATION_REALTIME = !__DEV__;

/** @type {{
 *   userId: string,
 *   intervalId: ReturnType<typeof setInterval> | null,
 *   realtimeUnsub: (() => void) | null,
 *   disposed: boolean,
 *   realtimeDisabled: boolean,
 * } | null} */
let subscription = null;
/** @type {Set<(payload: { notifications: object[], unreadCount: number, reason: string }) => void>} */
const listeners = new Set();
let appStateSubscription = null;
let appState = AppState.currentState;

function countUnread(notifications) {
  return (notifications || []).filter((n) => !n.isRead && n.isRead !== true).length;
}

function getPollInterval() {
  return appState === 'active' ? POLL_INTERVAL_ACTIVE_MS : POLL_INTERVAL_BACKGROUND_MS;
}

function restartPolling() {
  if (!subscription || subscription.disposed) return;

  if (subscription.intervalId) {
    clearInterval(subscription.intervalId);
  }

  subscription.intervalId = setInterval(() => {
    if (!subscription || subscription.disposed) return;
    fetchAndNotify('poll');
  }, getPollInterval());
}

async function fetchAndNotify(reason) {
  if (!subscription?.userId || subscription.disposed) return;

  try {
    const notifications = await getNotifications(subscription.userId);
    if (!subscription || subscription.disposed) return;

    const payload = {
      notifications,
      unreadCount: countUnread(notifications),
      reason,
    };

    listeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (_) {
        /* listener error */
      }
    });

    if (reason === 'realtime' || reason === 'initial' || reason === 'refresh' || reason === 'foreground') {
      badgeService.updateBadge(subscription.userId);
    }
  } catch (_) {
    /* fetch failed */
  }
}

function disconnectRealtime() {
  if (!subscription?.realtimeUnsub) return;

  try {
    subscription.realtimeUnsub();
  } catch (_) {
    /* unsubscribe failed */
  }

  subscription.realtimeUnsub = null;
}

function connectRealtime() {
  if (
    !subscription ||
    subscription.disposed ||
    subscription.realtimeDisabled ||
    !ENABLE_NOTIFICATION_REALTIME ||
    appState !== 'active'
  ) {
    return;
  }

  disconnectRealtime();

  const channel = `databases.${appwriteConfig.databaseId}.collections.${appwriteConfig.notificationsCollectionId}.documents`;
  const userId = subscription.userId;

  try {
    subscription.realtimeUnsub = client.subscribe(channel, (response) => {
      if (!subscription || subscription.disposed) return;

      const payload = response?.payload;
      if (!payload || payload.targetUserId !== userId) return;
      fetchAndNotify('realtime');
    });
  } catch (_) {
    subscription.realtimeDisabled = true;
  }
}

function handleAppStateChange(nextState) {
  const wasBackground = appState.match(/inactive|background/);
  appState = nextState;

  if (!subscription || subscription.disposed) return;

  if (wasBackground && nextState === 'active') {
    fetchAndNotify('foreground');
    restartPolling();
    connectRealtime();
    return;
  }

  if (nextState.match(/inactive|background/)) {
    disconnectRealtime();
    restartPolling();
  }
}

function ensureAppStateListener() {
  if (appStateSubscription) return;

  appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
}

function removeAppStateListener() {
  appStateSubscription?.remove?.();
  appStateSubscription = null;
}

function teardownSubscription() {
  if (!subscription) return;

  subscription.disposed = true;

  if (subscription.intervalId) {
    clearInterval(subscription.intervalId);
  }

  disconnectRealtime();
  subscription = null;

  if (listeners.size === 0) {
    removeAppStateListener();
  }
}

function startSubscription(userId) {
  subscription = {
    userId,
    intervalId: null,
    realtimeUnsub: null,
    disposed: false,
    realtimeDisabled: false,
  };

  ensureAppStateListener();
  fetchAndNotify('initial');
  restartPolling();
  connectRealtime();
}

/**
 * Subscribe to in-app notification updates for a user.
 * Uses polling (always) + Appwrite Realtime in production when the app is foregrounded.
 */
export function subscribeNotificationUpdates(userId, listener) {
  if (!userId || typeof listener !== 'function') {
    return () => {};
  }

  listeners.add(listener);

  if (!subscription || subscription.userId !== userId) {
    teardownSubscription();
    startSubscription(userId);
  } else {
    fetchAndNotify('subscribe');
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      teardownSubscription();
    }
  };
}

/** Force a refresh for all active listeners (e.g. after local delete). */
export function refreshNotificationUpdates() {
  fetchAndNotify('refresh');
}

export function getNotificationsRealtimeChannel() {
  return `databases.${appwriteConfig.databaseId}.collections.${appwriteConfig.notificationsCollectionId}.documents`;
}
