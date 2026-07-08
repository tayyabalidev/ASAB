import { client, appwriteConfig } from './appwrite';

const COOLDOWN_MS = 30000;
const RECONNECT_DELAY_MS = 800;

let failureCount = 0;
let disabledUntil = 0;
let globalUnsub = null;
let connectTimer = null;
/** @type {Map<string, Set<(response: object) => void>>} */
const channelHandlers = new Map();

function isInvalidStateError(error) {
  const msg = String(error?.message || error || '');
  return msg.includes('INVALID_STATE') || msg.includes('WebSocket');
}

export function isAppwriteRealtimeEnabled() {
  if (process.env.EXPO_PUBLIC_DISABLE_APPWRITE_REALTIME === 'true') return false;
  return Date.now() >= disabledUntil;
}

export function reportAppwriteRealtimeFailure(error) {
  if (!isInvalidStateError(error)) return;
  failureCount += 1;
  const backoff = Math.min(COOLDOWN_MS * failureCount, 120000);
  disabledUntil = Date.now() + backoff;
  if (__DEV__) {
    console.warn(`[realtime] WebSocket unstable — polling fallback for ${Math.round(backoff / 1000)}s`);
  }
  teardownGlobalRealtime();
}

function getChannelKey(channel) {
  return String(channel || '');
}

function dispatchRealtimeResponse(response) {
  const channels = Array.isArray(response?.channels) ? response.channels : [];
  const payload = response?.payload;

  channels.forEach((channel) => {
    const handlers = channelHandlers.get(getChannelKey(channel));
    if (!handlers) return;
    handlers.forEach((handler) => {
      try {
        handler({ ...response, payload, channel });
      } catch (_) {
        /* handler error */
      }
    });
  });

  if (!channels.length && payload) {
    channelHandlers.forEach((handlers) => {
      handlers.forEach((handler) => {
        try {
          handler({ ...response, payload });
        } catch (_) {}
      });
    });
  }
}

function teardownGlobalRealtime() {
  if (connectTimer) {
    clearTimeout(connectTimer);
    connectTimer = null;
  }
  if (globalUnsub) {
    try {
      globalUnsub();
    } catch (_) {}
    globalUnsub = null;
  }
}

function ensureGlobalRealtimeConnected() {
  if (!isAppwriteRealtimeEnabled()) return;
  if (globalUnsub || connectTimer) return;
  if (channelHandlers.size === 0) return;

  const channels = [...channelHandlers.keys()];
  if (!channels.length) return;

  connectTimer = setTimeout(() => {
    connectTimer = null;
    if (!isAppwriteRealtimeEnabled() || globalUnsub) return;

    try {
      globalUnsub = client.subscribe(channels, (response) => {
        try {
          dispatchRealtimeResponse(response);
        } catch (error) {
          reportAppwriteRealtimeFailure(error);
        }
      });
      failureCount = 0;
    } catch (error) {
      reportAppwriteRealtimeFailure(error);
    }
  }, RECONNECT_DELAY_MS);
}

/**
 * Register a handler for one Appwrite realtime channel.
 * Uses a single shared WebSocket for all channels to avoid INVALID_STATE_ERR.
 */
export function registerAppwriteRealtimeChannel(channel, handler) {
  const key = getChannelKey(channel);
  if (!key || typeof handler !== 'function') return () => {};

  const isNewChannel = !channelHandlers.has(key);
  if (!channelHandlers.has(key)) {
    channelHandlers.set(key, new Set());
  }
  channelHandlers.get(key).add(handler);

  if (isNewChannel && (globalUnsub || connectTimer)) {
    teardownGlobalRealtime();
  }
  ensureGlobalRealtimeConnected();

  return () => {
    const handlers = channelHandlers.get(key);
    if (!handlers) return;
    handlers.delete(handler);
    if (handlers.size === 0) {
      channelHandlers.delete(key);
    }
    if (channelHandlers.size === 0) {
      teardownGlobalRealtime();
    } else if (globalUnsub) {
      teardownGlobalRealtime();
      ensureGlobalRealtimeConnected();
    }
  };
}

/** Call when app returns to foreground — retry realtime after cooldown. */
export function refreshAppwriteRealtimeConnection() {
  if (!isAppwriteRealtimeEnabled()) return;
  if (channelHandlers.size === 0) return;
  teardownGlobalRealtime();
  ensureGlobalRealtimeConnected();
}

export function getNotificationsRealtimeChannel() {
  return `databases.${appwriteConfig.databaseId}.collections.${appwriteConfig.notificationsCollectionId}.documents`;
}

export function getMessagesRealtimeChannel() {
  return `databases.${appwriteConfig.databaseId}.collections.${appwriteConfig.messagesCollectionId}.documents`;
}

export function getCallsRealtimeChannel() {
  return `databases.${appwriteConfig.databaseId}.collections.${appwriteConfig.callsCollectionId}.documents`;
}

export function getCallDocumentRealtimeChannel(callId) {
  if (!callId) return '';
  return `databases.${appwriteConfig.databaseId}.collections.${appwriteConfig.callsCollectionId}.documents.${callId}`;
}
