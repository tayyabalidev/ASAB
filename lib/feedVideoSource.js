/**
 * Build an expo-video source for feed playback (Mux HLS + progressive URLs).
 * @param {string | null | undefined} uri
 * @returns {import('expo-video').VideoSource | null}
 */
export function buildFeedVideoSource(uri) {
  if (!uri || typeof uri !== 'string') return null;
  const url = uri.trim();
  if (!url) return null;
  if (url.includes('.m3u8')) {
    return { uri: url, contentType: 'hls' };
  }
  return { uri: url };
}
