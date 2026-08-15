import AsyncStorage from '@react-native-async-storage/async-storage';
import { ID, Query } from 'react-native-appwrite';
import {
  appwriteConfig,
  databases,
  uploadFile,
} from './appwrite';

const FRIEND_LIKES_KEY = (userId) => `asab_map_friend_likes_${userId}`;
const LOCAL_MOMENTS_KEY = 'asab_map_moments_local_v1';
const MOMENT_MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48h

function momentsCollectionId() {
  return (
    (typeof process !== 'undefined' &&
      process.env?.EXPO_PUBLIC_MAP_MOMENTS_COLLECTION_ID &&
      String(process.env.EXPO_PUBLIC_MAP_MOMENTS_COLLECTION_ID).trim()) ||
    appwriteConfig.mapMomentsCollectionId ||
    ''
  );
}

export async function getLikedFriendIds(userId) {
  if (!userId) return [];
  try {
    const raw = await AsyncStorage.getItem(FRIEND_LIKES_KEY(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch (_) {
    return [];
  }
}

export async function toggleFriendLike(userId, friendId) {
  const id = String(friendId || '').trim();
  if (!userId || !id) return { liked: false, ids: [] };
  const prev = await getLikedFriendIds(userId);
  const liked = !prev.includes(id);
  const next = liked ? [id, ...prev.filter((x) => x !== id)] : prev.filter((x) => x !== id);
  await AsyncStorage.setItem(FRIEND_LIKES_KEY(userId), JSON.stringify(next));
  return { liked, ids: next };
}

async function readLocalMoments() {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_MOMENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

async function writeLocalMoments(list) {
  await AsyncStorage.setItem(LOCAL_MOMENTS_KEY, JSON.stringify(list.slice(0, 100)));
}

function normalizeMoment(doc) {
  if (!doc) return null;
  const lat = Number(doc.latitude);
  const lng = Number(doc.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    $id: doc.$id || doc.id,
    userId: String(doc.userId || ''),
    username: doc.username || 'User',
    avatar: doc.avatar || '',
    photoUrl: doc.photoUrl || doc.image || '',
    latitude: lat,
    longitude: lng,
    placeLabel: doc.placeLabel || '',
    createdAt: doc.createdAt || doc.$createdAt || new Date().toISOString(),
    likeCount: Number(doc.likeCount || 0),
    likedBy: Array.isArray(doc.likedBy) ? doc.likedBy.map(String) : [],
  };
}

export async function listMapMoments({ viewerId, friendIds = [] } = {}) {
  const cutoff = Date.now() - MOMENT_MAX_AGE_MS;
  const allowed = new Set([String(viewerId || ''), ...friendIds.map(String)].filter(Boolean));
  const collectionId = momentsCollectionId();

  let remote = [];
  if (collectionId) {
    try {
      const res = await databases.listDocuments(appwriteConfig.databaseId, collectionId, [
        Query.orderDesc('$createdAt'),
        Query.limit(80),
      ]);
      remote = (res.documents || []).map(normalizeMoment).filter(Boolean);
    } catch (_) {
      remote = [];
    }
  }

  const local = (await readLocalMoments()).map(normalizeMoment).filter(Boolean);
  const merged = [...remote, ...local].filter((m) => {
    if (!m?.photoUrl) return false;
    if (new Date(m.createdAt).getTime() < cutoff) return false;
    if (!allowed.has(String(m.userId))) return false;
    return true;
  });

  const byId = new Map();
  merged.forEach((m) => {
    if (!byId.has(m.$id)) byId.set(m.$id, m);
  });
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function createMapMoment({
  user,
  photoAsset,
  latitude,
  longitude,
  placeLabel = '',
}) {
  if (!user?.$id || !photoAsset?.uri) {
    throw new Error('Missing photo or user');
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Location required to post a map photo');
  }

  const file = {
    uri: photoAsset.uri,
    name: photoAsset.fileName || photoAsset.name || `map_${Date.now()}.jpg`,
    type: photoAsset.mimeType || photoAsset.type || 'image/jpeg',
    mimeType: photoAsset.mimeType || photoAsset.type || 'image/jpeg',
    size: photoAsset.fileSize || photoAsset.size,
  };

  const photoUrl = await uploadFile(file, 'image');
  if (!photoUrl) throw new Error('Failed to upload photo');

  const payload = {
    userId: user.$id,
    username: user.username || user.name || 'You',
    avatar: user.avatar || '',
    photoUrl,
    latitude,
    longitude,
    placeLabel: placeLabel || '',
    createdAt: new Date().toISOString(),
    likeCount: 0,
    likedBy: [],
  };

  const collectionId = momentsCollectionId();
  if (collectionId) {
    try {
      const doc = await databases.createDocument(
        appwriteConfig.databaseId,
        collectionId,
        ID.unique(),
        payload
      );
      return normalizeMoment(doc);
    } catch (e) {
      // Fall through to local so the feature still works in UI review builds.
      if (__DEV__) console.warn('[mapMoments] remote create failed', e?.message || e);
    }
  }

  const localDoc = {
    $id: `local_${Date.now()}`,
    ...payload,
  };
  const prev = await readLocalMoments();
  await writeLocalMoments([localDoc, ...prev]);
  return normalizeMoment(localDoc);
}

export async function toggleMomentLike({ moment, userId }) {
  if (!moment?.$id || !userId) return moment;
  const likedBy = Array.isArray(moment.likedBy) ? moment.likedBy.map(String) : [];
  const has = likedBy.includes(String(userId));
  const nextLikedBy = has
    ? likedBy.filter((id) => id !== String(userId))
    : [String(userId), ...likedBy];
  const next = {
    ...moment,
    likedBy: nextLikedBy,
    likeCount: nextLikedBy.length,
  };

  const collectionId = momentsCollectionId();
  if (collectionId && !String(moment.$id).startsWith('local_')) {
    try {
      await databases.updateDocument(
        appwriteConfig.databaseId,
        collectionId,
        moment.$id,
        { likedBy: nextLikedBy, likeCount: nextLikedBy.length }
      );
      return next;
    } catch (_) {
      /* local fallback below */
    }
  }

  const prev = await readLocalMoments();
  const updated = prev.map((m) => (m.$id === moment.$id ? { ...m, ...next } : m));
  if (!prev.some((m) => m.$id === moment.$id)) updated.unshift(next);
  await writeLocalMoments(updated);
  return next;
}
