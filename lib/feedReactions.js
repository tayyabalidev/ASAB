import AsyncStorage from '@react-native-async-storage/async-storage';

const storageKey = (userId) => `asab_feed_reactions_${userId}`;
const memoryCache = {};

function emptyRow() {
  return { heart: 0, fire: 0 };
}

function normalizeRow(row) {
  return {
    heart: Number(row?.heart || 0),
    fire: Number(row?.fire || 0),
  };
}

function mergeStores(disk, memory) {
  const merged = { ...(disk || {}) };
  Object.entries(memory || {}).forEach(([postId, row]) => {
    const current = normalizeRow(merged[postId]);
    const local = normalizeRow(row);
    merged[postId] = {
      heart: Math.max(current.heart, local.heart),
      fire: Math.max(current.fire, local.fire),
    };
  });
  return merged;
}

async function readDisk(userId) {
  if (!userId) return {};
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

async function persist(userId) {
  if (!userId || !memoryCache[userId]) return;
  try {
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(memoryCache[userId]));
  } catch (_) {}
}

export async function getFeedReactions(userId, postId) {
  if (!userId) return emptyRow();
  const disk = await readDisk(userId);
  memoryCache[userId] = mergeStores(disk, memoryCache[userId]);
  return normalizeRow(memoryCache[userId][String(postId)]);
}

export async function addFeedReaction(userId, postId, type) {
  if (!userId || !postId) return emptyRow();
  const key = type === 'fire' ? 'fire' : 'heart';
  const id = String(postId);
  if (!memoryCache[userId]) memoryCache[userId] = {};
  const row = normalizeRow(memoryCache[userId][id]);
  row[key] += 1;
  memoryCache[userId][id] = row;
  persist(userId);
  return { ...row };
}
