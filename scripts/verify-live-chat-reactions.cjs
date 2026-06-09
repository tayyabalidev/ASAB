#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Static verification for live stream chat overlay + floating heart reactions.
 * Does not replace on-device E2E (VideoSDK PubSub requires native build).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const checks = [
  {
    name: 'LiveStreamChatOverlay component exists',
    pass: () => fs.existsSync(path.join(root, 'components/LiveStreamChatOverlay.jsx')),
  },
  {
    name: 'LiveStreamHeartReactions component exists',
    pass: () => fs.existsSync(path.join(root, 'components/LiveStreamHeartReactions.jsx')),
  },
  {
    name: 'Chat uses VideoSDK PubSub CHAT topic',
    pass: () => {
      const src = read('components/LiveStreamChatOverlay.jsx');
      return src.includes("usePubSub('CHAT'") && src.includes('chat.publish');
    },
  },
  {
    name: 'Chat optimistic send + skip local PubSub echo',
    pass: () => {
      const src = read('components/LiveStreamChatOverlay.jsx');
      return (
        src.includes('appendMessage({') &&
        src.includes('localParticipantId') &&
        src.includes('item.senderId === localParticipantId') &&
        src.includes('continue')
      );
    },
  },
  {
    name: 'Chat persists to Appwrite on send',
    pass: () => {
      const src = read('components/LiveStreamChatOverlay.jsx');
      return src.includes('addLiveComment') && src.includes('getLiveComments');
    },
  },
  {
    name: 'Chat overlay styled for video (semi-transparent bubbles)',
    pass: () => {
      const src = read('components/LiveStreamChatOverlay.jsx');
      return (
        src.includes('commentBubble') &&
        src.includes('rgba(0,0,0,0.45)') &&
        src.includes('position: \'absolute\'')
      );
    },
  },
  {
    name: 'Hearts use VideoSDK PubSub LIVE_HEART topic',
    pass: () => {
      const src = read('components/LiveStreamHeartReactions.jsx');
      return src.includes("usePubSub('LIVE_HEART'") && src.includes("publish('heart'");
    },
  },
  {
    name: 'Hearts skip local PubSub echo (no double spawn on tap)',
    pass: () => {
      const src = read('components/LiveStreamHeartReactions.jsx');
      return src.includes('item.senderId === localParticipantId');
    },
  },
  {
    name: 'Hearts animate upward with Animated API',
    pass: () => {
      const src = read('components/LiveStreamHeartReactions.jsx');
      return (
        src.includes('FloatingHeart') &&
        src.includes('Animated.timing(translateY') &&
        src.includes('FontAwesome') &&
        src.includes('name="heart"')
      );
    },
  },
  {
    name: 'Hearts lane aligned to like button bottomOffset',
    pass: () => read('components/LiveStreamHeartReactions.jsx').includes('bottomOffset + 56'),
  },
  {
    name: 'Heart animation timers cleaned up on unmount',
    pass: () => {
      const src = read('components/LiveStreamHeartReactions.jsx');
      return src.includes('timers.forEach(clearTimeout)') && src.includes('return () =>');
    },
  },
  {
    name: 'Viewer player wires chat + hearts inside MeetingProvider',
    pass: () => {
      const src = read('components/LiveStreamPlayerImpl.sdk.jsx');
      return (
        src.includes('LiveStreamChatOverlay') &&
        src.includes('LiveStreamHeartReactions') &&
        src.includes('LiveViewerJoinedLayers') &&
        src.includes('meetingReady')
      );
    },
  },
  {
    name: 'Viewer chat clears host info card (bottom offset)',
    pass: () => {
      const src = read('components/LiveStreamPlayerImpl.sdk.jsx');
      return src.includes('chatBottomOffset') && src.includes('chatBottomInset');
    },
  },
  {
    name: 'Host broadcaster wires chat overlay + heart listener',
    pass: () => {
      const src = read('components/LiveStreamBroadcasterImpl.sdk.jsx');
      return (
        src.includes('LiveStreamChatOverlay') &&
        src.includes('LiveStreamHeartReactions') &&
        src.includes('isHost')
      );
    },
  },
  {
    name: 'Viewer screen has chat show/hide toggle',
    pass: () => {
      const src = read('app/live-viewer.jsx');
      return src.includes('setShowChat') && src.includes('showChat={showChat}');
    },
  },
  {
    name: 'Live pages no longer use standalone LiveReactions outside MeetingProvider',
    pass: () => {
      const viewer = read('app/live-viewer.jsx');
      const broadcast = read('app/live-broadcast.jsx');
      return !viewer.includes('LiveReactions') && !broadcast.includes('LiveReactions');
    },
  },
  {
    name: 'Components barrel exports chat + heart modules',
    pass: () => {
      const src = read('components/index.js');
      return (
        src.includes('LiveStreamChatOverlay') &&
        src.includes('LiveStreamHeartReactions')
      );
    },
  },
  {
    name: 'Appwrite live comment + reaction helpers exist',
    pass: () => {
      const src = read('lib/livestream.js');
      return (
        src.includes('export async function addLiveComment') &&
        src.includes('export async function addLiveReaction') &&
        src.includes('export function subscribeLiveComments')
      );
    },
  },
  {
    name: 'npm script verify:live-chat-reactions registered',
    pass: () => read('package.json').includes('verify:live-chat-reactions'),
  },
  {
    name: 'Call module untouched (no live chat overlay import)',
    pass: () => !read('components/VideoSDKCall.jsx').includes('LiveStreamChatOverlay'),
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

console.log('\nAll static live chat + reactions checks passed.');
console.log('Run on-device E2E:');
console.log('  1. Viewer sends comment → appears once instantly for host + other viewers');
console.log('  2. Rapid heart taps → multiple hearts float on right for all participants');
console.log('  3. Host sees viewer hearts (no like button on host)');
console.log('  4. Toggle chat on viewer → overlay hides/shows without blocking video');
