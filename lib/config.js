/**
 * VideoSDK — public API key may live in the app; JWT must come from your token backend
 * (Node `/get-token` or Appwrite Function HTTPS URL).
 */

function readPublicEnv(key) {
  if (typeof process === "undefined" || !process.env?.[key]) return "";
  const v = String(process.env[key]).trim();
  return v.replace(/\/$/, "");
}

/** Base URL only (no path), e.g. https://xxxx.nyc.appwrite.run or https://api.example.com */
const envTokenUrl =
  readPublicEnv("EXPO_PUBLIC_VIDEOSDK_TOKEN_URL") ||
  readPublicEnv("EXPO_PUBLIC_SERVER_URL") ||
  readPublicEnv("EXPO_PUBLIC_PROCESSING_SERVER_URL");

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

/**
 * Override path if needed. Empty string = GET `{baseUrl}?meetingId=...`.
 * Omit → use defaultTokenPath (root for Appwrite host, /get-token otherwise).
 */
const tokenPathRaw =
  typeof process !== "undefined" && process.env && "EXPO_PUBLIC_VIDEOSDK_TOKEN_PATH" in process.env
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

/** Public VideoSDK API key (same as dashboard); optional override via env */
const apiKeyFromEnv = readPublicEnv("EXPO_PUBLIC_VIDEOSDK_API_KEY");

export const VIDEOSDK_CONFIG = {
  apiKey: apiKeyFromEnv || "d2a44593-6338-45da-b255-f30bb5900d2a",
  tokenServerUrl: envTokenUrl,
  tokenPath,
  meetingSettings: {
    micEnabled: true,
    webcamEnabled: true,
    participantCanToggleSelfWebcam: true,
    participantCanToggleSelfMic: true,
  },
};
