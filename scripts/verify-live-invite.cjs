#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Simulated host→viewer invite path (no VideoSDK native / devices).
 * Validates payload round-trip + viewer accept rules used by LiveCoHostGuest.
 */
const fs = require('fs');
const path = require('path');
const {
  encodePubSubPayload,
  decodePubSubMessage,
  publishStageCommand,
  STAGE_CONTROL_TOPIC,
} = require('../lib/livePubSubPayload');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

let failed = 0;
function pass(name) {
  console.log(`PASS  ${name}`);
}
function fail(name, detail) {
  failed += 1;
  console.log(`FAIL  ${name}`);
  if (detail) console.log(`      ${detail}`);
}
function assert(name, cond, detail) {
  if (cond) pass(name);
  else fail(name, detail);
}

/** Mirror viewer invite decision from LiveCoHostGuest handleInviteMessage */
function viewerShouldShowInvite(data, localParticipantId, { trustTopic = false } = {}) {
  const payload = decodePubSubMessage(data);
  const target = payload.targetParticipantId || payload.participantId || null;
  if (!trustTopic && target && String(target) !== String(localParticipantId)) {
    return { show: false, reason: 'target_mismatch' };
  }
  const nextMode = String(payload.mode || '').toUpperCase();
  if (nextMode === 'SEND_AND_RECV' || nextMode === 'SEND_RECV') {
    return { show: true, inviter: payload.senderName || 'Host', mode: nextMode };
  }
  return { show: false, reason: `mode_${nextMode || 'empty'}` };
}

async function simulateHostInvite(viewerId) {
  const published = [];
  const fakePublish = async (message, options, payload) => {
    published.push({ message, options, payload });
  };
  const modePayload = {
    mode: 'SEND_AND_RECV',
    targetParticipantId: viewerId,
    participantId: viewerId,
  };
  await publishStageCommand(fakePublish, modePayload);
  return { published, modePayload };
}

(async () => {
  const viewerId = 'viewer-abc123-user1';
  const otherId = 'viewer-other-999';

  // --- encode/decode round trip (docs object + JSON string envelopes) ---
  {
    const payload = {
      mode: 'SEND_AND_RECV',
      targetParticipantId: viewerId,
      participantId: viewerId,
    };
    const encoded = encodePubSubPayload(payload);
    const fromJson = decodePubSubMessage({
      message: encoded,
      senderId: 'host-1',
      senderName: 'Randy Dillon',
    });
    assert(
      'JSON invite envelope decodes mode + target',
      fromJson.mode === 'SEND_AND_RECV' &&
        fromJson.targetParticipantId === viewerId &&
        fromJson.senderName === 'Randy Dillon'
    );

    const fromObject = decodePubSubMessage({
      message: payload,
      senderId: 'host-1',
      senderName: 'Randy Dillon',
    });
    assert(
      'Object invite envelope decodes mode + target (VideoSDK guide shape)',
      fromObject.mode === 'SEND_AND_RECV' && fromObject.targetParticipantId === viewerId
    );

    const fromPlainMode = decodePubSubMessage({ message: 'SEND_AND_RECV' });
    assert('Plain string SEND_AND_RECV decodes as mode', fromPlainMode.mode === 'SEND_AND_RECV');
  }

  // --- host publish simulation ---
  {
    const { published } = await simulateHostInvite(viewerId);
    assert('Host publishStageCommand emits at least one message', published.length >= 1);
    assert(
      'Host publish does not use sendOnly by default',
      published.every((p) => !p.options?.sendOnly)
    );
    const first = published[0];
    const decoded =
      typeof first.message === 'string'
        ? decodePubSubMessage({ message: first.message, senderName: 'Host' })
        : decodePubSubMessage({ message: first.message, senderName: 'Host' });
    assert(
      'Published invite carries SEND_AND_RECV for target viewer',
      decoded.mode === 'SEND_AND_RECV' &&
        (decoded.targetParticipantId === viewerId || decoded.participantId === viewerId)
    );
  }

  // --- viewer accept rules ---
  {
    const envelope = {
      message: encodePubSubPayload({
        mode: 'SEND_AND_RECV',
        targetParticipantId: viewerId,
        participantId: viewerId,
      }),
      senderId: 'host-1',
      senderName: 'Randy Dillon',
      id: 'msg-1',
    };

    const onChangeModeTopic = viewerShouldShowInvite(envelope, viewerId, { trustTopic: true });
    assert(
      'Viewer shows invite on CHANGE_MODE_{id} topic',
      onChangeModeTopic.show === true,
      JSON.stringify(onChangeModeTopic)
    );

    const onStageTopic = viewerShouldShowInvite(envelope, viewerId, { trustTopic: false });
    assert(
      'Viewer shows invite on STAGE_CONTROL when target matches',
      onStageTopic.show === true,
      JSON.stringify(onStageTopic)
    );

    const otherViewer = viewerShouldShowInvite(envelope, otherId, { trustTopic: false });
    assert(
      'Other viewer ignores STAGE_CONTROL invite not for them',
      otherViewer.show === false && otherViewer.reason === 'target_mismatch'
    );

    const removeMsg = {
      message: encodePubSubPayload({
        mode: 'SIGNALLING_ONLY',
        targetParticipantId: viewerId,
      }),
      senderId: 'host-1',
    };
    const removeDecision = viewerShouldShowInvite(removeMsg, viewerId, { trustTopic: true });
    assert(
      'SIGNALLING_ONLY does not show join banner',
      removeDecision.show === false,
      JSON.stringify(removeDecision)
    );
  }

  // --- wiring / regression guards in source ---
  {
    const guest = read('components/LiveCoHostGuest.jsx');
    const chat = read('components/LiveStreamChatOverlay.sdk.jsx');
    const player = read('components/LiveStreamPlayerImpl.sdk.jsx');
    const host = read('components/LiveHostGuestControls.jsx');

    assert(
      'Viewer invite UI is in-app banner (not only Alert.alert)',
      guest.includes('inviteVisible') &&
        guest.includes('inviteCard') &&
        guest.includes('acceptInvite')
    );
    assert(
      'Raise-hand success no longer uses blocking Alert.alert Request sent',
      !chat.includes("Alert.alert(\n        'Request sent'") &&
        chat.includes('Do NOT use Alert.alert here') &&
        chat.includes('raiseHint')
    );
    assert(
      'Invite listener mounts before HLS overlays ready',
      player.includes('<LiveCoHostInviteListener />') &&
        player.includes('includeInviteListener={false}')
    );
    assert(
      'Host invite publisher awaits publishStageCommand (no sync unmount race)',
      host.includes('await publishStageCommand') &&
        host.includes('PersistentChangeModePublisher') &&
        host.includes('StableStageControlBus')
    );
    assert(
      'Viewer joins as SIGNALLING_ONLY (VideoSDK ILS invite requirement)',
      player.includes("mode: 'SIGNALLING_ONLY'")
    );
    assert(
      'Viewer pins self on mode upgrade to stage',
      player.includes('onParticipantModeChanged') && player.includes('lp.pin')
    );
    assert(
      `Shared topic constant is ${STAGE_CONTROL_TOPIC}`,
      guest.includes('STAGE_CONTROL_TOPIC') && host.includes('STAGE_CONTROL_TOPIC')
    );
  }

  console.log('');
  if (failed) {
    console.error(`${failed} invite simulation check(s) failed.`);
    process.exit(1);
  }
  console.log('All invite simulation checks passed.');
  console.log('Still cannot run real 2-device VideoSDK E2E in this environment.');
  console.log('On devices: viewer ✋ → host Invite → viewer sees Join banner → Join.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
