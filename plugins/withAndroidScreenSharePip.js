const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withMainActivity,
  withMainApplication,
  withDangerousMod,
  AndroidConfig,
} = require('@expo/config-plugins');

const STATIC_DIR = path.join(__dirname, 'static', 'screenpip');
const SCREENPIP_PACKAGE = 'com.bilal.asab.screenpip';
const MAIN_ACTIVITY_MARKER = '// @generated screen-share-pip';

function copyScreenPipSources(androidProjectRoot) {
  const targetDir = path.join(
    androidProjectRoot,
    'app',
    'src',
    'main',
    'java',
    'com',
    'bilal',
    'asab',
    'screenpip'
  );
  fs.mkdirSync(targetDir, { recursive: true });
  for (const file of ['ScreenSharePipHelper.kt', 'ScreenSharePipModule.kt', 'ScreenSharePipPackage.kt']) {
    fs.copyFileSync(path.join(STATIC_DIR, file), path.join(targetDir, file));
  }
}

function ensureMainActivityPip(mainActivity) {
  if (mainActivity.includes(MAIN_ACTIVITY_MARKER)) {
    return mainActivity;
  }

  let contents = mainActivity;
  if (!contents.includes('import android.content.res.Configuration')) {
    contents = contents.replace(
      'import android.os.Bundle',
      'import android.os.Bundle\nimport android.content.res.Configuration'
    );
  }
  if (!contents.includes(`import ${SCREENPIP_PACKAGE}.ScreenSharePipHelper`)) {
    contents = contents.replace(
      'import expo.modules.ReactActivityDelegateWrapper',
      `import expo.modules.ReactActivityDelegateWrapper\nimport ${SCREENPIP_PACKAGE}.ScreenSharePipHelper`
    );
  }

  const pipMethods = `
  ${MAIN_ACTIVITY_MARKER}
  override fun onUserLeaveHint() {
    ScreenSharePipHelper.onUserLeaveHint(this)
    super.onUserLeaveHint()
  }

  override fun onPictureInPictureModeChanged(
    isInPictureInPictureMode: Boolean,
    newConfig: Configuration
  ) {
    super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
    ScreenSharePipHelper.onPictureInPictureModeChanged(this, isInPictureInPictureMode)
  }
`;

  contents = contents.replace(
    /override fun invokeDefaultOnBackPressed\(\) \{/,
    `${pipMethods}\n  override fun invokeDefaultOnBackPressed() {`
  );

  return contents;
}

function ensureMainApplicationPackage(mainApplication) {
  if (mainApplication.includes('ScreenSharePipPackage')) {
    return mainApplication;
  }

  let contents = mainApplication;
  contents = contents.replace(
    'import live.videosdk.rnwebrtc.WebRTCModulePackage',
    `import live.videosdk.rnwebrtc.WebRTCModulePackage\nimport ${SCREENPIP_PACKAGE}.ScreenSharePipPackage`
  );
  contents = contents.replace(
    'add(WebRTCModulePackage())',
    'add(WebRTCModulePackage())\n              add(ScreenSharePipPackage())'
  );
  return contents;
}

function withAndroidScreenSharePip(config) {
  config = withAndroidManifest(config, (config) => {
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(config.modResults);
    // PiP is handled via onPictureInPictureModeChanged — not a configChanges flag.
    mainActivity.$['android:supportsPictureInPicture'] = 'true';
    mainActivity.$['android:resizeableActivity'] = 'true';
    return config;
  });

  config = withMainActivity(config, (config) => {
    config.modResults.contents = ensureMainActivityPip(config.modResults.contents);
    return config;
  });

  config = withMainApplication(config, (config) => {
    config.modResults.contents = ensureMainApplicationPackage(config.modResults.contents);
    return config;
  });

  config = withDangerousMod(config, [
    'android',
    async (config) => {
      copyScreenPipSources(config.modRequest.platformProjectRoot);
      return config;
    },
  ]);

  return config;
}

module.exports = withAndroidScreenSharePip;
