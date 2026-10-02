import AsyncStorage from '@react-native-async-storage/async-storage';
import { ID, Query } from 'react-native-appwrite';
import { appwriteConfig, databases } from './appwrite';

const LOCAL_CIRCLES_KEY = 'asab_circles_local_v1';
const LOCAL_MEMBERS_KEY = 'asab_circle_members_local_v1';

export const CIRCLE_ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
};

export const CIRCLE_VISIBILITY = {
  PUBLIC: 'public',
  PRIVATE: 'private',
};

/** Starter Circles shown in discovery until creators add their own. */
export const SEED_CIRCLES = [
  {
    slug: 'basketball',
    name: 'Basketball Circle',
    description: 'Players, fans, pickup games, and highlights.',
    tagline: 'Play. Share. Connect.',
    tags: ['Sports', 'Basketball', 'Local', 'All Levels'],
    filterKeys: ['all', 'local', 'interests'],
    icon: 'disc',
    memberCount: 0,
  },
  {
    slug: 'music',
    name: 'Music Circle',
    description: 'Artists, producers, fans, and collaborations.',
    tagline: 'Make noise together.',
    tags: ['Music', 'Creators'],
    filterKeys: ['all', 'interests'],
    icon: 'music',
    memberCount: 0,
  },
  {
    slug: 'business',
    name: 'Business Circle',
    description: 'Entrepreneurs, customers, investors, networking.',
    tagline: 'Build in public.',
    tags: ['Business', 'Networking'],
    filterKeys: ['all', 'interests'],
    icon: 'trending-up',
    memberCount: 0,
  },
  {
    slug: 'staten-island',
    name: 'Staten Island Circle',
    description: 'Local community for Staten Island creators and fans.',
    tagline: 'Represent SI.',
    tags: ['Local', 'Community'],
    filterKeys: ['all', 'local'],
    icon: 'map-pin',
    memberCount: 0,
  },
  {
    slug: 'creators',
    name: 'Creators Circle',
    description: 'Collabs, tips, and support for ASAB creators.',
    tagline: 'Create with your people.',
    tags: ['Creators', 'Content'],
    filterKeys: ['all', 'interests'],
    icon: 'camera',
    memberCount: 0,
  },
];

function circlesCollectionId() {
  return (
    (typeof process !== 'undefined' &&
      process.env?.EXPO_PUBLIC_CIRCLES_COLLECTION_ID &&
      String(process.env.EXPO_PUBLIC_CIRCLES_COLLECTION_ID).trim()) ||
    appwriteConfig.circlesCollectionId ||
    ''
  );
}

function membersCollectionId() {
  return (
    (typeof process !== 'undefined' &&
      process.env?.EXPO_PUBLIC_CIRCLE_MEMBERS_COLLECTION_ID &&
      String(process.env.EXPO_PUBLIC_CIRCLE_MEMBERS_COLLECTION_ID).trim()) ||
    appwriteConfig.circleMembersCollectionId ||
    ''
  );
}

