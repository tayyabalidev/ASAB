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
    name: 'Broadcaster: HLS landscape for screen mode',
    pass: () =>
      read('components/LiveStreamBroadcasterImpl.sdk.jsx').includes(
        "orientation: isScreen ? 'landscape' : 'portrait'"
      ),
  },
  {
    name: 'Viewer: contain mode for screen HLS',
    pass: () => {
      const src = read('components/LiveStreamPlayerImpl.sdk.jsx');
      return src.includes("contentFit={isCameraLive ? 'cover' : 'contain'}");
    },
  },
  {
    name: 'Broadcaster: stop screen share control',
    pass: () => read('components/LiveStreamBroadcasterImpl.sdk.jsx').includes('handleStopScreenShare'),
  },
  {
    name: 'Call module untouched (no screen share bridge import)',
    pass: () => !read('components/VideoSDKCall.jsx').includes('videosdkIosScreenShare'),
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
