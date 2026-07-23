/**
 * VideoSDK PubSub message helpers.
 * Prefer JSON strings — publish() first arg is typed as string in the RN SDK.
 */

export const STAGE_CONTROL_TOPIC = 'STAGE_CONTROL';

export function encodePubSubPayload(payload) {
  try {
    return JSON.stringify(payload ?? {});
  } catch (_) {
    return '{}';
  }
}

/**
 * Normalize a PubSub envelope into a plain object.
 * Supports: object message, JSON string message, payload object, or flat fields.
 */
export function decodePubSubMessage(data) {
  if (data == null) return {};
  const envelope = typeof data === 'object' ? data : {};
  const raw = envelope.message;
  const envelopePayload =
    envelope.payload != null && typeof envelope.payload === 'object' && !Array.isArray(envelope.payload)
      ? envelope.payload
      : {};

  let body = {};
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    body = raw;
  } else if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          body = parsed;
        }
      } catch (_) {
        /* plain string — may itself be a mode name */
        if (trimmed === 'SEND_AND_RECV' || trimmed === 'RECV_ONLY') {
          body = { mode: trimmed };
        }
      }
    } else if (trimmed === 'SEND_AND_RECV' || trimmed === 'RECV_ONLY') {
      body = { mode: trimmed };
    }
  }

  return {
    ...envelopePayload,
    ...body,
    senderId: body.senderId || envelopePayload.senderId || envelope.senderId || null,
    senderName: body.senderName || envelopePayload.senderName || envelope.senderName || null,
    participantId:
      body.participantId ||
      body.targetParticipantId ||
      envelopePayload.participantId ||
      envelopePayload.targetParticipantId ||
      envelope.participantId ||
      null,
    targetParticipantId:
      body.targetParticipantId ||
      envelopePayload.targetParticipantId ||
      body.participantId ||
      null,
    mode: body.mode || envelopePayload.mode || envelope.mode || null,
    action: body.action || envelopePayload.action || envelope.action || null,
  };
}

/**
 * Publish a stage/control command. Tries string JSON (+ optional payload arg).
 * Awaits publish so callers don't unmount before the send completes.
 */
export async function publishStageCommand(publish, payload, { sendOnly } = {}) {
  if (typeof publish !== 'function') {
    throw new Error('PubSub publish unavailable');
  }
  const encoded = encodePubSubPayload(payload);
  const options = { persist: false };
  if (Array.isArray(sendOnly) && sendOnly.length) {
    options.sendOnly = sendOnly.map(String);
  }

  try {
    // Preferred: message string + optional 3rd-arg payload (SDK reference).
    await Promise.resolve(publish(encoded, options, payload));
    return;
  } catch (_) {
    /* fall through */
  }

  try {
    await Promise.resolve(publish(encoded, options));
    return;
  } catch (_) {
    /* fall through */
  }

  // Legacy guides show publishing a plain object as the message.
  await Promise.resolve(publish(payload, options));
}