function asStringArray(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export function formatMemberCount(count) {
  const num = Number(count) || 0;
  if (num >= 1_000_000) {
    const v = (num / 1_000_000).toFixed(1).replace(/\.0$/, '');
    return `${v}M`;
  }
  if (num >= 1000) {
    const v = (num / 1000).toFixed(1).replace(/\.0$/, '');
    return `${v}K`;
  }
  return String(num);
}

/** i18n-ready members label: "1 member" / "12 members" / "1.2K members". */
export function formatMembersLabel(count, t) {
  const num = Math.max(0, Number(count) || 0);
  const display = formatMemberCount(num);
  if (typeof t === 'function') {
    if (num === 1) return t('circles.membersCount_one', { count: display });
    return t('circles.membersCount_other', { count: display });
  }
  return num === 1 ? `${display} member` : `${display} members`;
}

export function normalizeCircle(doc) {
  if (!doc) return null;
  const name = String(doc.name || '').trim();
  if (!name) return null;
  const tags = asStringArray(doc.tags);
  let filterKeys = asStringArray(doc.filterKeys);
  if (!filterKeys.length) {
    filterKeys = ['all'];
    if (tags.some((t) => /local/i.test(t))) filterKeys.push('local');
    if (tags.length) filterKeys.push('interests');
    if (Number(doc.memberCount) >= 5000) filterKeys.push('popular');
  }
  if (!filterKeys.includes('all')) filterKeys = ['all', ...filterKeys];

  return {
    $id: doc.$id || doc.id,
    slug: String(doc.slug || doc.$id || '').trim(),
    name,
    description: String(doc.description || '').trim(),
    tagline: String(doc.tagline || '').trim(),
    avatar: String(doc.avatar || '').trim(),
    banner: String(doc.banner || '').trim(),
    tags,
    filterKeys: [...new Set(filterKeys.map(String))],
    icon: String(doc.icon || 'users').trim() || 'users',
    memberCount: Number(doc.memberCount) || 0,
    membersLabel: formatMemberCount(doc.memberCount),
    creatorId: String(doc.creatorId || '').trim(),
    visibility:
      doc.visibility === CIRCLE_VISIBILITY.PRIVATE
        ? CIRCLE_VISIBILITY.PRIVATE
        : CIRCLE_VISIBILITY.PUBLIC,
    createdAt: doc.createdAt || doc.$createdAt || new Date().toISOString(),
  };
}

export function normalizeMembership(doc) {
  if (!doc) return null;
  const circleId = String(doc.circleId || '').trim();
  const userId = String(doc.userId || '').trim();
  if (!circleId || !userId) return null;
  return {
    $id: doc.$id || doc.id,
    circleId,
    userId,
    username: String(doc.username || '').trim(),
    avatar: String(doc.avatar || '').trim(),
    role: String(doc.role || CIRCLE_ROLES.MEMBER).trim() || CIRCLE_ROLES.MEMBER,
    joinedAt: doc.joinedAt || doc.$createdAt || new Date().toISOString(),
  };
}

async function readLocalCircles() {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_CIRCLES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

async function writeLocalCircles(list) {
  await AsyncStorage.setItem(LOCAL_CIRCLES_KEY, JSON.stringify(list.slice(0, 200)));
}

async function readLocalMembers() {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_MEMBERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

async function writeLocalMembers(list) {
  await AsyncStorage.setItem(LOCAL_MEMBERS_KEY, JSON.stringify(list.slice(0, 500)));
}

function seedPayload(seed, creatorId = '') {
  return {
    name: seed.name,
    slug: seed.slug,
    description: seed.description || '',
    tagline: seed.tagline || '',
    avatar: '',
    banner: '',
    tags: seed.tags || [],
    filterKeys: seed.filterKeys || ['all'],
    icon: seed.icon || 'users',
    memberCount: Number(seed.memberCount) || 0,
    creatorId: creatorId || '',
    visibility: CIRCLE_VISIBILITY.PUBLIC,
  };
}

/**
 * Ensure starter Circles exist (remote when configured, else local).
 * Safe to call on every Circles screen mount.
 */
export async function ensureSeedCircles({ userId = '' } = {}) {
  const existing = await listCircles({ skipSeed: true });
  const bySlug = new Map(
    existing.map((c) => [String(c.slug || '').toLowerCase(), c])
  );
  const missing = SEED_CIRCLES.filter(
    (seed) => !bySlug.has(String(seed.slug).toLowerCase())
  );
  if (!missing.length) return existing;

  const created = [];
  for (const seed of missing) {
    try {
      const circle = await createCircle({
        user: null,
        ...seed,
        skipOwnerMembership: true,
      });
      if (circle) created.push(circle);
    } catch (e) {
      if (__DEV__) console.warn('[circles] seed failed', seed.slug, e?.message || e);
    }
  }

  return [...existing, ...created];
}

export async function listCircles({
  skipSeed = false,
  viewerId = '',
  joinedIds = null,
} = {}) {
  const collectionId = circlesCollectionId();
  let remote = [];

  if (collectionId) {
    try {
      let res;
      try {
        res = await databases.listDocuments(
          appwriteConfig.databaseId,
          collectionId,
          [Query.orderDesc('memberCount'), Query.limit(100)]
        );
      } catch (orderErr) {
        // Some projects reject orderDesc without an index — still load Circles.
        if (__DEV__) {
          console.warn(
            '[circles] list ordered by memberCount failed, retrying unsorted',
            orderErr?.message || orderErr
          );
        }
        res = await databases.listDocuments(
          appwriteConfig.databaseId,
          collectionId,
          [Query.limit(100)]
        );
      }
      remote = (res.documents || []).map(normalizeCircle).filter(Boolean);
    } catch (e) {
      if (__DEV__) console.warn('[circles] list remote failed', e?.message || e);
      remote = [];
    }
  }

  const local = (await readLocalCircles()).map(normalizeCircle).filter(Boolean);
  const byId = new Map();
  [...remote, ...local].forEach((circle) => {
    if (!byId.has(circle.$id)) byId.set(circle.$id, circle);
  });
  let merged = Array.from(byId.values()).sort(
    (a, b) => (b.memberCount || 0) - (a.memberCount || 0)
  );

  if (!skipSeed && merged.length === 0) {
    merged = await ensureSeedCircles({ userId: viewerId });
  }

  // Hide private Circles from discovery unless viewer is creator or member
  if (viewerId || joinedIds) {
    const joined =
      joinedIds instanceof Set
        ? joinedIds
        : new Set(Array.isArray(joinedIds) ? joinedIds.map(String) : []);
    merged = merged.filter((circle) => {
      if (circle.visibility !== CIRCLE_VISIBILITY.PRIVATE) return true;
      if (viewerId && String(circle.creatorId) === String(viewerId)) return true;
      return joined.has(String(circle.$id));
    });
  }

  return merged;
}

export async function createCircle({
  user,
  name,
  slug,
  description = '',
  tagline = '',
  tags = [],
  filterKeys = ['all', 'interests'],
  icon = 'users',
  avatar = '',
  banner = '',
  memberCount = 0,
  visibility = CIRCLE_VISIBILITY.PUBLIC,
  skipOwnerMembership = false,
} = {}) {
  const trimmedName = String(name || '').trim();
  if (!trimmedName) throw new Error('Circle name is required');

  const resolvedSlug =
    String(slug || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') ||
    trimmedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);

  const payload = {
    name: trimmedName.slice(0, 80),
    slug: resolvedSlug.slice(0, 64),
    description: String(description || '').trim().slice(0, 1000),
    tagline: String(tagline || '').trim().slice(0, 120),
    avatar: String(avatar || '').trim().slice(0, 2048),
    banner: String(banner || '').trim().slice(0, 2048),
    tags: asStringArray(tags).slice(0, 12),
    filterKeys: asStringArray(filterKeys).slice(0, 8),
    icon: String(icon || 'users').trim().slice(0, 32),
    memberCount: Math.max(0, Number(memberCount) || 0),
    creatorId: user?.$id ? String(user.$id) : '',
    visibility:
      visibility === CIRCLE_VISIBILITY.PRIVATE
        ? CIRCLE_VISIBILITY.PRIVATE
        : CIRCLE_VISIBILITY.PUBLIC,
  };

  const collectionId = circlesCollectionId();
  let circle = null;

  if (collectionId) {
    try {
      let attemptPayload = { ...payload };
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const doc = await databases.createDocument(
            appwriteConfig.databaseId,
            collectionId,
            ID.unique(),
            attemptPayload
          );
          circle = normalizeCircle(doc);
          break;
        } catch (err) {
          const message = err?.message || '';
          const isUnknownAttr = message.includes('Unknown attribute');
          const unknownAttrMatch = message.match(
            /Unknown attribute:?\s*"?([a-zA-Z0-9_.$-]+)"?/i
          );
          const unknownAttr = unknownAttrMatch?.[1];
          if (!isUnknownAttr || !unknownAttr || !(unknownAttr in attemptPayload)) {
            throw err;
          }
          delete attemptPayload[unknownAttr];
        }
      }
    } catch (e) {
      if (__DEV__) console.warn('[circles] remote create failed', e?.message || e);
      // When Appwrite is configured, do not silently succeed as local-only.
      throw e instanceof Error
        ? e
        : new Error(e?.message || 'Failed to create Circle on server');
    }
  }

  if (!circle) {
    if (collectionId) {
      throw new Error('Failed to create Circle on server');
    }
    const localDoc = {
      $id: `local_circle_${resolvedSlug}_${Date.now()}`,
      ...payload,
      createdAt: new Date().toISOString(),
    };
    const prev = await readLocalCircles();
    const withoutDup = prev.filter(
      (c) => String(c.slug || '').toLowerCase() !== resolvedSlug
    );
    await writeLocalCircles([localDoc, ...withoutDup]);
    circle = normalizeCircle(localDoc);
  }

  if (circle && user?.$id && !skipOwnerMembership) {
    try {
      const joined = await joinCircle({
        circle,
        user,
        role: CIRCLE_ROLES.OWNER,
        skipCountBump: Number(circle.memberCount) > 0,
      });
      if (joined?.circle) circle = joined.circle;
    } catch (e) {
      // Owner row must exist when Appwrite members collection is configured.
      if (membersCollectionId() && !String(circle.$id).startsWith('local_')) {
        throw e instanceof Error
          ? e
          : new Error(e?.message || 'Failed to add you as Circle owner');
      }
    }
  }

  return circle;
}

/**
 * Update Circle fields. Only pass fields you want to change.
 * Strips unknown Appwrite attributes and retries.
 */
export async function updateCircle(circleId, fields = {}) {
  const id = String(circleId || '').trim();
  if (!id) throw new Error('Circle is required');

  const payload = {};
  if (fields.name != null) {
    const name = String(fields.name).trim().slice(0, 80);
    if (!name) throw new Error('Circle name is required');
    payload.name = name;
  }
  if (fields.description != null) {
    payload.description = String(fields.description || '').trim().slice(0, 1000);
  }
  if (fields.tagline != null) {
    payload.tagline = String(fields.tagline || '').trim().slice(0, 120);
  }
  if (fields.avatar != null) {
    payload.avatar = String(fields.avatar || '').trim().slice(0, 2048);
  }
  if (fields.banner != null) {
    payload.banner = String(fields.banner || '').trim().slice(0, 2048);
  }
  if (fields.tags != null) {
    payload.tags = asStringArray(fields.tags).slice(0, 12);
  }
  if (fields.filterKeys != null) {
    payload.filterKeys = asStringArray(fields.filterKeys).slice(0, 8);
  }
  if (fields.icon != null) {
    payload.icon = String(fields.icon || 'users').trim().slice(0, 32);
  }
  if (fields.visibility != null) {
    payload.visibility =
      fields.visibility === CIRCLE_VISIBILITY.PRIVATE
        ? CIRCLE_VISIBILITY.PRIVATE
        : CIRCLE_VISIBILITY.PUBLIC;
  }

  if (!Object.keys(payload).length) {
    return getCircleById(id);
  }

  const collectionId = circlesCollectionId();
  if (collectionId && !id.startsWith('local_')) {
    let lastError = null;
    try {
      let attemptPayload = { ...payload };
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const doc = await databases.updateDocument(
            appwriteConfig.databaseId,
            collectionId,
            id,
            attemptPayload
          );
          return normalizeCircle(doc);
        } catch (err) {
          lastError = err;
          const message = err?.message || '';
          const isUnknownAttr = message.includes('Unknown attribute');
          const unknownAttrMatch = message.match(
            /Unknown attribute:?\s*"?([a-zA-Z0-9_.$-]+)"?/i
          );
          const unknownAttr = unknownAttrMatch?.[1];
          if (!isUnknownAttr || !unknownAttr || !(unknownAttr in attemptPayload)) {
            throw err;
          }
          delete attemptPayload[unknownAttr];
          if (!Object.keys(attemptPayload).length) throw err;
        }
      }
    } catch (e) {
      if (__DEV__) console.warn('[circles] remote update failed', e?.message || e);
      throw e || lastError || new Error('Failed to update Circle');
    }
  }

  const prev = await readLocalCircles();
  const existing =
    prev.find((c) => String(c.$id) === id) ||
    (await getCircleById(id)) ||
    null;
  if (!existing) throw new Error('Circle not found');
  const merged = { ...existing, ...payload };
  const without = prev.filter((c) => String(c.$id) !== id);
  await writeLocalCircles([merged, ...without]);
  return normalizeCircle(merged);
}

