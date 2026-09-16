/**
 * Build an expo-video source for feed playback (Mux HLS + progressive URLs).
 * Appwrite `/view` URLs have no file extension; iOS needs an explicit progressive type.
 * @param {string | null | undefined} uri
 * @returns {import('expo-video').VideoSource | null}
 */
export function isHlsVideoUri(uri) {
  if (!uri || typeof uri !== 'string') return false;
  const url = uri.trim().toLowerCase();
  return url.includes('.m3u8') || url.includes('stream.mux.com');
}

export function stripPlaybackHash(uri) {
  if (!uri || typeof uri !== 'string') return uri;
  return uri.replace(/#advideo$/i, '');
}

export function buildFeedVideoSource(uri) {
  if (!uri || typeof uri !== 'string') return null;
  const url = stripPlaybackHash(uri.trim());
  if (!url) return null;
  if (isHlsVideoUri(url)) {
    return { uri: url.replace(/#.*$/, ''), contentType: 'hls' };
  }
  return { uri: url, contentType: 'progressive' };
}
