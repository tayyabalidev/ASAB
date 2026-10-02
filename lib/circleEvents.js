import AsyncStorage from '@react-native-async-storage/async-storage';
import { ID, Query } from 'react-native-appwrite';
import { appwriteConfig, databases } from './appwrite';

const LOCAL_EVENTS_KEY = 'asab_circle_events_local_v1';

function eventsCollectionId() {
  return (
    (typeof process !== 'undefined' &&
      process.env?.EXPO_PUBLIC_CIRCLE_EVENTS_COLLECTION_ID &&
      String(process.env.EXPO_PUBLIC_CIRCLE_EVENTS_COLLECTION_ID).trim()) ||
    appwriteConfig.circleEventsCollectionId ||
    ''
  );
}

function asStringArray(value) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

export function formatCircleEventWhen(isoOrDate) {
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

export function defaultCircleEventDate() {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 2);
  return date;
}

export function normalizeCircleEvent(doc) {
  if (!doc) return null;
  const title = String(doc.title || '').trim();
  const circleId = String(doc.circleId || '').trim();
  if (!title || !circleId) return null;
  const rsvpUserIds = asStringArray(doc.rsvpUserIds);
  return {
    $id: doc.$id || doc.id,
    circleId,
    title: title.slice(0, 80),
    note: String(doc.note || '').trim().slice(0, 500),
    placeLabel: String(doc.placeLabel || '').trim().slice(0, 120),
    startsAt: doc.startsAt || '',
    whenLabel:
      String(doc.whenLabel || '').trim() ||
      formatCircleEventWhen(doc.startsAt) ||
      '',
    creatorId: String(doc.creatorId || '').trim(),
    creatorUsername: String(doc.creatorUsername || '').trim(),
    creatorAvatar: String(doc.creatorAvatar || '').trim(),
    createdAt: doc.createdAt || doc.$createdAt || new Date().toISOString(),
    rsvpUserIds,
    rsvpUsernames: asStringArray(doc.rsvpUsernames),
    rsvpCount: rsvpUserIds.length,
  };
}

async function readLocalEvents() {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_EVENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

async function writeLocalEvents(list) {
  await AsyncStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(list.slice(0, 200)));
}

export function areCircleEventsConfigured() {
  return Boolean(eventsCollectionId());
}

export async function listCircleEvents(circleId, { limit = 50 } = {}) {
  const id = String(circleId || '').trim();
  if (!id) return [];

  const collectionId = eventsCollectionId();
  let remote = [];

  if (collectionId && !id.startsWith('local_')) {
    try {
      const res = await databases.listDocuments(
        appwriteConfig.databaseId,
        collectionId,
        [
          Query.equal('circleId', id),
          Query.orderAsc('startsAt'),
          Query.limit(Math.min(100, Math.max(1, limit))),
        ]
      );
      remote = (res.documents || []).map(normalizeCircleEvent).filter(Boolean);
    } catch (e) {
      try {
        const res = await databases.listDocuments(
          appwriteConfig.databaseId,
          collectionId,
          [
            Query.equal('circleId', id),
            Query.orderDesc('$createdAt'),
            Query.limit(Math.min(100, Math.max(1, limit))),
          ]
        );
        remote = (res.documents || []).map(normalizeCircleEvent).filter(Boolean);
      } catch (e2) {
        if (__DEV__) {
          console.warn('[circleEvents] list failed', e2?.message || e2);
        }
        remote = [];
      }
    }
  }

  const local = (await readLocalEvents())
    .filter((item) => String(item.circleId) === id)
    .map(normalizeCircleEvent)
    .filter(Boolean);

  const byId = new Map();
  [...remote, ...local].forEach((event) => {
    if (!byId.has(event.$id)) byId.set(event.$id, event);
  });

  return Array.from(byId.values()).sort((a, b) => {
    const ta = new Date(a.startsAt || a.createdAt || 0).getTime();
    const tb = new Date(b.startsAt || b.createdAt || 0).getTime();
    return ta - tb;
  });
}