/** True if user is circle creator or owner/admin member. */
export function canEditCircle(circle, membershipOrRole, userId) {
  if (!circle || !userId) return false;
  if (String(circle.creatorId || '') === String(userId)) return true;
  const role =
    typeof membershipOrRole === 'string'
      ? membershipOrRole
      : membershipOrRole?.role;
  return role === CIRCLE_ROLES.OWNER || role === CIRCLE_ROLES.ADMIN;
}

export async function getJoinedCircleIds(userId) {
  if (!userId) return new Set();
  const memberships = await listMembershipsForUser(userId);
  return new Set(memberships.map((m) => String(m.circleId)));
}

/**
 * Load one Circle by document id (remote or local).
 */
export async function getCircleById(circleId) {
  if (!circleId) return null;
  const id = String(circleId);

  const collectionId = circlesCollectionId();
  if (collectionId && !id.startsWith('local_')) {
    try {
      const doc = await databases.getDocument(
        appwriteConfig.databaseId,
        collectionId,
        id
      );
      return normalizeCircle(doc);
    } catch (e) {
      if (__DEV__) console.warn('[circles] getCircleById remote failed', e?.message || e);
    }
  }

  const local = (await readLocalCircles())
    .map(normalizeCircle)
    .filter(Boolean);
  return local.find((c) => String(c.$id) === id) || null;
}

