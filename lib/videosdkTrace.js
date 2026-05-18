/**
 * Structured VideoSDK verification logs + in-app ring buffer (TestFlight / no Mac).
 *
 * Filter device logs: VIDEOSDK
 * In-app: floating "SDK" panel when debug UI is enabled (default on).
 */

import Constants from 'expo-constants';

const MAX_LOG_LINES = 500;

/** @type {string[]} */
const buffer = [];
/** @type {Set<() => void>} */
const listeners = new Set();

const STEPS = {
  S1_ROOM: 'S1_ROOM',
  S2_SDK: 'S2_SDK',
  S3_JOIN: 'S3_JOIN',
  S4_PARTICIPANTS: 'S4_PARTICIPANTS',
  S5_INCOMING: 'S5_INCOMING',
  S6_ACCEPT: 'S6_ACCEPT',
  S7_HLS: 'S7_HLS',
};

function formatLine(step, event, data) {
  const ts = new Date().toISOString().slice(11, 23);
  let line = `${ts} [VIDEOSDK][${step}][${event}]`;
  if (data == null) return line;
  if (typeof data === 'string') return `${line} ${data}`;
  try {
    return `${line} ${JSON.stringify(data)}`;
  } catch (_) {
    return `${line} [unserializable]`;
  }
}

function pushLine(line) {
  buffer.push(line);
  while (buffer.length > MAX_LOG_LINES) {
    buffer.shift();
  }
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (_) {}
  });
}

/** Default ON so TestFlight testers see logs without Xcode. Set EXPO_PUBLIC_VIDEOSDK_DEBUG_LOGS=0 to hide. */
export function isVideosdkDebugUiEnabled() {
  const envOff =
    typeof process !== 'undefined' &&
    process.env &&
    String(process.env.EXPO_PUBLIC_VIDEOSDK_DEBUG_LOGS || '').trim() === '0';
  if (envOff) return false;
  const extra = Constants.expoConfig?.extra;
  if (extra && extra.videosdkDebugLogs === false) return false;
  return true;
}

/**
 * @param {() => void} listener
 * @returns {() => void}
 */
export function subscribeVideosdkTraceLogs(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** @returns {string[]} */
export function getVideosdkTraceLogs() {
  return [...buffer];
}

export function getVideosdkTraceLogText() {
  return buffer.join('\n');
}

export function clearVideosdkTraceLogs() {
  buffer.length = 0;
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (_) {}
  });
}

/**
 * Mirror LiveBroadcast logEvent lines into the on-device buffer.
 * @param {string} label
 * @param {unknown} [value]
 */
export function videosdkTraceMirror(label, value) {
  if (!isVideosdkDebugUiEnabled()) return;
  pushLine(formatLine('LIVE', label, value == null ? '' : value));
}

/**
 * @param {keyof typeof STEPS | string} step
 * @param {string} event
 * @param {Record<string, unknown> | string | null} [data]
 */
export function videosdkTrace(step, event, data) {
  const line = formatLine(step, event, data);
  console.log(line);
  if (isVideosdkDebugUiEnabled()) {
    pushLine(line);
  }
}

export { STEPS as VIDEOSDK_TRACE_STEPS };
