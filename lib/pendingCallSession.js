/**
 * In-memory caller JWT for 1:1 calls (avoid refetch + keep token out of Appwrite / URL params).
 */

const TTL_MS = 15 * 60 * 1000;
/** @type {Map<string, { at: number, roomId: string, token: string }>} */
const byCallId = new Map();

export function stashCallSession({ callId, roomId, token }) {
  if (!callId || !token) return;
  byCallId.set(String(callId), {
    at: Date.now(),
    roomId: roomId != null ? String(roomId) : '',
    token: String(token),
  });
}

/**
 * @param {string} callId
 * @returns {{ roomId: string, token: string } | null}
 */
export function peekCallSession(callId) {
  const key = String(callId || '');
  const entry = byCallId.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > TTL_MS) {
    byCallId.delete(key);
    return null;
  }
  return { roomId: entry.roomId, token: entry.token };
}

export function clearCallSession(callId) {
  if (!callId) return;
  byCallId.delete(String(callId));
}