/**
 * List members of a Circle (remote + local).
 */
export async function listCircleMembers(circleId, { limit = 100 } = {}) {
  if (!circleId) return [];
  const id = String(circleId);
  const collectionId = membersCollectionId();
  let remote = [];

  if (collectionId && !id.startsWith('local_')) {
    try {
      const res = await databases.listDocuments(
        appwriteConfig.databaseId,
        collectionId,
        [
          Query.equal('circleId', id),
          Query.orderDesc('joinedAt'),
          Query.limit(Math.min(100, Math.max(1, limit))),
        ]
      );
      remote = (res.documents || []).map(normalizeMembership).filter(Boolean);
    } catch (e) {
      // joinedAt index may be missing — retry without order
      try {
        const res = await databases.listDocuments(
          appwriteConfig.databaseId,
          collectionId,
          [Query.equal('circleId', id), Query.limit(Math.min(100, Math.max(1, limit)))]
        );
        remote = (res.documents || []).map(normalizeMembership).filter(Boolean);
      } catch (e2) {
        if (__DEV__) {
          console.warn('[circles] listCircleMembers failed', e2?.message || e2);
        }
        remote = [];
      }
    }
  }

  const local = (await readLocalMembers())
    .filter((m) => String(m.circleId) === id)
    .map(normalizeMembership)
    .filter(Boolean);

  const byUser = new Map();
  [...remote, ...local].forEach((m) => {
    if (!byUser.has(m.userId)) byUser.set(m.userId, m);
  });

  const roleRank = {
    [CIRCLE_ROLES.OWNER]: 0,
    [CIRCLE_ROLES.ADMIN]: 1,
    [CIRCLE_ROLES.MEMBER]: 2,
  };

  return Array.from(byUser.values()).sort((a, b) => {
    const ra = roleRank[a.role] ?? 9;
    const rb = roleRank[b.role] ?? 9;
    if (ra !== rb) return ra - rb;
    return String(a.username || '').localeCompare(String(b.username || ''));
  });
}

