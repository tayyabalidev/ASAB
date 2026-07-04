import { Query } from 'react-native-appwrite';
import { AppState } from 'react-native';
import { client, databases, appwriteConfig } from './appwrite';

const MESSAGE_PAGE_SIZE = 100;
const POLL_INTERVAL_ACTIVE_MS = 3000;
const POLL_INTERVAL_BACKGROUND_MS = 15000;
const REALTIME_DEBOUNCE_MS = 300;

/** @type {{
 *   userId: string,
 *   groupIds: string[],
 *   intervalId: ReturnType<typeof setInterval> | null,
 *   realtimeUnsub: (() => void) | null,
 *   disposed: boolean,
 *   realtimeDisabled: boolean,
 *   realtimeDebounceId: ReturnType<typeof setTimeout> | null,
 * } | null} */
let subscription = null;
/** @type {Set<(payload: { messages: object[], reason: string }) => void>} */
const listeners = new Set();
let appStateSubscription = null;
let appState = AppState.currentState;

function buildMessageQueries(userId, groupIds = []) {
  const clauses = [
    Query.equal('senderId', [userId]),
    Query.equal('receiverId', [userId]),
  ];
  if (groupIds.length > 0) {
    clauses.push(Query.equal('chatId', groupIds));
  }
  return [Query.or(clauses), Query.orderDesc('$createdAt'), Query.limit(MESSAGE_PAGE_SIZE)];
}

async function fetchUserMessages(userId, groupIds = []) {
  const all = [];
  let offset = 0;

  while (true) {
    const baseQueries = buildMessageQueries(userId, groupIds).slice(0, -1);
    const page = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.messagesCollectionId,
      [...baseQueries, Query.limit(MESSAGE_PAGE_SIZE), Query.offset(offset)]
    );
    all.push(...page.documents);
    if (page.documents.length < MESSAGE_PAGE_SIZE) break;
    offset += MESSAGE_PAGE_SIZE;
  }

  return all.sort((a, b) => new Date(a.$createdAt) - new Date(b.$createdAt));
}

function messageInvolvesUser(msg, userId, groupIds) {
  if (!msg || !userId) return false;
  if (msg.senderId === userId || msg.receiverId === userId) return true;
  if (msg.chatId && groupIds.includes(msg.chatId)) return true;
  return false;
}

function getPollInterval() {
  return appState === 'active' ? POLL_INTERVAL_ACTIVE_MS : POLL_INTERVAL_BACKGROUND_MS;
}

async function fetchAndNotify(reason) {
  if (!subscription?.userId || subscription.disposed) return;

  try {
    const messages = await fetchUserMessages(subscription.userId, subscription.groupIds);
    if (!subscription || subscription.disposed) return;

    const payload = { messages, reason };
    listeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (_) {
        /* listener error */
      }
    });
  } catch (_) {
    /* fetch failed */
  }
}

function scheduleRealtimeRefresh() {
  if (!subscription || subscription.disposed) return;
  if (subscription.realtimeDebounceId) clearTimeout(subscription.realtimeDebounceId);
  subscription.realtimeDebounceId = setTimeout(() => {
    if (!subscription || subscription.disposed) return;
    subscription.realtimeDebounceId = null;
    fetchAndNotify('realtime');
  }, REALTIME_DEBOUNCE_MS);
}

function disconnectRealtime() {
  if (!subscription) return;
  if (subscription.realtimeDebounceId) {
    clearTimeout(subscription.realtimeDebounceId);
    subscription.realtimeDebounceId = null;
  }
  if (subscription.realtimeUnsub) {
    try {
      subscription.realtimeUnsub();
    } catch (_) {}
    subscription.realtimeUnsub = null;
  }
}

function connectRealtime() {
  if (!subscription || subscription.disposed || subscription.realtimeDisabled || appState !== 'active') {
    return;
  }

  disconnectRealtime();

  const channel = `databases.${appwriteConfig.databaseId}.collections.${appwriteConfig.messagesCollectionId}.documents`;
  const { userId, groupIds } = subscription;

  try {
    subscription.realtimeUnsub = client.subscribe(channel, (response) => {
      if (!subscription || subscription.disposed) return;
      const payload = response?.payload;
      if (!messageInvolvesUser(payload, userId, groupIds)) return;
      scheduleRealtimeRefresh();
    });
  } catch (_) {
    subscription.realtimeDisabled = true;
  }
}

function restartPolling() {
  if (!subscription || subscription.disposed) return;
  if (subscription.intervalId) clearInterval(subscription.intervalId);
  subscription.intervalId = setInterval(() => {
    if (!subscription || subscription.disposed) return;
    fetchAndNotify('poll');
  }, getPollInterval());
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
  if (subscription.intervalId) clearInterval(subscription.intervalId);
  disconnectRealtime();
  subscription = null;
  if (listeners.size === 0) removeAppStateListener();
}

function startSubscription(userId, groupIds = []) {
  subscription = {
    userId,
    groupIds: [...groupIds],
    intervalId: null,
    realtimeUnsub: null,
    disposed: false,
    realtimeDisabled: false,
    realtimeDebounceId: null,
  };
  ensureAppStateListener();
  fetchAndNotify('initial');
  restartPolling();
  connectRealtime();
}

/** Update group chat IDs included in the message subscription (call when groups load). */
export function updateMessageSubscriptionGroups(groupIds) {
  if (!subscription || subscription.disposed) return;
  subscription.groupIds = [...(groupIds || [])];
  fetchAndNotify('groups');
}

export function refreshMessageUpdates() {
  fetchAndNotify('refresh');
}

/**
 * Subscribe to DM + group messages for a user.
 * Appwrite Realtime with 3s polling fallback.
 */
export function subscribeMessageUpdates(userId, listener, options = {}) {
  if (!userId || typeof listener !== 'function') return () => {};

  const groupIds = options.groupIds || [];
  listeners.add(listener);

  if (!subscription || subscription.userId !== userId) {
    teardownSubscription();
    startSubscription(userId, groupIds);
  } else {
    subscription.groupIds = [...groupIds];
    fetchAndNotify('subscribe');
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) teardownSubscription();
  };
}

/** Called when a message push arrives while the app is open. */
export function refreshMessagesFromPush() {
  scheduleRealtimeRefresh();
}
