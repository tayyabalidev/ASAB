const { withInfoPlist } = require('expo/config-plugins');

/**
 * Ensures iOS Info.plist has background audio mode required for AVPlayer PiP.
 * expo-video's config plugin also sets this; this keeps it stable when infoPlist is edited manually.
 */
function withIosVideoPip(config) {
  return withInfoPlist(config, (config) => {
    const modes = config.modResults.UIBackgroundModes ?? [];
    if (!modes.includes('audio')) {
      config.modResults.UIBackgroundModes = [...modes, 'audio'];
    }
    return config;
  });
}

module.exports = withIosVideoPip;
