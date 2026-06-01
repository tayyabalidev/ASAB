/**
 * Map app live quality UI to VideoSDK HLS quality.
 * @param {string} [q]
 * @returns {'low' | 'med' | 'high'}
 */
export function mapLiveQualityToHls(q) {
  const v = String(q || 'auto').toLowerCase();
  if (v === '1080p' || v === 'high' || v === 'auto') return 'high';
  if (v === '720p' || v === 'med' || v === 'medium') return 'med';
  if (v === '480p' || v === 'low') return 'low';
  return 'high';
}

/**
 * WebRTC publish encoder for host camera (portrait live).
 * @param {string} [q]
 * @returns {string}
 */
export function mapLiveQualityToEncoderConfig(q) {
  const v = String(q || 'auto').toLowerCase();
  if (v === '1080p' || v === 'high') return 'h1080p_w1440p';
  if (v === '720p' || v === 'med' || v === 'medium') return 'h720p_w1280p';
  if (v === '480p' || v === 'low') return 'h480p_w640p';
  return 'h720p_w1280p';
}