export async function createCircleEvent({
  user,
  circleId,
  title,
  note = '',
  placeLabel = '',
  startsAt = '',
} = {}) {
  if (!user?.$id) throw new Error('Sign in to create an event');
  const cid = String(circleId || '').trim();
  if (!cid) throw new Error('Circle is required');
  const trimmedTitle = String(title || '').trim();
  if (!trimmedTitle) throw new Error('Add a title for this event');

  const starts =
    startsAt instanceof Date
      ? startsAt.toISOString()
      : String(startsAt || '').trim();
  const whenLabel = formatCircleEventWhen(starts);
  const username = user.username || user.name || 'User';

  const payload = {
    circleId: cid,
    title: trimmedTitle.slice(0, 80),
    note: String(note || '').trim().slice(0, 500),
    placeLabel: String(placeLabel || '').trim().slice(0, 120),
    startsAt: starts,
    whenLabel: whenLabel.slice(0, 80),
    creatorId: String(user.$id),
    creatorUsername: username,
    creatorAvatar: user.avatar || '',
    createdAt: new Date().toISOString(),
    rsvpUserIds: [String(user.$id)],
    rsvpUsernames: [username],
  };

  const collectionId = eventsCollectionId();
  if (collectionId && !cid.startsWith('local_')) {
    try {
      const doc = await databases.createDocument(
        appwriteConfig.databaseId,
        collectionId,
        ID.unique(),
        payload
      );
      return normalizeCircleEvent(doc);
    } catch (e) {
      if (__DEV__) console.warn('[circleEvents] remote create failed', e?.message || e);
      throw e instanceof Error
        ? e
        : new Error(e?.message || 'Failed to create event on server');
    }
  }

  if (collectionId) {
    throw new Error('Failed to create event on server');
  }

  const localDoc = {
    $id: `local_event_${Date.now()}`,
    ...payload,
  };
  const prev = await readLocalEvents();
  await writeLocalEvents([localDoc, ...prev]);
  return normalizeCircleEvent(localDoc);
}

async function persistEventFields(event, fields) {
  const next = {
    ...event,
    ...fields,
    rsvpCount: asStringArray(fields.rsvpUserIds || event.rsvpUserIds).length,
  };

  const collectionId = eventsCollectionId();
  if (collectionId && !String(event.$id).startsWith('local_')) {
    try {
      const doc = await databases.updateDocument(
        appwriteConfig.databaseId,
        collectionId,
        event.$id,
        {
          rsvpUserIds: next.rsvpUserIds,
          rsvpUsernames: next.rsvpUsernames,
        }
      );
      return normalizeCircleEvent(doc) || next;
    } catch (e) {
      if (__DEV__) console.warn('[circleEvents] RSVP update failed', e?.message || e);
      throw e instanceof Error
        ? e
        : new Error(e?.message || 'Failed to update RSVP on server');
    }
  }

  const prev = await readLocalEvents();
  const updated = prev.map((item) =>
    item.$id === event.$id ? { ...item, ...next } : item
  );
  if (!prev.some((item) => item.$id === event.$id)) updated.unshift(next);
  await writeLocalEvents(updated);
  return next;
}

export async function toggleCircleEventRsvp({ event, user } = {}) {
  if (!event?.$id || !user?.$id) return event;
  const ids = asStringArray(event.rsvpUserIds);
  const names = asStringArray(event.rsvpUsernames);
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

  return persistEventFields(event, {
    rsvpUserIds: nextPairs.map((item) => item.id),
    rsvpUsernames: nextPairs.map((item) => item.name),
  });
}

export async function deleteCircleEvent({ event, user } = {}) {
  if (!event?.$id || !user?.$id) {
    throw new Error('Unable to delete event');
  }
  if (String(event.creatorId) !== String(user.$id)) {
    throw new Error('You can only remove events you created');
  }

  const collectionId = eventsCollectionId();
  if (collectionId && !String(event.$id).startsWith('local_')) {
    try {
      await databases.deleteDocument(
        appwriteConfig.databaseId,
        collectionId,
        event.$id
      );
    } catch (_) {
      /* still remove locally */
    }
  }

  const prev = await readLocalEvents();
  await writeLocalEvents(prev.filter((item) => item.$id !== event.$id));
  return true;
}
