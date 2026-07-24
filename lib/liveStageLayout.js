/** Max on-stage guests (side slots) for group live. */
export const MAX_STAGE_GUESTS = 6;

/** Left column then right column (3 + 3). */
export const STAGE_SLOT_COUNT = MAX_STAGE_GUESTS;

/**
 * @param {string} [mode]
 * @param {{ treatEmptyAsPublisher?: boolean }} [opts]
 *        treatEmptyAsPublisher: legacy tile filter (host self); keep false for stage roster.
 */
export function isPublisherMode(mode, { treatEmptyAsPublisher = false } = {}) {
  const m = String(mode || '').trim().toUpperCase();
  if (m === 'SEND_AND_RECV' || m === 'SEND_RECV' || m === 'CONFERENCE') return true;
  if (treatEmptyAsPublisher && !m) return true;
  return false;
}

export function isRecvOnlyMode(mode) {
  const m = String(mode || '').trim().toUpperCase();
  // VideoSDK ILS audience: SIGNALLING_ONLY (legacy: RECV_ONLY / VIEWER)
  return m === 'SIGNALLING_ONLY' || m === 'RECV_ONLY' || m === 'VIEWER';
}

/** Host VideoSDK participant ids are `host-{streamDocId…}`. */
export function isHostParticipantId(participantId) {
  return String(participantId || '').startsWith('host-');
}

/**
 * Collect remote on-stage guest ids (excludes host + optional skip set), capped at max.
 * @param {Map|Iterable} participants
 * @param {{ localId?: string, excludeIds?: string[], max?: number }} [opts]
 */
export function listOnStageGuestIds(participants, opts = {}) {
  const max = opts.max ?? MAX_STAGE_GUESTS;
  const skip = new Set(
    [opts.localId, ...(opts.excludeIds || [])].filter(Boolean).map(String)
  );
  const ids = [];
  if (!(participants instanceof Map)) return ids;
  participants.forEach((p, id) => {
    if (!id || skip.has(String(id))) return;
    if (isHostParticipantId(id)) return;
    if (!isPublisherMode(p?.mode)) return;
    ids.push(id);
  });
  return ids.slice(0, max);
}

/**
 * Find host participant id in the meeting map (or null).
 */
export function findHostParticipantId(participants, preferredId = null) {
  if (preferredId && isHostParticipantId(preferredId)) return preferredId;
  if (!(participants instanceof Map)) return preferredId || null;
  for (const id of participants.keys()) {
    if (isHostParticipantId(id)) return id;
  }
  return preferredId || null;
}

/**
 * Build a fixed-length slot array (null = empty) for left then right columns.
 */
export function buildGuestSlots(guestIds, slotCount = STAGE_SLOT_COUNT) {
  const slots = [];
  for (let i = 0; i < slotCount; i += 1) {
    slots.push(guestIds[i] || null);
  }
  return slots;
}

export function splitSlotsLeftRight(slots) {
  const mid = Math.ceil(slots.length / 2);
  return {
    left: slots.slice(0, mid),
    right: slots.slice(mid),
  };
}
