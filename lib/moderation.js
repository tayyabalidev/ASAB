import AsyncStorage from '@react-native-async-storage/async-storage';

const BLOCKED_KEY = 'asab_blocked_users_v1';
const REPORTS_KEY = 'asab_content_reports_v1';
const TERMS_KEY = 'asab_terms_accepted_v1';
export const TERMS_VERSION = '1';

export const REPORT_REASONS = [
  'Spam or misleading',
  'Hate speech or harassment',
  'Nudity or sexual content',
  'Violence or dangerous acts',
  'Other objectionable content',
];

function parseList(raw) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

export async function getBlockedUserIds() {
  try {
    return parseList(await AsyncStorage.getItem(BLOCKED_KEY));
  } catch (_) {
    return [];
  }
}

export async function isUserBlocked(userId) {
  if (!userId) return false;
  const ids = await getBlockedUserIds();
  return ids.includes(String(userId));
}

export async function blockUser(userId) {
  const id = String(userId || '').trim();
  if (!id) return getBlockedUserIds();
  const prev = await getBlockedUserIds();
  const next = [id, ...prev.filter((x) => x !== id)];
  await AsyncStorage.setItem(BLOCKED_KEY, JSON.stringify(next));
  return next;
}

export async function unblockUser(userId) {
  const id = String(userId || '').trim();
  const next = (await getBlockedUserIds()).filter((x) => x !== id);
  await AsyncStorage.setItem(BLOCKED_KEY, JSON.stringify(next));
  return next;
}

export function getPostCreatorId(post) {
  if (!post) return null;
  if (typeof post.creator === 'string' && post.creator.trim()) return post.creator.trim();
  return post.creator?.$id || post.creatorId || post.userId || null;
}

export function filterBlockedPosts(posts, blockedIds) {
  if (!Array.isArray(posts) || !blockedIds?.length) return posts || [];
  const blocked = new Set(blockedIds.map(String));
  return posts.filter((p) => {
    const creatorId = getPostCreatorId(p);
    return !creatorId || !blocked.has(String(creatorId));
  });
}

export async function reportContent({
  type,
  targetId,
  targetUserId,
  reason,
  reporterId,
}) {
  const report = {
    type: type || 'content',
    targetId: targetId || '',
    targetUserId: targetUserId || '',
    reason: reason || 'Other objectionable content',
    reporterId: reporterId || '',
    createdAt: new Date().toISOString(),
  };
  try {
    const prev = parseList(await AsyncStorage.getItem(REPORTS_KEY));
    await AsyncStorage.setItem(REPORTS_KEY, JSON.stringify([report, ...prev].slice(0, 200)));
  } catch (_) {
    /* still treat as submitted for the user */
  }
  return report;
}

export async function hasAcceptedTerms() {
  try {
    const raw = await AsyncStorage.getItem(TERMS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return parsed?.version === TERMS_VERSION && parsed?.accepted === true;
  } catch (_) {
    return false;
  }
}

export async function acceptTerms() {
  await AsyncStorage.setItem(
    TERMS_KEY,
    JSON.stringify({
      accepted: true,
      version: TERMS_VERSION,
      acceptedAt: new Date().toISOString(),
    })
  );
}
