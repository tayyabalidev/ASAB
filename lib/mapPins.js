import AsyncStorage from '@react-native-async-storage/async-storage';
import { ID, Query } from 'react-native-appwrite';
import { appwriteConfig, databases } from './appwrite';

export const MAP_PIN_TYPES = {
  EVENT: 'event',
  FAVORITE: 'favorite',
};

export const MAP_PIN_VISIBILITY = {
  FRIENDS: 'friends',
  EVERYONE: 'everyone',
};

const LOCAL_PINS_KEY = 'asab_map_pins_local_v1';
const PIN_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

function pinsCollectionId() {
  return (
    (typeof process !== 'undefined' &&
      process.env?.EXPO_PUBLIC_MAP_PINS_COLLECTION_ID &&
      String(process.env.EXPO_PUBLIC_MAP_PINS_COLLECTION_ID).trim()) ||
    appwriteConfig.mapPinsCollectionId ||
    ''
  );
}

async function readLocalPins() {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_PINS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

async function writeLocalPins(list) {
  await AsyncStorage.setItem(LOCAL_PINS_KEY, JSON.stringify(list.slice(0, 120)));
}

export function formatPinDateTime(isoOrDate) {
  if (!isoOrDate) return '';
  const date = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function defaultEventDate() {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return date;
}

function asStringArray(value) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

export function normalizeMapPin(doc) {
  if (!doc) return null;
  const lat = Number(doc.latitude);
  const lng = Number(doc.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const pinType =
    doc.pinType === MAP_PIN_TYPES.FAVORITE
      ? MAP_PIN_TYPES.FAVORITE
      : MAP_PIN_TYPES.EVENT;
  const title = String(doc.title || '').trim();
  if (!title) return null;
  const rsvpUserIds = asStringArray(doc.rsvpUserIds);
  return {
    $id: doc.$id || doc.id,
    userId: String(doc.userId || ''),
    username: doc.username || 'User',
    avatar: doc.avatar || '',
    pinType,
    visibility:
      doc.visibility === MAP_PIN_VISIBILITY.EVERYONE
        ? MAP_PIN_VISIBILITY.EVERYONE
        : MAP_PIN_VISIBILITY.FRIENDS,
    title,
    note: String(doc.note || '').trim(),
    whenLabel: String(doc.whenLabel || '').trim(),
    startsAt: doc.startsAt || '',
    latitude: lat,
    longitude: lng,
    placeLabel: doc.placeLabel || '',
    createdAt: doc.createdAt || doc.$createdAt || new Date().toISOString(),
    likeCount: Number(doc.likeCount || 0),
    likedBy: asStringArray(doc.likedBy),
    rsvpUserIds,
    rsvpUsernames: asStringArray(doc.rsvpUsernames),
    rsvpCount: rsvpUserIds.length,
  };
}

export async function listMapPins({ viewerId, friendIds = [] } = {}) {
  const cutoff = Date.now() - PIN_MAX_AGE_MS;
  const allowed = new Set(
    [String(viewerId || ''), ...friendIds.map(String)].filter(Boolean)
  );
  const collectionId = pinsCollectionId();

  let remote = [];
  if (collectionId) {
    try {
      const res = await databases.listDocuments(
        appwriteConfig.databaseId,
        collectionId,
        [Query.orderDesc('$createdAt'), Query.limit(80)]
      );
      remote = (res.documents || []).map(normalizeMapPin).filter(Boolean);
    } catch (_) {
      remote = [];
    }
  }

  const local = (await readLocalPins()).map(normalizeMapPin).filter(Boolean);
  const merged = [...remote, ...local].filter((pin) => {
    if (new Date(pin.createdAt).getTime() < cutoff) return false;
    if (pin.visibility === MAP_PIN_VISIBILITY.EVERYONE) return true;
    if (!allowed.has(String(pin.userId))) return false;
    return true;
  });

  const byId = new Map();
  merged.forEach((pin) => {
    if (!byId.has(pin.$id)) byId.set(pin.$id, pin);
  });
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function createMapPin({
  user,
  pinType = MAP_PIN_TYPES.EVENT,
  visibility = MAP_PIN_VISIBILITY.FRIENDS,
  title,
  note = '',
  whenLabel = '',
  startsAt = '',
  latitude,
  longitude,
  placeLabel = '',
}) {
  if (!user?.$id) throw new Error('Sign in to drop a pin');
  const trimmedTitle = String(title || '').trim();
  if (!trimmedTitle) throw new Error('Add a title for this pin');
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Pick a place on the map first');
  }

  const isEvent = pinType !== MAP_PIN_TYPES.FAVORITE;
  const resolvedStartsAt = isEvent ? String(startsAt || '').trim() : '';
  const resolvedWhen =
    isEvent
      ? String(whenLabel || formatPinDateTime(resolvedStartsAt) || '').trim().slice(0, 80)
      : '';
  const ownerName = user.username || user.name || 'You';
  const payload = {
    userId: user.$id,
    username: ownerName,
    avatar: user.avatar || '',
    pinType: isEvent ? MAP_PIN_TYPES.EVENT : MAP_PIN_TYPES.FAVORITE,
    visibility:
      visibility === MAP_PIN_VISIBILITY.EVERYONE
        ? MAP_PIN_VISIBILITY.EVERYONE
        : MAP_PIN_VISIBILITY.FRIENDS,
    title: trimmedTitle.slice(0, 80),
    note: String(note || '').trim().slice(0, 280),
    whenLabel: resolvedWhen,
    startsAt: resolvedStartsAt,
    latitude,
    longitude,
    placeLabel: placeLabel || '',
    createdAt: new Date().toISOString(),
    likeCount: 0,
    likedBy: [],
    rsvpUserIds: isEvent ? [String(user.$id)] : [],
    rsvpUsernames: isEvent ? [ownerName] : [],
  };

  const collectionId = pinsCollectionId();
  if (collectionId) {
    try {
      const doc = await databases.createDocument(
        appwriteConfig.databaseId,
        collectionId,
        ID.unique(),
        payload
      );
      return normalizeMapPin(doc);
    } catch (e) {
      if (__DEV__) console.warn('[mapPins] remote create failed', e?.message || e);
    }
  }

  const localDoc = {
    $id: `local_pin_${Date.now()}`,
    ...payload,
  };
  const prev = await readLocalPins();
  await writeLocalPins([localDoc, ...prev]);
  return normalizeMapPin(localDoc);
}

export async function togglePinLike({ pin, userId }) {
  if (!pin?.$id || !userId) return pin;
  const likedBy = Array.isArray(pin.likedBy) ? pin.likedBy.map(String) : [];
  const has = likedBy.includes(String(userId));
  const nextLikedBy = has
    ? likedBy.filter((id) => id !== String(userId))
    : [String(userId), ...likedBy];
  const next = {
    ...pin,
    likedBy: nextLikedBy,
    likeCount: nextLikedBy.length,
  };

  const collectionId = pinsCollectionId();
  if (collectionId && !String(pin.$id).startsWith('local_')) {
    try {
      await databases.updateDocument(
        appwriteConfig.databaseId,
        collectionId,
        pin.$id,
        { likedBy: nextLikedBy, likeCount: nextLikedBy.length }
      );
      return next;
    } catch (_) {
      /* local fallback */
    }
  }

  const prev = await readLocalPins();
  const updated = prev.map((item) =>
    item.$id === pin.$id ? { ...item, ...next } : item
  );
  if (!prev.some((item) => item.$id === pin.$id)) updated.unshift(next);
  await writeLocalPins(updated);
  return next;
}

export async function deleteMapPin({ pin, userId }) {
  if (!pin?.$id || !userId || String(pin.userId) !== String(userId)) {
    throw new Error('You can only remove your own pins');
  }

  const collectionId = pinsCollectionId();
  if (collectionId && !String(pin.$id).startsWith('local_')) {
    try {
      await databases.deleteDocument(
        appwriteConfig.databaseId,
        collectionId,
        pin.$id
      );
    } catch (_) {
      /* still remove locally */
    }
  }

  const prev = await readLocalPins();
  await writeLocalPins(prev.filter((item) => item.$id !== pin.$id));
  return true;
}

async function persistPinFields(pin, fields) {
  const next = {
    ...pin,
    ...fields,
    rsvpCount: asStringArray(fields.rsvpUserIds || pin.rsvpUserIds).length,
    likeCount: Array.isArray(fields.likedBy)
      ? fields.likedBy.length
      : Number(pin.likeCount || 0),
  };
  const collectionId = pinsCollectionId();
  if (collectionId && !String(pin.$id).startsWith('local_')) {
    try {
      const remoteFields = { ...fields };
      delete remoteFields.rsvpCount;
      await databases.updateDocument(
        appwriteConfig.databaseId,
        collectionId,
        pin.$id,
        remoteFields
      );
      return next;
    } catch (_) {
      /* local fallback */
    }
  }

  const prev = await readLocalPins();
  const updated = prev.map((item) =>
    item.$id === pin.$id ? { ...item, ...next } : item
  );
  if (!prev.some((item) => item.$id === pin.$id)) updated.unshift(next);
  await writeLocalPins(updated);
  return next;
}

export async function togglePinRsvp({ pin, user }) {
  if (!pin?.$id || !user?.$id || pin.pinType !== MAP_PIN_TYPES.EVENT) return pin;
  const ids = asStringArray(pin.rsvpUserIds);
  const names = asStringArray(pin.rsvpUsernames);
  const userId = String(user.$id);
  const username = user.username || user.name || 'User';
  const pairs = ids.map((id, index) => ({
    id,
    name: names[index] || 'User',
  }));
  const has = pairs.some((item) => item.id === userId);
  const nextPairs = has
    ? pairs.filter((item) => item.id !== userId)
    : [...pairs, { id: userId, name: username }];
  return persistPinFields(pin, {
    rsvpUserIds: nextPairs.map((item) => item.id),
    rsvpUsernames: nextPairs.map((item) => item.name),
  });
}
