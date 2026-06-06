/**
 * VideoSDK HLS URL selection — prefer live edge (low latency) over DVR playback URL.
 */

/**
 * @param {Record<string, unknown> | null | undefined} source
 * @returns {string | null}
 */
export function pickLiveHlsUrl(source) {
  if (!source || typeof source !== 'object') return null;
  // livestreamUrl = continuous live edge (lowest latency). playbackHlsUrl adds DVR buffer.
  const candidates = [
    source.livestreamUrl,
    source.playbackHlsUrl,
    source.downstreamUrl,
  ];
  for (const u of candidates) {
    if (typeof u === 'string' && u.length > 0) return u;
  }
  return null;
}

/** How far behind the live edge the player may drift before re-syncing. */
const LIVE_EDGE_LAG_SECONDS = 3;

/**
 * Seek HLS player near the live edge (reduces startup buffer lag).
 * @param {import('expo-video').VideoPlayer} player
 */
export function seekHlsNearLiveEdge(player) {
  if (!player) return;
  try {
    const duration = player.duration;
    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 1.5) {
      return;
    }
    const target = Math.max(0, duration - 1);
    if (
      typeof player.currentTime !== 'number' ||
      !Number.isFinite(player.currentTime) ||
      duration - player.currentTime > LIVE_EDGE_LAG_SECONDS
    ) {
      player.currentTime = target;
    }
  } catch (_) {
    /* live playlists may not expose duration immediately */
  }
}

/** Interval for keeping viewers near the HLS live edge during playback. */
export const HLS_LIVE_EDGE_SYNC_MS = 6000;
