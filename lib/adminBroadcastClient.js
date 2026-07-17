import { functions } from './appwrite';
import { isPlatformBroadcaster } from './ceo';

function getAdminBroadcastFunctionId() {
  const explicit = process.env.EXPO_PUBLIC_ADMIN_BROADCAST_FUNCTION_ID;
  if (explicit && String(explicit).trim()) {
    return String(explicit).trim();
  }

  // Many Appwrite domains look like: https://{functionId}.nyc.appwrite.run
  const url = process.env.EXPO_PUBLIC_ADMIN_BROADCAST_URL;
  const match = String(url || '').match(
    /^https?:\/\/([a-z0-9]+)(?:\.[a-z0-9-]+)*\.appwrite\.run\/?$/i
  );
  return match?.[1] || '';
}

function getBroadcastServerUrl() {
  const dedicated = process.env.EXPO_PUBLIC_ADMIN_BROADCAST_URL;
  if (dedicated && String(dedicated).trim()) {
    return String(dedicated).trim().replace(/\/$/, '');
  }

  const url =
    process.env.EXPO_PUBLIC_PROCESSING_SERVER_URL ||
    process.env.EXPO_PUBLIC_SERVER_URL ||
    '';
  const trimmed = typeof url === 'string' ? url.trim().replace(/\/$/, '') : '';
  if (!trimmed) return '';
  if (trimmed.includes('appwrite.run')) return '';
  return trimmed;
}

function getBroadcastEndpoint(base) {
  if (!base) return '';
  if (base.includes('appwrite.run')) return base;
  if (base.includes('/api/admin/broadcast-content')) return base;
  return `${base}/api/admin/broadcast-content`;
}

function buildPayload({ creatorAccount, creatorId, type, postId, title }) {
  return {
    creatorUserId: creatorId,
    creatorEmail: creatorAccount?.email || '',
    type,
    postId: postId || null,
    title: title || '',
    // Inbox fan-out is slow; push is what matters for real-time alerts.
    skipInbox: true,
  };
}

/**
 * Prefer async Appwrite Function execution (avoids Cloudflare 524 on long broadcasts).
 * Falls back to HTTP domain / Node server.
 */
export async function requestAdminContentBroadcast({
  creatorAccount,
  creatorId,
  type,
  postId,
  title,
}) {
  if (!creatorId || !type || !isPlatformBroadcaster(creatorAccount)) {
    return false;
  }

  const payload = buildPayload({ creatorAccount, creatorId, type, postId, title });
  const functionId = getAdminBroadcastFunctionId();

  if (functionId) {
    try {
      const execution = await functions.createExecution({
        functionId,
        body: JSON.stringify(payload),
        async: true,
        xpath: '/',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });

      if (__DEV__) {
        console.log(
          `[notifications] Admin broadcast queued async — function=${functionId}, execution=${execution?.$id || 'n/a'}`
        );
      }
      // Async = accepted for background processing.
      return Boolean(execution?.$id);
    } catch (error) {
      if (__DEV__) {
        console.warn(
          '[notifications] Admin broadcast async execution failed, trying HTTP:',
          error?.message || error
        );
      }
    }
  }

  const base = getBroadcastServerUrl();
  if (!base) {
    if (__DEV__) {
      console.warn(
        '[notifications] Set EXPO_PUBLIC_ADMIN_BROADCAST_URL / EXPO_PUBLIC_ADMIN_BROADCAST_FUNCTION_ID for admin push.'
      );
    }
    return false;
  }

  const endpoint = getBroadcastEndpoint(base);

  try {
    // Short timeout — if the domain path is still sync/slow, fall back to client fan-out.
    const controller =
      typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => controller.abort(), 20000)
      : null;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller?.signal,
    });

    if (timer) clearTimeout(timer);

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      if (__DEV__) {
        console.warn(
          '[notifications] Admin broadcast API failed:',
          response.status,
          endpoint,
          body
        );
      }
      return false;
    }

    const result = await response.json().catch(() => ({}));
    if (__DEV__) {
      console.log(
        `[notifications] Admin broadcast OK — endpoint: ${endpoint}, recipients: ${result.recipients}, push: ${result.pushed}`
      );
    }
    if (Number(result.recipients) === 0) return false;
    return true;
  } catch (error) {
    if (__DEV__) {
      console.warn(
        '[notifications] Admin broadcast request failed:',
        endpoint,
        error?.message || error
      );
    }
    return false;
  }
}
