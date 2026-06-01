/**
 * VideoSDK HLS URL selection — prefer live edge (low latency) over DVR playback URL.
 */

/**
 * @param {Record<string, unknown> | null | undefined} source
 * @returns {string | null}
 */
export function pickLiveHlsUrl(source) {
  if (!source || typeof source !== 'object') return null;
  const u =
    source.livestreamUrl ||
    source.playbackHlsUrl ||
    source.downstreamUrl;
  return typeof u === 'string' && u.length > 0 ? u : null;
}

/**
 * Seek HLS player near the live edge (reduces startup buffer lag).
 * @param {import('expo-video').VideoPlayer} player
 */
export function seekHlsNearLiveEdge(player) {
  if (!player) return;
  try {
    const duration = player.duration;
    if (typeof duration === 'number' && Number.isFinite(duration) && duration > 4) {
      player.currentTime = Math.max(0, duration - 2);
    }
  } catch (_) {
    /* live playlists may not expose duration immediately */
  }
}
