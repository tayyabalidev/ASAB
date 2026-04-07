import Constants from "expo-constants";

/**
 * Stored in Appwrite `video` (URL-type attribute) until Mux sets the real HLS URL.
 * `mux:pending` is rejected by URL validation; this is a reserved-host placeholder only.
 */
export const MUX_VIDEO_PENDING_PLACEHOLDER_URL =
  "https://example.invalid/mux-video-pending";

export function isMuxPendingVideoUrl(url) {
  return (
    typeof url === "string" &&
    (url.startsWith("mux:") || url === MUX_VIDEO_PENDING_PLACEHOLDER_URL)
  );
}

function trimBase(url) {
  if (!url || typeof url !== "string") return "";
  return url.replace(/\/$/, "");
}

/** Same processing API used for VideoSDK tokens / FFmpeg — Mux direct-upload lives here too. */
export function getProcessingServerOrigin() {
  const fromEnv =
    (typeof process !== "undefined" &&
      (process.env.EXPO_PUBLIC_PROCESSING_SERVER_URL ||
        process.env.EXPO_PUBLIC_SERVER_URL)) ||
    "";
  const fromExtra = Constants.expoConfig?.extra?.processingServerUrl || "";
  return trimBase(fromEnv || fromExtra);
}

export function isMuxUploadEnabled() {
  if (typeof process === "undefined") return false;
  const v = process.env.EXPO_PUBLIC_USE_MUX;
  return v === "1" || String(v).toLowerCase() === "true";
}

/** Appwrite Function ID for Mux direct upload (replaces Express /api/mux/direct-upload when set). */
export function getMuxDirectUploadFunctionId() {
  const fromEnv =
    typeof process !== "undefined"
      ? String(process.env.EXPO_PUBLIC_MUX_DIRECT_UPLOAD_FUNCTION_ID || "").trim()
      : "";
  const fromExtra = String(
    Constants.expoConfig?.extra?.muxDirectUploadFunctionId || ""
  ).trim();
  return fromEnv || fromExtra;
}

/**
 * Full URL to POST for Mux direct-upload (same body/JWT as Express route).
 * Use when your handler is an Appwrite Function HTTP deployment, not Node /api/mux.
 */
export function getMuxDirectUploadHttpUrl() {
  const fromEnv =
    typeof process !== "undefined"
      ? String(process.env.EXPO_PUBLIC_MUX_DIRECT_UPLOAD_URL || "").trim()
      : "";
  const fromExtra = String(
    Constants.expoConfig?.extra?.muxDirectUploadUrl || ""
  ).trim();
  return fromEnv || fromExtra;
}

export function hasMuxDirectUploadBackend() {
  return Boolean(
    getMuxDirectUploadFunctionId() ||
      getMuxDirectUploadHttpUrl() ||
      getProcessingServerOrigin()
  );
}
