/**
 * Holds the VideoSDK host JWT + route fields in memory instead of passing `hostToken`
 * through expo-router URL params (long JWTs can be truncated or mangled on iOS).
 *
 * Peek does not remove; call clearLiveHostSession when the broadcast session ends.
 */

const TTL_MS = 15 * 60 * 1000;
/** @type {Map<string, { at: number, roomId: string, hostToken: string, quality?: string, liveMode?: string }>} */
const byStreamId = new Map();

export function stashLiveHostSession({ streamId, roomId, hostToken, quality, liveMode }) {
  if (!streamId || !hostToken) return;
  byStreamId.set(String(streamId), {
    at: Date.now(),
    roomId: roomId != null ? String(roomId) : '',
    hostToken: String(hostToken),
    quality: quality != null ? String(quality) : undefined,
    liveMode: liveMode != null ? String(liveMode) : undefined,
  });
}

/**
 * @param {string} streamId
 * @returns {{ roomId: string, hostToken: string, quality?: string, liveMode?: string } | null}
 */
export function peekLiveHostSession(streamId) {
  const key = String(streamId || '');
  const entry = byStreamId.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > TTL_MS) {
    byStreamId.delete(key);
    return null;
  }
  return {
    roomId: entry.roomId,
    hostToken: entry.hostToken,
    quality: entry.quality,
    liveMode: entry.liveMode,
  };
}

export function clearLiveHostSession(streamId) {
  if (!streamId) return;
  byStreamId.delete(String(streamId));
}
