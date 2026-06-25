const fs = require('fs');
const path = require('path');
const {
  withDangerousMod,
  withXcodeProject,
  withEntitlementsPlist,
  IOSConfig,
} = require('@expo/config-plugins');

const STATIC_FILE = 'HostCameraPip.m';
const STATIC_DIR = path.join(__dirname, 'static');
const WEBRTC_HEADER_SEARCH_PATH =
  '"${PODS_ROOT}/../../node_modules/@videosdk.live/react-native-webrtc/ios/RCTWebRTC"';

function copyHostCameraPipFile(iosAppDir) {
  fs.copyFileSync(path.join(STATIC_DIR, STATIC_FILE), path.join(iosAppDir, STATIC_FILE));
}

function addWebrtcHeaderSearchPaths(project, bundleIdentifier) {
  const configurations = project.pbxXCBuildConfigurationSection();
  for (const key of Object.keys(configurations)) {
    const config = configurations[key];
    if (typeof config !== 'object' || !config.buildSettings) {
      continue;
    }
    if (config.buildSettings.PRODUCT_BUNDLE_IDENTIFIER !== bundleIdentifier) {
      continue;
    }
    const existing = config.buildSettings.HEADER_SEARCH_PATHS || ['$(inherited)'];
    const paths = Array.isArray(existing) ? [...existing] : [existing];
    if (!paths.includes(WEBRTC_HEADER_SEARCH_PATH)) {
      paths.push(WEBRTC_HEADER_SEARCH_PATH);
      config.buildSettings.HEADER_SEARCH_PATHS = paths;
    }
  }
}

function withIosHostCameraPip(config) {
  config = withEntitlementsPlist(config, (config) => {
    // Only embed after Apple approves the capability AND EAS provisioning profiles
    // are regenerated. Setting EXPO_IOS_MULTITASKING_CAMERA alone breaks signing.
    const entitlementApproved =
      process.env.EXPO_IOS_MULTITASKING_CAMERA_APPROVED === '1' ||
      process.env.EXPO_IOS_MULTITASKING_CAMERA_APPROVED === 'true';
    if (entitlementApproved) {
      config.modResults['com.apple.developer.avfoundation.multitasking-camera-access'] = true;
    }
    return config;
  });

  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const appName =
        config.modRequest.projectName ||
        IOSConfig.XcodeUtils.getProjectName(projectRoot);
      const iosAppDir = path.join(projectRoot, 'ios', appName);
      fs.mkdirSync(iosAppDir, { recursive: true });
      copyHostCameraPipFile(iosAppDir);
      return config;
    },
  ]);

  config = withXcodeProject(config, (config) => {
    const project = config.modResults;
    const appName = IOSConfig.XcodeUtils.getProjectName(config.modRequest.projectRoot);
    const bundleIdentifier =
      config.ios?.bundleIdentifier || config.modRequest.projectName || 'com.bilal.asab';
    const mainTarget = project.getFirstTarget();
    if (!mainTarget) {
      return config;
    }

    addWebrtcHeaderSearchPaths(project, bundleIdentifier);

    const allGroups = project.hash.project.objects.PBXGroup;
    const groupUUID = Object.entries(allGroups).find(
      ([, group]) => group.name === appName || group.path === appName
    )?.[0];

    if (groupUUID) {
      const mPath = `${appName}/${STATIC_FILE}`;
      if (!project.hasFile(mPath)) {
        project.addSourceFile(mPath, { target: mainTarget.uuid }, groupUUID);
      }
    }

    return config;
  });

  return config;
}

module.exports = withIosHostCameraPip;
