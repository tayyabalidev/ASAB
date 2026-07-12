/**
 * Warm CDN / manifest cache for an upcoming video without downloading the full file.
 * @param {string | null | undefined} uri
 */
export function prefetchVideoSource(uri) {
  if (!uri || typeof uri !== 'string') return;
  const trimmed = uri.trim();
  if (!trimmed) return;

  fetch(trimmed, {
    method: 'GET',
    headers: trimmed.includes('.m3u8') ? undefined : { Range: 'bytes=0-65535' },
  }).catch(() => {});
}

/**
 * Prefetch playback URLs for posts adjacent to the current index in a profile modal.
 * @param {Array<{ video?: string, mux_playback_id?: string, muxPlaybackId?: string }>} posts
 * @param {number} currentIndex
 * @param {(post: object) => string | null} resolveUri
 */
export function prefetchAdjacentProfileVideos(posts, currentIndex, resolveUri) {
  if (!Array.isArray(posts) || currentIndex == null || currentIndex < 0) return;

  [currentIndex - 1, currentIndex + 1].forEach((index) => {
    if (index < 0 || index >= posts.length) return;
    const uri = resolveUri(posts[index]);
    if (uri) prefetchVideoSource(uri);
  });
}
