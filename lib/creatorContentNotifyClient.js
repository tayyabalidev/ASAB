/**
 * Prefer server-side creator content notify (API key reads tokens) — same path as DM push relay.
 */

function getCreatorNotifyBaseUrl() {
  const dedicated = process.env.EXPO_PUBLIC_CREATOR_NOTIFY_URL;
  if (dedicated && String(dedicated).trim()) {
    return String(dedicated).trim().replace(/\/$/, '');
  }

  const url =
    process.env.EXPO_PUBLIC_PROCESSING_SERVER_URL ||
    process.env.EXPO_PUBLIC_SERVER_URL ||
    '';
  const trimmed = typeof url === 'string' ? url.trim().replace(/\/$/, '') : '';
  if (!trimmed) return '';
  // Shared PROCESSING URL may point at an unrelated Appwrite Function (e.g. stream-access).
  // Only use dedicated CREATOR_NOTIFY_URL for *.appwrite.run hosts.
  if (trimmed.includes('appwrite.run')) return '';
  return trimmed;
}

function getCreatorNotifyEndpoint(base) {
  if (!base) return '';
  if (base.includes('/api/creator/notify-content')) return base;
  return `${base}/api/creator/notify-content`;
}

/**
 * Server fan-out for creator post/live (followers + subscribers + favorites).
 * @returns {Promise<boolean>} true if server handled the request
 */
export async function requestCreatorContentNotify({
  creatorId,
  creatorEmail = '',
  type,
  postId,
  title,
  recipientIds = null,
}) {
  if (!creatorId || !type) return false;

  const base = getCreatorNotifyBaseUrl();
  if (!base) return false;

  const endpoint = getCreatorNotifyEndpoint(base);
  if (!endpoint) return false;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creatorUserId: creatorId,
        creatorEmail: creatorEmail || '',
        type,
        postId: postId || null,
        title: title || '',
        recipientIds: Array.isArray(recipientIds) ? recipientIds : undefined,
      }),
    });

    if (!response.ok) {
      if (__DEV__) {
        const text = await response.text().catch(() => '');
        console.warn('[notifications] Creator notify API failed:', response.status, text);
      }
      return false;
    }

    const result = await response.json().catch(() => ({}));
    if (__DEV__) {
      console.log(
        `[notifications] Creator notify OK — recipients: ${result.recipients}, in-app: ${result.notified}, push: ${result.pushed}`
      );
    }
    if (result.ok === false) return false;
    if (result.recipients == null) return false;
    return true;
  } catch (error) {
    if (__DEV__) {
      console.warn('[notifications] Creator notify request failed:', error?.message || error);
    }
    return false;
  }
}
