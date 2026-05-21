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

function readExpoExtra() {
  return (
    Constants.expoConfig?.extra ||
    Constants.manifest?.extra ||
    Constants.manifest2?.extra ||
    {}
  );
}

/** Default ON so TestFlight testers see logs without Xcode. Set EXPO_PUBLIC_VIDEOSDK_DEBUG_LOGS=0 to hide. */
export function isVideosdkDebugUiEnabled() {
  const envRaw =
    typeof process !== 'undefined' && process.env
      ? process.env.EXPO_PUBLIC_VIDEOSDK_DEBUG_LOGS
      : undefined;
  if (String(envRaw ?? '').trim() === '0') return false;

  const extra = readExpoExtra();
  if (extra.videosdkDebugLogs === false) return false;
  if (extra.videosdkDebugLogs === true) return true;

  // Default on (including production TestFlight) unless explicitly disabled.
  return true;
}

/** @type {(() => void) | null} */
let openDebugPanelHandler = null;

/** @param {() => void} handler */
export function registerVideosdkDebugPanelOpen(handler) {
  openDebugPanelHandler = handler;
  return () => {
    if (openDebugPanelHandler === handler) openDebugPanelHandler = null;
  };
}

export function requestOpenVideosdkDebugPanel() {
  openDebugPanelHandler?.();
}

export function getVideosdkDebugBuildLabel() {
  const version =
    Constants.expoConfig?.version ||
    Constants.manifest?.version ||
    Constants.manifest2?.version ||
    '?';
  return String(version);
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
