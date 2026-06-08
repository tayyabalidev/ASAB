/**
 * VideoSDK HLS URL selection and expo-video playback helpers.
 * Android ExoPlayer tolerates livestreamUrl + live-edge seeks; iOS AVPlayer is stricter.
 */
import { Platform } from 'react-native';

const HLS_URL_KEYS_ANDROID = ['livestreamUrl', 'playbackHlsUrl', 'downstreamUrl'];
const HLS_URL_KEYS_IOS = ['playbackHlsUrl', 'livestreamUrl', 'downstreamUrl'];

function hlsUrlOrder(platform = Platform.OS) {
  return platform === 'ios' ? HLS_URL_KEYS_IOS : HLS_URL_KEYS_ANDROID;
}

/**
 * @param {Record<string, unknown> | null | undefined} source
 * @param {string} [platform]
 * @returns {string[]}
 */
export function listLiveHlsUrlFallbacks(source, platform = Platform.OS) {
  if (!source || typeof source !== 'object') return [];
  const out = [];
  for (const key of hlsUrlOrder(platform)) {
    const u = source[key];
    if (typeof u === 'string' && u.length > 0 && !out.includes(u)) {
      out.push(u);
    }
  }
  return out;
}

/**
 * @param {Record<string, unknown> | null | undefined} source
 * @param {string} [platform]
 * @returns {string | null}
 */
export function pickLiveHlsUrl(source, platform = Platform.OS) {
  const urls = listLiveHlsUrlFallbacks(source, platform);
  return urls[0] || null;
}

/**
 * @param {string} uri
 * @returns {{ uri: string, contentType: 'hls' }}
 */
export function buildHlsVideoSource(uri) {
  return {
    uri: String(uri || ''),
    contentType: 'hls',
  };
}

/** iOS AVPlayer often fails when seeking live/event playlists to the live edge. */
export function shouldSyncHlsLiveEdge(platform = Platform.OS) {
  return platform !== 'ios';
}

/** How far behind the live edge the player may drift before re-syncing. */
const LIVE_EDGE_LAG_SECONDS = 3;

/**
 * Seek HLS player near the live edge (Android only — skipped on iOS).
 * @param {import('expo-video').VideoPlayer} player
 * @param {string} [platform]
 */
export function seekHlsNearLiveEdge(player, platform = Platform.OS) {
  if (!player || !shouldSyncHlsLiveEdge(platform)) return;
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

/** Delay before retrying the next HLS URL after a failed load (iOS). */
export const HLS_IOS_RETRY_DELAY_MS = 1200;