export async function isUserCircleMember(circleId, userId) {
  if (!circleId || !userId) return false;
  const found = await findMembershipDoc(circleId, userId);
  return Boolean(found?.doc);
}

export async function listMembershipsForUser(userId) {
  if (!userId) return [];
  const collectionId = membersCollectionId();
  let remote = [];

  if (collectionId) {
    try {
      const res = await databases.listDocuments(
        appwriteConfig.databaseId,
        collectionId,
        [Query.equal('userId', String(userId)), Query.limit(100)]
      );
      remote = (res.documents || []).map(normalizeMembership).filter(Boolean);
    } catch (e) {
      if (__DEV__) console.warn('[circles] list memberships failed', e?.message || e);
      remote = [];
    }
  }

  const local = (await readLocalMembers())
    .filter((m) => String(m.userId) === String(userId))
    .map(normalizeMembership)
    .filter(Boolean);

  const byKey = new Map();
  [...remote, ...local].forEach((m) => {
    const key = `${m.circleId}:${m.userId}`;
    if (!byKey.has(key)) byKey.set(key, m);
  });
  return Array.from(byKey.values());
}

async function findMembershipDoc(circleId, userId) {
  const collectionId = membersCollectionId();
  if (collectionId && !String(circleId).startsWith('local_')) {
    try {
      const res = await databases.listDocuments(
        appwriteConfig.databaseId,
        collectionId,
        [
          Query.equal('circleId', String(circleId)),
          Query.equal('userId', String(userId)),
          Query.limit(1),
        ]
      );
      const doc = res.documents?.[0];
      if (doc) return { source: 'remote', doc: normalizeMembership(doc), raw: doc };
    } catch (_) {
      /* fall through */
    }
  }

  const local = await readLocalMembers();
  const found = local.find(
    (m) =>
      String(m.circleId) === String(circleId) && String(m.userId) === String(userId)
  );
  if (found) {
    return { source: 'local', doc: normalizeMembership(found), raw: found };
  }
  return null;
}

