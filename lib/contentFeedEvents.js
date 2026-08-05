import { DeviceEventEmitter } from 'react-native';

/** Fired after a video/photo publish so profile (and other screens) can refetch. */
export const CONTENT_FEED_INVALIDATE = 'CONTENT_FEED_INVALIDATE';

/**
 * @param {{ type?: 'video' | 'photo' | 'all', userId?: string }} [payload]
 */
export function emitContentFeedInvalidate(payload = {}) {
  DeviceEventEmitter.emit(CONTENT_FEED_INVALIDATE, payload);
}

/**
 * @param {(payload: object) => void} handler
 * @returns {{ remove: () => void }}
 */
export function subscribeContentFeedInvalidate(handler) {
  return DeviceEventEmitter.addListener(CONTENT_FEED_INVALIDATE, handler);
}
