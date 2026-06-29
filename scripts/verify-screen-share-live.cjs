#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Static verification for screen-share live streaming changes.
 * Does not replace on-device E2E tests (MediaProjection / ReplayKit).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const checks = [
  {
    name: 'iOS screen share bridge exists',
    pass: () => fs.existsSync(path.join(root, 'lib/videosdkIosScreenShare.js')),
  },
  {
    name: 'expo-ios-screen-share dependency',
    pass: () => {
      const pkg = JSON.parse(read('package.json'));
      return Boolean(pkg.dependencies['@videosdk.live/expo-ios-screen-share']);
    },
  },
  {
    name: 'app.config injects iOS screen share plugin',
    pass: () => {
      process.env.EXPO_APPLE_TEAM_ID = process.env.EXPO_APPLE_TEAM_ID || '95294KGVY6';
      const cfg = require(path.join(root, 'app.config.js'))();
      const plugin = (cfg.expo.plugins || []).find(
        (p) => Array.isArray(p) && p[0] === '@videosdk.live/expo-ios-screen-share'
      );
      const ext = cfg.expo.extra?.eas?.build?.experimental?.ios?.appExtensions?.[0];
      return (
        Boolean(plugin) &&
        plugin[1].appleTeamId === '95294KGVY6' &&
        plugin[1].bundleId === 'com.bilal.asab' &&
        ext?.targetName === 'ASABBroadcast' &&
        ext?.bundleIdentifier === 'com.bilal.asab.ASABBroadcast'
      );
    },
  },
  {
    name: 'Broadcaster: disableScreenShare wired',
    pass: () => read('components/LiveStreamBroadcasterImpl.sdk.jsx').includes('disableScreenShare'),
  },
  {
    name: 'Broadcaster: iOS ReplayKit listener',
    pass: () =>
      read('components/LiveStreamBroadcasterImpl.sdk.jsx').includes('VideosdkIosScreenShare.addListener'),
  },
  {
    name: 'Broadcaster: screen share timeout + retry UI',
    pass: () => {
      const src = read('components/LiveStreamBroadcasterImpl.sdk.jsx');
      return (
        src.includes('SCREEN_SHARE_READY_TIMEOUT_MS') &&
        src.includes('handleRetryScreenShare') &&
        src.includes('screenShareError')
      );
    },
  },
  {
    name: 'Screen share HLS uses GRID PIN for screen + camera composite',
    pass: () => {
      const src = read('components/LiveStreamBroadcasterImpl.sdk.jsx');
      return (
        src.includes("type: 'GRID', priority: 'PIN', gridSize: 4") &&
        src.includes('enableWebcamFnRef.current') &&
        src.includes('screenShareTrackReady') &&
        src.includes('participantHasWebcamTrack')
      );
    },
  },
  {
    name: 'Screen live publishes webcam before screen capture',
    pass: () => {
      const src = read('components/LiveStreamBroadcasterImpl.sdk.jsx');
      const fnStart = src.indexOf('const publishHostMediaAfterJoin');
      const fnEnd = src.indexOf('const {', fnStart);
      const block = src.slice(fnStart, fnEnd);
      const webcamIdx = block.indexOf('enableWebcamFnRef.current');
      const shareIdx = block.indexOf('startHostScreenShare');
      return webcamIdx >= 0 && shareIdx >= 0 && webcamIdx < shareIdx;
    },
  },
  {
    name: 'Screen live webcam recovery on AppState + stream disabled',
    pass: () => {
      const src = read('components/LiveStreamBroadcasterImpl.sdk.jsx');
      return (
        src.includes('AppState.addEventListener') &&
        src.includes('ensureScreenLiveWebcam') &&
        src.includes('onWebcamStreamDisabled') &&
        src.includes('resumeAllStreamsFnRef') &&
        src.includes('SCREEN_WEBCAM_BACKGROUND_KEEPALIVE_MS') &&
        src.includes('forceRefresh')
      );
    },
  },
  {
    name: 'iOS background modes for live WebRTC session',
    pass: () => {
      const app = JSON.parse(read('app.json'));
      const modes = app.expo?.ios?.infoPlist?.UIBackgroundModes || [];
      return modes.includes('audio') && modes.includes('voip');
    },
  },
  {
    name: 'Host screen share PiP bridge wired',
    pass: () => {
      const src = read('components/LiveStreamBroadcasterImpl.sdk.jsx');
      return (
        src.includes('HostScreenSharePipManager') &&
        src.includes('enterScreenSharePip') &&
        src.includes('ScreenSharePipLayout') &&
        src.includes('isInPipMode')
      );
    },
  },
  {
    name: 'Android screen share PiP native module + plugin',
    pass: () => {
      const hasPlugin = read('app.json').includes('withAndroidScreenSharePip');
      const hasModule = fs.existsSync(
        path.join(root, 'android/app/src/main/java/com/bilal/asab/screenpip/ScreenSharePipModule.kt')
      );
      const manifest = read('android/app/src/main/AndroidManifest.xml');
      return (
        hasPlugin &&
        hasModule &&
        manifest.includes('supportsPictureInPicture="true"')
      );
    },
  },
  {
    name: 'iOS host camera PiP native bridge + plugin',
    pass: () => {
      const app = read('app.json');
      const objc = read('plugins/static/HostCameraPip.m');
      return (
        app.includes('withIosHostCameraPip') &&
        objc.includes('AVPictureInPictureVideoCallViewController') &&
        objc.includes('startHostCameraPip')
      );
    },
  },
  {
    name: 'Screen share PiP QA + entitlement docs',
    pass: () =>
      fs.existsSync(path.join(root, 'docs/screen-share-pip-qa.md')) &&
      fs.existsSync(path.join(root, 'docs/ios-multitasking-camera-entitlement.md')),
  },
  {
    name: 'Broadcaster: HLS landscape for screen mode',
    pass: () =>
      read('components/LiveStreamBroadcasterImpl.sdk.jsx').includes(
        "orientation: isScreen ? 'landscape' : 'portrait'"
      ),
  },
  {
    name: 'Viewer: full-bleed cover mode for screen HLS',
    pass: () => {
      const src = read('components/LiveStreamPlayerImpl.sdk.jsx');
      return src.includes('contentFit="cover"') && src.includes('hlsVideoScreen');
    },
  },
  {
    name: 'Broadcaster enables Android system audio for screen share',
    pass: () => {
      const src = read('components/LiveStreamBroadcasterImpl.sdk.jsx');
      const helper = read('lib/videosdkScreenShare.js');
      return (
        src.includes('invokeScreenShareEnable') &&
        src.includes('ensureScreenShareMicAndSystemAudio') &&
        src.includes('ensureAndroidSystemAudioCapture') &&
        helper.includes('enableAudio: true') &&
        helper.includes('enableSystemAudio')
      );
    },
  },
  {
    name: 'Broadcaster: stop screen share control',
    pass: () => read('components/LiveStreamBroadcasterImpl.sdk.jsx').includes('handleStopScreenShare'),
  },
  {
    name: 'Viewer HLS URL order is platform-aware (iOS playback, Android low latency)',
    pass: () => {
      const src = read('lib/videosdkLiveHls.js');
      const iosBlock = src.slice(src.indexOf('HLS_URL_KEYS_IOS'), src.indexOf('function hlsUrlOrder'));
      const androidBlock = src.slice(
        src.indexOf('HLS_URL_KEYS_ANDROID'),
        src.indexOf('HLS_URL_KEYS_IOS')
      );
      const iosPlaybackIdx = iosBlock.indexOf('playbackHlsUrl');
      const iosLiveIdx = iosBlock.indexOf('livestreamUrl');
      const androidLiveIdx = androidBlock.indexOf('livestreamUrl');
      const androidPlaybackIdx = androidBlock.indexOf('playbackHlsUrl');
      return (
        iosPlaybackIdx >= 0 &&
        iosLiveIdx >= 0 &&
        iosPlaybackIdx < iosLiveIdx &&
        androidLiveIdx >= 0 &&
        androidPlaybackIdx >= 0 &&
        androidLiveIdx < androidPlaybackIdx &&
        src.includes('shouldSyncHlsLiveEdge') &&
        src.includes("return platform !== 'ios'")
      );
    },
  },
  {
    name: 'Viewer retries alternate HLS URLs on iOS playback failure',
    pass: () => {
      const src = read('components/LiveStreamPlayerImpl.sdk.jsx');
      return (
        src.includes('listLiveHlsUrlFallbacks') &&
        src.includes('tryNextHlsUrl') &&
        src.includes('buildHlsVideoSource') &&
        src.includes("status === 'error'")
      );
    },
  },
  {
    name: 'Android: MediaProjection capture blocks Activity PiP',
    pass: () => {
      const helper = read('plugins/static/screenpip/ScreenSharePipHelper.kt');
      const js = read('lib/screenSharePip.js');
      const broadcaster = read('components/LiveStreamBroadcasterImpl.sdk.jsx');
      return (
        helper.includes('mediaProjectionCaptureActive') &&
        helper.includes('setMediaProjectionCaptureActive') &&
        js.includes('setMediaProjectionCaptureActive') &&
        broadcaster.includes('setAndroidMediaProjectionCaptureActive') &&
        broadcaster.includes("Platform.OS === 'ios'") &&
        broadcaster.includes('mountSystemPipManager')
      );
    },
  },
  {
    name: 'Android: no resumeAllStreams on background during screen share',
    pass: () => {
      const src = read('components/LiveStreamBroadcasterImpl.sdk.jsx');
      return (
        src.includes('skipResumeForCaptureSession') &&
        src.includes('localScreenShareOnRef.current') &&
        src.includes('Keep capture session alive') &&
        src.includes('startScreenLivePlatformServices();')
      );
    },
  },
  {
    name: 'iOS: ReplayKit session lock blocks stream recovery at start',
    pass: () => {
      const src = read('components/LiveStreamBroadcasterImpl.sdk.jsx');
      return (
        src.includes('iosReplayKitActiveRef') &&
        src.includes('isScreenShareSessionLocked') &&
        src.includes('iosPipMountAllowed') &&
        src.includes("hostAppState === 'background'") &&
        !src.includes("hostAppState === 'inactive' ||\n      isInPipMode")
      );
    },
  },
  {
    name: 'iOS: HostLocalWebcamProbe does not forceRefresh during share start',
    pass: () => {
      const src = read('components/LiveStreamBroadcasterImpl.sdk.jsx');
      const probeStart = src.indexOf('function HostLocalWebcamProbe');
      const probeEnd = src.indexOf('function HostScreenSharePipManager', probeStart);
      const block = src.slice(probeStart, probeEnd);
      return (
        block.includes("forceRefresh: false") &&
        !block.includes("forceRefresh: true")
      );
    },
  },
  {
    name: 'iOS Obj-C VideosdkRPK + bridging fix plugin',
    pass: () => {
      const hasPlugin = read('app.config.js').includes('withVideosdkIosBridgingFix.js');
      const hasPatch = fs.existsSync(
        path.join(root, 'patches', '@videosdk.live+expo-ios-screen-share+0.0.3.patch')
      );
      const objcM = read('plugins/static/VideosdkRPK.m');
      const patchedPlugin = read(
        'node_modules/@videosdk.live/expo-ios-screen-share/build/withIosBroadcastExtension.js'
      );
      const patchedM = read(
        'node_modules/@videosdk.live/expo-ios-screen-share/build/static/VideosdkRPK.m'
      );
      return (
        hasPlugin &&
        hasPatch &&
        objcM.includes('@implementation VideosdkRPK') &&
        objcM.includes('RCT_EXPORT_MODULE') &&
        patchedM.includes('@implementation VideosdkRPK') &&
        !patchedM.includes('RCT_EXTERN_MODULE') &&
        !patchedPlugin.includes('VideosdkRPK.swift')
      );
    },
  },
];

let failed = 0;
for (const check of checks) {
  const ok = check.pass();
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${check.name}`);
  if (!ok) failed += 1;
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}

console.log('\nAll static screen-share checks passed.');
console.log('Run on-device E2E: Android screen live, iOS screen live (after EAS iOS rebuild), camera live, calls.');
