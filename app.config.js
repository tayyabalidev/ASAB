/**
 * Dynamic Expo config — merges app.json and exposes VideoSDK token base URL in `extra`
 * so it is embedded at build time even when Metro env inlining differs.
 * Set EXPO_PUBLIC_VIDEOSDK_TOKEN_URL (preferred), or EXPO_PUBLIC_SERVER_URL / EXPO_PUBLIC_PROCESSING_SERVER_URL.
 */
const appJson = require("./app.json");

function trimEnv(key) {
  const v = process.env[key];
  return typeof v === "string" ? v.trim().replace(/\/$/, "") : "";
}

module.exports = () => {
  const videosdkTokenBaseUrl =
    trimEnv("EXPO_PUBLIC_VIDEOSDK_TOKEN_URL") ||
    trimEnv("EXPO_PUBLIC_SERVER_URL") ||
    trimEnv("EXPO_PUBLIC_PROCESSING_SERVER_URL") ||
    "";

  const pathRaw = process.env.EXPO_PUBLIC_VIDEOSDK_TOKEN_PATH;
  const videosdkTokenPathExplicit =
    pathRaw !== undefined && pathRaw !== null ? String(pathRaw).trim() : null;

  return {
    ...appJson,
    expo: {
      ...appJson.expo,
      extra: {
        ...(appJson.expo.extra || {}),
        videosdkTokenBaseUrl,
        ...(videosdkTokenPathExplicit !== null
          ? { videosdkTokenPathExplicit }
          : {}),
      },
    },
  };
};
