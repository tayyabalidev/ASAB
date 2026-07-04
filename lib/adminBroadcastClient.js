import { isPlatformBroadcaster } from './ceo';

function getBroadcastServerUrl() {
  const dedicated = process.env.EXPO_PUBLIC_ADMIN_BROADCAST_URL;
  if (dedicated && String(dedicated).trim()) {
    return String(dedicated).trim().replace(/\/$/, '');
  }

  const url =
    process.env.EXPO_PUBLIC_PROCESSING_SERVER_URL ||
    process.env.EXPO_PUBLIC_SERVER_URL ||
    '';
  return typeof url === 'string' ? url.trim().replace(/\/$/, '') : '';
}

function getBroadcastEndpoint(base) {
  if (!base) return '';
  if (base.includes('appwrite.run') && !base.includes('/api/admin')) {
    return base;
  }
  return `${base}/api/admin/broadcast-content`;
}

/**
 * Server-side admin/CEO broadcast (lists all users with API key + sends push).
 * Returns true if the server handled it; false to fall back to client fan-out.
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

  const base = getBroadcastServerUrl();
  if (!base) {
    if (__DEV__) {
      console.warn(
        '[notifications] Set EXPO_PUBLIC_ADMIN_BROADCAST_URL (Appwrite function) or EXPO_PUBLIC_PROCESSING_SERVER_URL for admin push to all users.'
      );
    }
    return false;
  }

  const endpoint = getBroadcastEndpoint(base);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creatorUserId: creatorId,
        creatorEmail: creatorAccount?.email || '',
        type,
        postId: postId || null,
        title: title || '',
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      if (__DEV__) {
        console.warn('[notifications] Admin broadcast API failed:', response.status, body);
      }
      return false;
    }

    const result = await response.json().catch(() => ({}));
    if (__DEV__) {
      console.log(
        `[notifications] Admin broadcast OK — recipients: ${result.recipients}, in-app: ${result.notified}, push: ${result.pushed}`
      );
    }
    return true;
  } catch (error) {
    if (__DEV__) {
      console.warn('[notifications] Admin broadcast request failed:', error?.message || error);
    }
    return false;
  }
}
