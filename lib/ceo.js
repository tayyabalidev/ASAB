/**
 * Platform broadcaster accounts (CEO / admin) — posts notify ALL users.
 *
 * Configure via env (any of these work):
 * EXPO_PUBLIC_CEO_USER_IDS=id1,id2
 * EXPO_PUBLIC_CEO_USER_ID=id1
 * EXPO_PUBLIC_CEO_EMAILS=ceo@example.com
 * EXPO_PUBLIC_CEO_USER_EMAIL=ceo@example.com
 * EXPO_PUBLIC_ADMIN_EMAILS=admin@example.com  (also broadcasts when posting)
 */

import { isAdminUser } from './admin';

function splitCsv(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getCeoUserIds() {
  const ids = new Set([
    ...splitCsv(process.env.EXPO_PUBLIC_CEO_USER_IDS),
    ...splitCsv(process.env.EXPO_PUBLIC_CEO_USER_ID),
  ]);
  return [...ids];
}

export function getCeoEmails() {
  const emails = new Set(
    [
      ...splitCsv(process.env.EXPO_PUBLIC_CEO_EMAILS),
      ...splitCsv(process.env.EXPO_PUBLIC_CEO_USER_EMAIL),
    ].map((e) => e.toLowerCase())
  );
  return [...emails];
}

export function isCeoUser(user) {
  if (!user) return false;

  const userId = (user.$id || user.userId || '').trim();
  if (userId && getCeoUserIds().includes(userId)) return true;

  const email = (user.email || '').trim().toLowerCase();
  if (email && getCeoEmails().includes(email)) return true;

  return false;
}

/** CEO or admin — uploads/live notify every user on the platform. */
export function isPlatformBroadcaster(user) {
  return isCeoUser(user) || isAdminUser(user);
}
