/**
 * Relay Expo push through the Node server (API key reads expoPushToken).
 * Falls back silently when the server URL is unset or the request fails.
 */

function getPushRelayEndpoint() {
  const dedicated = process.env.EXPO_PUBLIC_PUSH_RELAY_URL;
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
  return `${trimmed}/api/push/send`;
}

/**
 * @returns {Promise<boolean>} true if server accepted and sent (or had no tokens)
 */
export async function relayPushNotification({
  toUserIds,
  title,
  body,
  channelId,
  data,
}) {
  const endpoint = getPushRelayEndpoint();
  if (!endpoint) return false;

  const recipients = [...new Set((toUserIds || []).filter(Boolean))];
  if (!recipients.length) return false;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toUserIds: recipients,
        title,
        body,
        channelId,
        data,
      }),
    });

    if (!response.ok) {
      if (__DEV__) {
        const text = await response.text().catch(() => '');
        console.warn('[push] Relay failed:', response.status, text);
      }
      return false;
    }

    return true;
  } catch (error) {
    if (__DEV__) {
      console.warn('[push] Relay request failed:', error?.message || error);
    }
    return false;
  }
}
