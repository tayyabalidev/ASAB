/**
 * Client-side VideoSDK meeting JWT checks (payload decode only — not signature verify).
 */

import { decodeJwtPayload } from './videosdkHelper';

/**
 * @param {string} token
 * @param {string} expectedRoomId
 * @param {{ requireMod?: boolean }} [options]
 * @returns {{ ok: true, claims: object, participantId?: string } | { ok: false, error: string }}
 */
export function validateMeetingToken(token, expectedRoomId, options = {}) {
  const { requireMod = false } = options;
  const claims = decodeJwtPayload(token);
  if (!claims || typeof claims !== 'object') {
    return { ok: false, error: 'Could not read VideoSDK token payload.' };
  }

  const perms = Array.isArray(claims.permissions) ? claims.permissions : [];
  const tokenRoomId = claims.roomId != null ? String(claims.roomId).trim() : '';
  const expected = expectedRoomId != null ? String(expectedRoomId).trim() : '';

  if (!tokenRoomId) {
    return {
      ok: false,
      error:
        'VideoSDK token is missing roomId. Redeploy your token server and start a new session.',
    };
  }
  if (expected && tokenRoomId !== expected) {
    return {
      ok: false,
      error: `VideoSDK token room mismatch: token=${tokenRoomId}, expected=${expected}.`,
    };
  }
  if (!perms.includes('allow_join')) {
    return { ok: false, error: 'VideoSDK token missing allow_join permission.' };
  }
  if (requireMod && !perms.includes('allow_mod')) {
    return {
      ok: false,
      error: 'VideoSDK token missing allow_mod permission.',
    };
  }
  if (claims.version !== 2) {
    return {
      ok: false,
      error: 'VideoSDK token must include version: 2.',
    };
  }
  const roles = Array.isArray(claims.roles) ? claims.roles : [];
  if (roles.includes('rtc') || roles.includes('crawler')) {
    return {
      ok: false,
      error: 'VideoSDK meeting token must not include roles (rtc/crawler).',
    };
  }

  const participantId =
    claims.participantId != null && String(claims.participantId).trim()
      ? String(claims.participantId).trim()
      : undefined;

  return { ok: true, claims, participantId };
}
