/**
 * Dynamic Expo config — merges app.json and exposes VideoSDK token/room base URL in `extra`
 * so it is embedded at build time even when Metro env inlining differs.
 * Set EXPO_PUBLIC_VIDEOSDK_TOKEN_URL (preferred), or EXPO_PUBLIC_SERVER_URL / EXPO_PUBLIC_PROCESSING_SERVER_URL.
 */
const appJson = require("./app.json");

const SPLASH_IMAGE = "./assets/images/splash1.png";
const APP_ICON = "./assets/images/asabicon.png";

function trimEnv(key) {
  const v = process.env[key];
  return typeof v === "string" ? v.trim().replace(/\/$/, "") : "";
}

function withStartupAssets(expo) {
  const plugins = (expo.plugins || []).map((entry) => {
    if (Array.isArray(entry) && entry[0] === "expo-notifications") {
      return [entry[0], { ...entry[1], icon: APP_ICON }];
    }
    if (Array.isArray(entry) && entry[0] === "expo-splash-screen") {
      return [
        entry[0],
        {
          ...entry[1],
          image: SPLASH_IMAGE,
          resizeMode: "cover",
          backgroundColor: "#000000",
        },
      ];
    }
    return entry;
  });

  return {
    ...expo,
    icon: APP_ICON,
    splash: {
      ...(expo.splash || {}),
      image: SPLASH_IMAGE,
      resizeMode: "cover",
      backgroundColor: "#000000",
    },
    ios: {
      ...(expo.ios || {}),
      icon: APP_ICON,
    },
    android: {
      ...(expo.android || {}),
      icon: APP_ICON,
      adaptiveIcon: {
        ...(expo.android?.adaptiveIcon || {}),
        foregroundImage: APP_ICON,
        monochromeImage: APP_ICON,
      },
    },
    plugins,
  };
}

module.exports = () => {
  const videosdkTokenBaseUrl =
    trimEnv("EXPO_PUBLIC_VIDEOSDK_TOKEN_URL") ||
    trimEnv("EXPO_PUBLIC_SERVER_URL") ||
    trimEnv("EXPO_PUBLIC_PROCESSING_SERVER_URL") ||
    "";
  const videosdkRoomBaseUrl =
    trimEnv("EXPO_PUBLIC_VIDEOSDK_ROOM_URL") ||
    trimEnv("EXPO_PUBLIC_SERVER_URL") ||
    trimEnv("EXPO_PUBLIC_PROCESSING_SERVER_URL") ||
    "";

  const pathRaw = process.env.EXPO_PUBLIC_VIDEOSDK_TOKEN_PATH;
  const videosdkTokenPathExplicit =
    pathRaw !== undefined && pathRaw !== null ? String(pathRaw).trim() : null;
  const roomPathRaw = process.env.EXPO_PUBLIC_VIDEOSDK_ROOM_PATH;
  const videosdkRoomPathExplicit =
    roomPathRaw !== undefined && roomPathRaw !== null ? String(roomPathRaw).trim() : null;

  const debugLogsRaw = process.env.EXPO_PUBLIC_VIDEOSDK_DEBUG_LOGS;
  const videosdkDebugLogs =
    debugLogsRaw !== undefined && debugLogsRaw !== null
      ? String(debugLogsRaw).trim() !== '0'
      : false;

  const appleTeamId =
    trimEnv("EXPO_APPLE_TEAM_ID") || trimEnv("APPLE_TEAM_ID") || "";
  const iosBundleId = appJson.expo?.ios?.bundleIdentifier || "com.bilal.asab";

  if (!appleTeamId) {
    console.warn(
      "[app.config] EXPO_APPLE_TEAM_ID is not set — iOS screen-share builds require it on EAS."
    );
  }

  const basePlugins = (appJson.expo.plugins || []).filter(
    (entry) =>
      !(
        Array.isArray(entry) &&
        entry[0] === "@videosdk.live/expo-ios-screen-share"
      )
  );

  const plugins = [
    ...basePlugins,
    ...(appleTeamId
      ? [
          [
            "@videosdk.live/expo-ios-screen-share",
            {
              appleTeamId,
              extensionName: "ASABBroadcast",
              bundleId: iosBundleId,
            },
          ],
        ]
      : []),
  ];

  return {
    ...appJson,
    expo: withStartupAssets({
      ...appJson.expo,
      plugins,
      extra: {
        ...(appJson.expo.extra || {}),
        videosdkTokenBaseUrl,
        videosdkRoomBaseUrl,
        ...(videosdkTokenPathExplicit !== null
          ? { videosdkTokenPathExplicit }
          : {}),
        ...(videosdkRoomPathExplicit !== null
          ? { videosdkRoomPathExplicit }
          : {}),
        videosdkDebugLogs,
        ...(appleTeamId ? { appleTeamId } : {}),
      },
    }),
  };
};