async function bumpMemberCount(circle, delta) {
  if (!circle?.$id) return circle;
  const nextCount = Math.max(0, (Number(circle.memberCount) || 0) + delta);
  const fields = { memberCount: nextCount };
  const collectionId = circlesCollectionId();

  if (collectionId && !String(circle.$id).startsWith('local_')) {
    try {
      const doc = await databases.updateDocument(
        appwriteConfig.databaseId,
        collectionId,
        circle.$id,
        fields
      );
      return normalizeCircle(doc);
    } catch (e) {
      if (__DEV__) console.warn('[circles] memberCount update failed', e?.message || e);
    }
  }

  const prev = await readLocalCircles();
  const updated = prev.map((item) =>
    item.$id === circle.$id ? { ...item, ...fields } : item
  );
  if (!prev.some((item) => item.$id === circle.$id)) {
    updated.unshift({ ...circle, ...fields });
  }
  await writeLocalCircles(updated);
  return normalizeCircle({ ...circle, ...fields });
}

/**
 * Join a Circle. Idempotent if already a member.
 * @returns {{ circle, membership, joined: boolean }}
 */
export async function joinCircle({
  circle,
  user,
  role = CIRCLE_ROLES.MEMBER,
  skipCountBump = false,
} = {}) {
  if (!circle?.$id) throw new Error('Circle is required');
  if (!user?.$id) throw new Error('Sign in to join a Circle');

  const existing = await findMembershipDoc(circle.$id, user.$id);
  if (existing?.doc) {
    return { circle, membership: existing.doc, joined: true };
  }

  const payload = {
    circleId: String(circle.$id),
    userId: String(user.$id),
    username: user.username || user.name || 'User',
    avatar: user.avatar || '',
    role: role || CIRCLE_ROLES.MEMBER,
    joinedAt: new Date().toISOString(),
  };

  let membership = null;
  const collectionId = membersCollectionId();

  if (collectionId && !String(circle.$id).startsWith('local_')) {
    try {
      const doc = await databases.createDocument(
        appwriteConfig.databaseId,
        collectionId,
        ID.unique(),
        payload
      );
      membership = normalizeMembership(doc);
    } catch (e) {
      if (__DEV__) console.warn('[circles] remote join failed', e?.message || e);
      throw e instanceof Error
        ? e
        : new Error(e?.message || 'Failed to join Circle on server');
    }
  }

  if (!membership) {
    if (collectionId && !String(circle.$id).startsWith('local_')) {
      throw new Error('Failed to join Circle on server');
    }
    const localDoc = {
      $id: `local_member_${circle.$id}_${user.$id}`,
      ...payload,
    };
    const prev = await readLocalMembers();
    const withoutDup = prev.filter(
      (m) =>
        !(
          String(m.circleId) === String(circle.$id) &&
          String(m.userId) === String(user.$id)
        )
    );
    await writeLocalMembers([localDoc, ...withoutDup]);
    membership = normalizeMembership(localDoc);
  }

  let nextCircle = circle;
  if (!skipCountBump) {
    nextCircle = (await bumpMemberCount(circle, 1)) || {
      ...circle,
      memberCount: (Number(circle.memberCount) || 0) + 1,
      membersLabel: formatMemberCount((Number(circle.memberCount) || 0) + 1),
    };
  }

  return { circle: nextCircle, membership, joined: true };
}

