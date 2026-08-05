import AsyncStorage from '@react-native-async-storage/async-storage';
import { Query } from 'react-native-appwrite';
import { databases, appwriteConfig, getPhotoUrl } from './appwrite';
import { getGridThumbnailUriForPost, isMuxProcessingPost } from './muxPlayback';

const RECENT_SEARCHES_KEY = 'asab_recent_searches_v1';
const MAX_RECENT = 20;

function normalizeQuery(q) {
  return String(q || '').trim().toLowerCase();
}

function scoreMatch(haystack, query) {
  const h = normalizeQuery(haystack);
  const q = normalizeQuery(query);
  if (!q || !h) return 0;
  if (h === q) return 100;
  if (h.startsWith(q)) return 80;
  if (h.includes(q)) return 50;
  // token match
  const tokens = h.split(/[\s._-]+/);
  if (tokens.some((t) => t.startsWith(q))) return 65;
  return 0;
}

function userDisplayName(user) {
  return (
    user?.fullName ||
    user?.fullname ||
    user?.displayName ||
    ''
  ).trim();
}

function mapUserResult(user, query) {
  const username = user?.username || '';
  const fullName = userDisplayName(user);
  const avatarRaw = user?.avatar || '';
  const avatar =
    getPhotoUrl(avatarRaw) ||
    (typeof avatarRaw === 'string' && avatarRaw.startsWith('http') ? avatarRaw : null);
  const score = Math.max(scoreMatch(username, query), scoreMatch(fullName, query) * 0.9);
  return {
    type: 'user',
    id: user.$id,
    username,
    fullName: fullName || username,
    avatar,
    score,
    raw: user,
  };
}

function mapVideoResult(post, creator, query) {
  const title = post?.title || '';
  const creatorName = creator?.username || post?.creatorUsername || 'Creator';
  const thumb = getGridThumbnailUriForPost(post);
  const score = Math.max(
    scoreMatch(title, query),
    scoreMatch(creatorName, query) * 0.75
  );
  return {
    type: 'video',
    id: post.$id,
    title,
    thumbnail: thumb,
    creatorName,
    creatorId: typeof post.creator === 'string' ? post.creator : creator?.$id || post.creator?.$id,
    score,
    raw: post,
  };
}

async function listWithSearchOrFilter(collectionId, attribute, query, limit) {
  const q = String(query || '').trim();
  if (!q) return [];

  try {
    const res = await databases.listDocuments(appwriteConfig.databaseId, collectionId, [
      Query.search(attribute, q),
      Query.limit(limit),
    ]);
    return res.documents || [];
  } catch (_) {
    /* attribute may lack fulltext index — fall through */
  }

  try {
    const res = await databases.listDocuments(appwriteConfig.databaseId, collectionId, [
      Query.orderDesc('$createdAt'),
      Query.limit(Math.min(80, limit * 4)),
    ]);
    const needle = q.toLowerCase();
    return (res.documents || []).filter((doc) =>
      String(doc?.[attribute] || '')
        .toLowerCase()
        .includes(needle)
    );
  } catch (_) {
    return [];
  }
}

async function resolveCreators(posts) {
  const ids = [
    ...new Set(
      (posts || [])
        .map((p) => (typeof p.creator === 'string' ? p.creator : p.creator?.$id))
        .filter(Boolean)
    ),
  ];
  const map = new Map();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const doc = await databases.getDocument(
          appwriteConfig.databaseId,
          appwriteConfig.userCollectionId,
          id
        );
        map.set(id, doc);
      } catch (_) {
        /* skip */
      }
    })
  );
  return map;
}

/**
 * Search users + videos, rank by relevance, return a mixed list.
 * @param {string} query
 * @param {{ limitUsers?: number, limitVideos?: number }} [opts]
 */
export async function searchUsersAndVideos(query, opts = {}) {
  const q = String(query || '').trim();
  if (!q) return [];

  const limitUsers = opts.limitUsers ?? 12;
  const limitVideos = opts.limitVideos ?? 12;

  const [userDocs, videoDocs] = await Promise.all([
    listWithSearchOrFilter(appwriteConfig.userCollectionId, 'username', q, limitUsers),
    listWithSearchOrFilter(appwriteConfig.videoCollectionId, 'title', q, limitVideos),
  ]);

  const playableVideos = (videoDocs || []).filter((p) => !isMuxProcessingPost(p));
  const creators = await resolveCreators(playableVideos);

  const users = (userDocs || [])
    .map((u) => mapUserResult(u, q))
    .filter((u) => u.score > 0 || normalizeQuery(u.username).includes(normalizeQuery(q)));

  // If fulltext returned docs with weak client score, keep them with a floor
  const usersScored = users.map((u) => ({
    ...u,
    score: u.score > 0 ? u.score : 40,
  }));

  const videos = playableVideos.map((p) => {
    const cid = typeof p.creator === 'string' ? p.creator : p.creator?.$id;
    const creator = cid ? creators.get(cid) : null;
    const mapped = mapVideoResult(p, creator, q);
    return { ...mapped, score: mapped.score > 0 ? mapped.score : 35 };
  });

  // Users always above videos (Instagram-style); rank by relevance within each group
  const usersSorted = [...usersScored].sort((a, b) => b.score - a.score);
  const videosSorted = [...videos].sort((a, b) => b.score - a.score);

  return [...usersSorted, ...videosSorted];
}

export async function getRecentSearches() {
  try {
    const raw = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

export async function addRecentSearch(item) {
  if (!item?.id || !item?.type) return getRecentSearches();
  try {
    const prev = await getRecentSearches();
    const next = [
      {
        type: item.type,
        id: item.id,
        label: item.label || item.username || item.title || '',
        subtitle: item.subtitle || item.fullName || item.creatorName || '',
        image: item.image || item.avatar || item.thumbnail || null,
        ts: Date.now(),
      },
      ...prev.filter((r) => !(r.type === item.type && r.id === item.id)),
    ].slice(0, MAX_RECENT);
    await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
    return next;
  } catch (_) {
    return getRecentSearches();
  }
}

export async function removeRecentSearch(type, id) {
  try {
    const prev = await getRecentSearches();
    const next = prev.filter((r) => !(r.type === type && r.id === id));
    await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
    return next;
  } catch (_) {
    return [];
  }
}

export async function clearRecentSearches() {
  try {
    await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch (_) {
    /* ignore */
  }
  return [];
}
