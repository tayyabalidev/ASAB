import { AppState } from 'react-native';
import { getNotifications } from './appwrite';
import { badgeService } from './badgeService';
import {
  getNotificationsRealtimeChannel as notificationsRealtimeChannel,
  isAppwriteRealtimeEnabled,
  refreshAppwriteRealtimeConnection,
  registerAppwriteRealtimeChannel,
} from './appwriteRealtime';

const POLL_INTERVAL_ACTIVE_MS = 2000;
const POLL_INTERVAL_BACKGROUND_MS = 15000;
const REALTIME_DEBOUNCE_MS = 250;

/** @type {{
 *   userId: string,
 *   notifications: object[],
 *   intervalId: ReturnType<typeof setInterval> | null,
 *   realtimeUnsub: (() => void) | null,
 *   disposed: boolean,
 *   realtimeDebounceId: ReturnType<typeof setTimeout> | null,
 *   pollCount: number,
 * } | null} */
let subscription = null;
/** @type {Set<(payload: { notifications: object[], unreadCount: number, reason: string }) => void>} */
const listeners = new Set();
let appStateSubscription = null;
let appState = AppState.currentState;

function countUnread(notifications) {
  return (notifications || []).filter((n) => !n.isRead && n.isRead !== true).length;
}

function sortNotifications(notifications) {
  return [...(notifications || [])].sort((a, b) => {
    const aTime = new Date(a.createdAt || a.$createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || b.$createdAt || 0).getTime();
    return bTime - aTime;
  });
}

function notifyListeners(notifications, reason) {
  const sorted = sortNotifications(notifications);
  const payload = {
    notifications: sorted,
    unreadCount: countUnread(sorted),
    reason,
  };

  listeners.forEach((listener) => {
    try {
      listener(payload);
    } catch (_) {
      /* listener error */
    }
  });

  return payload;
}

function getPollInterval() {
  return appState === 'active' ? POLL_INTERVAL_ACTIVE_MS : POLL_INTERVAL_BACKGROUND_MS;
}

function shouldUpdateBadge(reason) {
  return (
    reason === 'realtime' ||
    reason === 'realtime-instant' ||
    reason === 'push' ||
    reason === 'initial' ||
    reason === 'refresh' ||
    reason === 'foreground' ||
    reason === 'focus'
  );
}

function restartPolling() {
  if (!subscription || subscription.disposed) return;

  if (subscription.intervalId) {
    clearInterval(subscription.intervalId);
  }

  subscription.intervalId = setInterval(() => {
    if (!subscription || subscription.disposed) return;
    subscription.pollCount += 1;
    fetchAndNotify('poll');
  }, getPollInterval());
}

function mergeRealtimeNotification(doc) {
  if (!subscription || !doc?.$id || doc.targetUserId !== subscription.userId) return false;

  const existing = subscription.notifications || [];
  const index = existing.findIndex((n) => n.$id === doc.$id);
  let next;

  if (index >= 0) {
    next = [...existing];
    next[index] = { ...existing[index], ...doc };
  } else {
    next = [doc, ...existing];
  }

  subscription.notifications = next;
  notifyListeners(next, 'realtime-instant');

  if (shouldUpdateBadge('realtime-instant')) {
    badgeService.updateBadge(subscription.userId);
  }

  return true;
}

async function fetchAndNotify(reason) {
  if (!subscription?.userId || subscription.disposed) return;

  try {
    const notifications = await getNotifications(subscription.userId);
    if (!subscription || subscription.disposed) return;

    subscription.notifications = notifications;
    notifyListeners(notifications, reason);

    if (shouldUpdateBadge(reason)) {
      badgeService.updateBadge(subscription.userId);
    }
  } catch (_) {
    /* fetch failed */
  }
}

function scheduleRealtimeRefresh() {
  if (!subscription || subscription.disposed) return;

  if (subscription.realtimeDebounceId) {
    clearTimeout(subscription.realtimeDebounceId);
  }

  subscription.realtimeDebounceId = setTimeout(() => {
    if (!subscription || subscription.disposed) return;
    subscription.realtimeDebounceId = null;
    fetchAndNotify('realtime');
  }, REALTIME_DEBOUNCE_MS);
}

/** Called when a push arrives while the app is open — instant inbox refresh. */
export function refreshNotificationsFromPush() {
  scheduleRealtimeRefresh();
}

function disconnectRealtime() {
  if (!subscription) return;

  if (subscription.realtimeDebounceId) {
    clearTimeout(subscription.realtimeDebounceId);
    subscription.realtimeDebounceId = null;
  }

  if (!subscription.realtimeUnsub) return;

  try {
    subscription.realtimeUnsub();
  } catch (_) {
    /* unsubscribe failed */
  }

  subscription.realtimeUnsub = null;
}

function connectRealtime() {
  if (!subscription || subscription.disposed || appState !== 'active') {
    return;
  }
  if (!isAppwriteRealtimeEnabled()) return;
  if (subscription.realtimeUnsub) return;

  const userId = subscription.userId;
  const channel = notificationsRealtimeChannel();

  subscription.realtimeUnsub = registerAppwriteRealtimeChannel(channel, (response) => {
    if (!subscription || subscription.disposed) return;

    const payload = response?.payload;
    if (!payload || payload.targetUserId !== userId) return;

    mergeRealtimeNotification(payload);
    scheduleRealtimeRefresh();
  });
}

function handleAppStateChange(nextState) {
  const wasBackground = appState.match(/inactive|background/);
  appState = nextState;

  if (!subscription || subscription.disposed) return;

  if (wasBackground && nextState === 'active') {
    fetchAndNotify('foreground');
    restartPolling();
    refreshAppwriteRealtimeConnection();
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
    notifications: [],
    intervalId: null,
    realtimeUnsub: null,
    disposed: false,
    realtimeDebounceId: null,
    pollCount: 0,
  };

  ensureAppStateListener();
  fetchAndNotify('initial');
  restartPolling();
  connectRealtime();
}

/**
 * Subscribe to in-app notification updates for a user.
 * Instant Appwrite Realtime merge + debounced full sync + 2s polling fallback.
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
    listener({
      notifications: sortNotifications(subscription.notifications),
      unreadCount: countUnread(subscription.notifications),
      reason: 'subscribe',
    });
    fetchAndNotify('subscribe');
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      teardownSubscription();
    }
  };
}

/** Force a refresh for all active listeners (e.g. after local delete or opening Inbox). */
export function refreshNotificationUpdates() {
  fetchAndNotify('refresh');
}

export { notificationsRealtimeChannel as getNotificationsRealtimeChannel };