/**
 * Leave a Circle.
 * @returns {{ circle, joined: false }}
 */
export async function leaveCircle({ circle, user } = {}) {
  if (!circle?.$id) throw new Error('Circle is required');
  if (!user?.$id) throw new Error('Sign in to leave a Circle');

  const existing = await findMembershipDoc(circle.$id, user.$id);
  if (!existing) {
    return { circle, joined: false };
  }

  if (existing.source === 'remote' && existing.raw?.$id) {
    try {
      await databases.deleteDocument(
        appwriteConfig.databaseId,
        membersCollectionId(),
        existing.raw.$id
      );
    } catch (e) {
      if (__DEV__) console.warn('[circles] remote leave failed', e?.message || e);
      throw e instanceof Error
        ? e
        : new Error(e?.message || 'Failed to leave Circle on server');
    }
  }

  const prev = await readLocalMembers();
  await writeLocalMembers(
    prev.filter(
      (m) =>
        !(
          String(m.circleId) === String(circle.$id) &&
          String(m.userId) === String(user.$id)
        )
    )
  );

  const nextCircle =
    (await bumpMemberCount(circle, -1)) || {
      ...circle,
      memberCount: Math.max(0, (Number(circle.memberCount) || 0) - 1),
      membersLabel: formatMemberCount(
        Math.max(0, (Number(circle.memberCount) || 0) - 1)
      ),
    };

  return { circle: nextCircle, joined: false };
}

export async function toggleJoinCircle({ circle, user, isJoined }) {
  if (isJoined) return leaveCircle({ circle, user });
  return joinCircle({ circle, user });
}

/** True when Appwrite collection IDs are configured (remote sync available). */
export function areCirclesCollectionsConfigured() {
  return Boolean(circlesCollectionId() && membersCollectionId());
}

// Keep seedPayload available for tests / future admin tools
export { seedPayload };
