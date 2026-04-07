/**
 * Map app live quality UI to VideoSDK HLS quality.
 * @param {string} [q]
 * @returns {'low' | 'med' | 'high'}
 */
export function mapLiveQualityToHls(q) {
  const v = String(q || 'auto').toLowerCase();
  if (v === '1080p' || v === 'high') return 'high';
  if (v === '720p' || v === 'med' || v === 'medium') return 'med';
  if (v === '480p' || v === 'low') return 'low';
  return 'med';
}
