/**
 * VideoSDK — public API key may live in the app; JWT must come from your token backend
 * (Node `/get-token` or Appwrite Function HTTPS URL).
 */

import Constants from "expo-constants";

function readPublicEnv(key) {
  if (typeof process === "undefined" || !process.env?.[key]) return "";
  const v = String(process.env[key]).trim();
  return v.replace(/\/$/, "");
}

function isAppwriteRunHost(rawUrl) {
  if (!rawUrl) return false;
  try {
    const u = new URL(rawUrl.includes("://") ? rawUrl : `https://${rawUrl}`);
    return u.hostname === "appwrite.run" || u.hostname.endsWith(".appwrite.run");
  } catch (_) {
    return false;
  }
}

/** Embedded at build time from app.config.js (EAS / local prebuild). */
function readExtraVideosdkBaseUrl() {
  const extra = Constants.expoConfig?.extra;
  const raw = extra?.videosdkTokenBaseUrl;
  if (typeof raw !== "string" || !raw.trim()) return "";
  return raw.trim().replace(/\/$/, "");
}
function readExtraVideosdkRoomBaseUrl() {
  const extra = Constants.expoConfig?.extra;
  const raw = extra?.videosdkRoomBaseUrl;
  if (typeof raw !== "string" || !raw.trim()) return "";
  return raw.trim().replace(/\/$/, "");
}

/** Base URL only (no path), e.g. https://xxxx.appwrite.run or https://api.example.com */
const envTokenUrl =
  readPublicEnv("EXPO_PUBLIC_VIDEOSDK_TOKEN_URL") ||
  readPublicEnv("EXPO_PUBLIC_SERVER_URL") ||
  readPublicEnv("EXPO_PUBLIC_PROCESSING_SERVER_URL") ||
  readExtraVideosdkBaseUrl();

/** Optional dedicated backend base URL for room creation (recommended). */
const envRoomUrl =
  readPublicEnv("EXPO_PUBLIC_VIDEOSDK_ROOM_URL") ||
  readPublicEnv("EXPO_PUBLIC_SERVER_URL") ||
  readPublicEnv("EXPO_PUBLIC_PROCESSING_SERVER_URL") ||
  readExtraVideosdkRoomBaseUrl() ||
  readExtraVideosdkBaseUrl();

/** Appwrite `*.appwrite.run` serves HTTP at `/` — query string on root. Express in this repo uses `/get-token`. */
let defaultTokenPath = "/get-token";
if (envTokenUrl) {
  try {
    const u = new URL(envTokenUrl.includes("://") ? envTokenUrl : `https://${envTokenUrl}`);
    if (u.hostname === "appwrite.run" || u.hostname.endsWith(".appwrite.run")) {
      defaultTokenPath = "";
    }
  } catch (_) {
    /* ignore */
  }
}

// By default, only non-Appwrite hosts are assumed to expose /create-room.
const defaultRoomPath = isAppwriteRunHost(envRoomUrl) ? "" : "/create-room";
const roomPathRaw =
  Constants.expoConfig?.extra?.videosdkRoomPathExplicit !== undefined &&
  Constants.expoConfig?.extra?.videosdkRoomPathExplicit !== null
    ? String(Constants.expoConfig.extra.videosdkRoomPathExplicit).trim()
    : typeof process !== "undefined" && process.env && "EXPO_PUBLIC_VIDEOSDK_ROOM_PATH" in process.env
      ? String(process.env.EXPO_PUBLIC_VIDEOSDK_ROOM_PATH ?? "").trim()
      : null;
const roomPath =
  roomPathRaw === null
    ? defaultRoomPath
    : roomPathRaw === ""
      ? ""
      : `/${roomPathRaw.replace(/^\//, "")}`;

/**
 * Override path if needed. Empty string = GET `{baseUrl}?meetingId=...`.
 * Omit → use defaultTokenPath (root for Appwrite host, /get-token otherwise).
 */
const extraPath = Constants.expoConfig?.extra?.videosdkTokenPathExplicit;
const tokenPathRaw =
  extraPath !== undefined && extraPath !== null
    ? String(extraPath).trim()
    : typeof process !== "undefined" && process.env && "EXPO_PUBLIC_VIDEOSDK_TOKEN_PATH" in process.env
      ? String(process.env.EXPO_PUBLIC_VIDEOSDK_TOKEN_PATH ?? "").trim()
      : null;
const tokenPath =
  tokenPathRaw === null
    ? defaultTokenPath
    : tokenPathRaw === ""
      ? ""
      : `/${tokenPathRaw.replace(/^\//, "")}`;

if (!envTokenUrl) {
  console.warn(
    "⚠️ EXPO_PUBLIC_VIDEOSDK_TOKEN_URL (or EXPO_PUBLIC_SERVER_URL) is missing — VideoSDK JWT cannot be fetched."
  );
}

/** Shown in UI when the app was built without a token server URL. */
export const VIDEOSDK_TOKEN_SETUP_MESSAGE =
  "Video calling is not configured on this build. Set EXPO_PUBLIC_VIDEOSDK_TOKEN_URL to your Appwrite Function URL (videosdk-token) or your Node server base URL, add the same variable to EAS Secrets for store builds, then rebuild.";

/** Public VideoSDK API key (same as dashboard); optional override via env */
const apiKeyFromEnv = readPublicEnv("EXPO_PUBLIC_VIDEOSDK_API_KEY");

export const VIDEOSDK_CONFIG = {
  apiKey: apiKeyFromEnv || "d2a44593-6338-45da-b255-f30bb5900d2a",
  tokenServerUrl: envTokenUrl,
  tokenPath,
  roomServerUrl: envRoomUrl,
  roomPath,
  meetingSettings: {
    micEnabled: true,
    webcamEnabled: true,
    participantCanToggleSelfWebcam: true,
    participantCanToggleSelfMic: true,
  },
};
