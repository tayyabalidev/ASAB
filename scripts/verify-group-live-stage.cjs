#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Static + unit verification for Group Live Stage (host + 6 guests).
 * Does not replace on-device E2E (VideoSDK RTC/HLS requires a native build).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const {
  MAX_STAGE_GUESTS,
  STAGE_SLOT_COUNT,
  isPublisherMode,
  isRecvOnlyMode,
  isHostParticipantId,
  listOnStageGuestIds,
  findHostParticipantId,
  buildGuestSlots,
  splitSlotsLeftRight,
} = require('../lib/liveStageLayout');

const checks = [
  {
    name: 'liveStageLayout exports max 6 guests',
    pass: () => MAX_STAGE_GUESTS === 6 && STAGE_SLOT_COUNT === 6,
  },
  {
    name: 'isHostParticipantId recognizes host- prefix',
    pass: () =>
      isHostParticipantId('host-abc123') &&
      !isHostParticipantId('viewer-abc-user') &&
      !isHostParticipantId(''),
  },
  {
    name: 'isPublisherMode requires explicit SEND modes (empty not on stage)',
    pass: () =>
      isPublisherMode('SEND_AND_RECV') &&
      isPublisherMode('SEND_RECV') &&
      !isPublisherMode('') &&
      !isPublisherMode('RECV_ONLY') &&
      isPublisherMode('', { treatEmptyAsPublisher: true }),
  },
  {
    name: 'isRecvOnlyMode detects viewers',
    pass: () =>
      isRecvOnlyMode('RECV_ONLY') &&
      isRecvOnlyMode('VIEWER') &&
      isRecvOnlyMode('SIGNALLING_ONLY') &&
      !isRecvOnlyMode('SEND_AND_RECV'),
  },
  {
    name: 'listOnStageGuestIds excludes host, recv-only, empty mode; caps at 6',
    pass: () => {
      const map = new Map([
        ['host-stream1', { mode: 'SEND_AND_RECV' }],
        ['viewer-a', { mode: 'RECV_ONLY' }],
        ['viewer-b', { mode: 'SEND_AND_RECV' }],
        ['viewer-c', { mode: 'SEND_AND_RECV' }],
        ['viewer-d', { mode: '' }],
        ['viewer-e', { mode: 'SEND_AND_RECV' }],
        ['viewer-f', { mode: 'SEND_AND_RECV' }],
        ['viewer-g', { mode: 'SEND_AND_RECV' }],
        ['viewer-h', { mode: 'SEND_AND_RECV' }],
        ['viewer-i', { mode: 'SEND_AND_RECV' }],
        ['viewer-j', { mode: 'SEND_AND_RECV' }],
      ]);
      const ids = listOnStageGuestIds(map);
      return (
        ids.length === 6 &&
        !ids.includes('host-stream1') &&
        !ids.includes('viewer-a') &&
        !ids.includes('viewer-d') &&
        ids.includes('viewer-b') &&
        ids[0] === 'viewer-b'
      );
    },
  },
  {
    name: 'buildGuestSlots + splitSlotsLeftRight → 3 left / 3 right',
    pass: () => {
      const slots = buildGuestSlots(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
      const { left, right } = splitSlotsLeftRight(slots);
      return (
        slots.length === 6 &&
        slots[5] === 'f' &&
        left.length === 3 &&
        right.length === 3 &&
        left.join(',') === 'a,b,c' &&
        right.join(',') === 'd,e,f'
      );
    },
  },
  {
    name: 'findHostParticipantId prefers host- id',
    pass: () => {
      const map = new Map([
        ['viewer-x', { mode: 'RECV_ONLY' }],
        ['host-zzz', { mode: 'SEND_AND_RECV' }],
      ]);
      return findHostParticipantId(map) === 'host-zzz';
    },
  },
  {
    name: 'LiveGroupStage component exists',
    pass: () => fs.existsSync(path.join(root, 'components/LiveGroupStage.jsx')),
  },
  {
    name: 'LiveGroupStage uses 6 slots + avatar fallback + active speaker',
    pass: () => {
      const src = read('components/LiveGroupStage.jsx');
      return (
        src.includes('MAX_STAGE_GUESTS') &&
        src.includes('images.profile') &&
        src.includes('isActiveSpeaker') &&
        src.includes('activeBorder') &&
        src.includes('GuestSlotEmpty')
      );
    },
  },
  {
    name: 'Host guest controls: mute/unmute/remove + max 6 + STAGE_CONTROL',
    pass: () => {
      const src = read('components/LiveHostGuestControls.jsx');
      return (
        src.includes('STAGE_CONTROL_TOPIC') &&
        src.includes("action: 'mute'") &&
        src.includes("action: 'unmute'") &&
        src.includes("action: 'remove'") &&
        src.includes('MAX_STAGE_GUESTS') &&
        src.includes('stageFull') &&
        src.includes('On stage') &&
        src.includes('RAISE_HAND') &&
        src.includes('PersistentChangeModePublisher')
      );
    },
  },
  {
    name: 'Guest media: blur mode + GUEST_CONTROL listener + demote cleanup',
    pass: () => {
      const src = read('components/LiveCoHostGuest.jsx');
      return (
        src.includes('GUEST_CONTROL_') &&
        src.includes('disableWebcam') &&
        src.includes('blurMode') &&
        src.includes('toggleBlur') &&
        src.includes("action === 'mute'") &&
        src.includes("action === 'remove'") &&
        src.includes('hidePreview')
      );
    },
  },
  {
    name: 'Chat overlay raise-hand (visible + hidden chat FAB)',
    pass: () => {
      const src = read('components/LiveStreamChatOverlay.sdk.jsx');
      return (
        src.includes("usePubSub('RAISE_HAND'") &&
        src.includes('showRaiseHand') &&
        src.includes('handleRaiseHand') &&
        src.includes('raiseFab') &&
        src.includes('publishRaiseHand') &&
        src.includes('encodePubSubPayload')
      );
    },
  },
  {
    name: 'Host raise-hand listens via messages[] + onMessageReceived',
    pass: () => {
      const src = read('components/LiveHostGuestControls.jsx');
      return (
        src.includes('HostRaiseHandListener') &&
        src.includes('decodePubSubMessage') &&
        src.includes('lastIndexRef') &&
        src.includes("usePubSub('RAISE_HAND'")
      );
    },
  },
  {
    name: 'Broadcaster keeps LiveHostGuestControls mounted for RAISE_HAND',
    pass: () => {
      const src = read('components/LiveStreamBroadcasterImpl.sdk.jsx');
      return (
        src.includes('<LiveHostGuestControls') &&
        src.includes('visible={showGuests && !isInPipMode}')
      );
    },
  },
  {
    name: 'Broadcaster: LiveGroupStage on camera + HLS gridSize 6 + avatar metaData',
    pass: () => {
      const src = read('components/LiveStreamBroadcasterImpl.sdk.jsx');
      return (
        src.includes('LiveGroupStage') &&
        src.includes("role=\"host\"") &&
        src.includes('gridSize: MAX_STAGE_GUESTS') &&
        src.includes('metaData:') &&
        src.includes('avatar: hostAvatar') &&
        src.includes('onEmptySlotPress')
      );
    },
  },
  {
    name: 'Viewer: stage when speaker + raise hand + avatar metaData',
    pass: () => {
      const src = read('components/LiveStreamPlayerImpl.sdk.jsx');
      return (
        src.includes('LiveGroupStage') &&
        src.includes("role=\"guest\"") &&
        src.includes('showRaiseHand={!localIsSpeaker}') &&
        src.includes('hidePreview') &&
        src.includes('metaData:') &&
        src.includes('avatar: user.avatar')
      );
    },
  },
  {
    name: 'live-broadcast passes hostAvatar',
    pass: () => read('app/live-broadcast.jsx').includes('hostAvatar={user.avatar}'),
  },
  {
    name: 'i18n groupStage strings present',
    pass: () => {
      const src = read('localization/resources.js');
      return (
        src.includes('groupStage:') &&
        src.includes('blurOn:') &&
        src.includes('stageFullTitle:') &&
        src.includes('inviteToStage:') &&
        src.includes('youreOnStage:')
      );
    },
  },
  {
    name: 'Remote tiles default maxTiles is 6 (screen-share fallback)',
    pass: () => read('components/LiveRemoteRtcTiles.jsx').includes('maxTiles = 6'),
  },
  {
    name: 'CHANGE_MODE invite/remove topics still used',
    pass: () => {
      const host = read('components/LiveHostGuestControls.jsx');
      const guest = read('components/LiveCoHostGuest.jsx');
      const player = read('components/LiveStreamPlayerImpl.sdk.jsx');
      return (
        host.includes('CHANGE_MODE_') &&
        guest.includes('CHANGE_MODE_') &&
        host.includes("'SEND_AND_RECV'") &&
        host.includes("'SIGNALLING_ONLY'") &&
        player.includes("mode: 'SIGNALLING_ONLY'") &&
        guest.includes('SIGNALLING_ONLY') &&
        player.includes('onParticipantModeChanged')
      );
    },
  },
];

let failed = 0;
for (const check of checks) {
  let ok = false;
  try {
    ok = Boolean(check.pass());
  } catch (err) {
    console.log(`FAIL  ${check.name}`);
    console.error(`      ${err.message}`);
    failed += 1;
    continue;
  }
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${check.name}`);
  if (!ok) failed += 1;
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}

console.log('\nAll Group Live Stage static + unit checks passed.');
console.log('On-device E2E still required:');
console.log('  1. Host camera live → center host + 6 empty Invite slots');
console.log('  2. Viewer ✋ → host alert → Invite → guest joins stage');
console.log('  3. Host Mute/Unmute/Remove; guest Blur shows avatar');
console.log('  4. Passive viewer HLS shows multi-person GRID (up to 6)');
