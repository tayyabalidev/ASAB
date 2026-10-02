import { ID, Query } from "react-native-appwrite";
import {
  appwriteConfig,
  createNotification,
  databases,
  getPhotoUrl,
  incrementShareCount,
} from "./appwrite";
import { getConnectedUserIds, getMutualFriendIds, normalizeIdList } from "./locationService";
import { getPlaybackUriForPost, getThumbnailUriForPost } from "./muxPlayback";
import { getSlidePhotoUris } from "./photoSlides";
import { sendMessagePushNotification } from "./pushNotificationService";

export const FIRE_SHARE_COOLDOWN_MS = 25000;
const lastSentAt = {};

function cooldownKey(userId, postId) {
  return `${userId}:${postId}`;
}

export function getFireShareCooldownRemaining(userId, postId) {
  const sentAt = lastSentAt[cooldownKey(userId, postId)];
  if (!sentAt) return 0;
  return Math.max(0, FIRE_SHARE_COOLDOWN_MS - (Date.now() - sentAt));
}

function asHttpUrl(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^(https?:|file:|data:)/i.test(trimmed)) return trimmed;
  return getPhotoUrl(trimmed) || "";
}

function resolveShareMedia(post) {
  const slides = getSlidePhotoUris(post);
  const photoUrl = asHttpUrl(slides[0] || post?.photo);
  const isPhoto = post?.postType === "photo" || Boolean(photoUrl && !post?.video && !post?.mux_playback_id);
  if (isPhoto && photoUrl) {
    return { type: "image", url: photoUrl, isPhoto: true };
  }
  const videoUrl = getPlaybackUriForPost(post);
  if (videoUrl) return { type: "video", url: videoUrl, isPhoto: false };
  const thumb = asHttpUrl(getThumbnailUriForPost(post) || post?.thumbnail);
  if (thumb) return { type: "image", url: thumb, isPhoto: Boolean(isPhoto) };
  if (photoUrl) return { type: "image", url: photoUrl, isPhoto: true };
  return { type: "text", url: "", isPhoto: Boolean(isPhoto) };
}

async function loadFriendPool(user) {
  const me = String(user?.$id || "");
  let following = normalizeIdList(user?.following);
  let followers = normalizeIdList(user?.followers);
  if (me && !following.length && !followers.length) {
    try {
      const fresh = await databases.getDocument(
        appwriteConfig.databaseId,
        appwriteConfig.userCollectionId,
        me
      );
      following = normalizeIdList(fresh?.following);
      followers = normalizeIdList(fresh?.followers);
      return {
        mutual: following.filter((id) => followers.includes(id) && id !== me),
        connected: getConnectedUserIds(fresh).filter((id) => id !== me),
      };
    } catch (_) {}
  }
  return {
    mutual: getMutualFriendIds(user),
    connected: getConnectedUserIds(user).filter((id) => id !== me),
  };
}

export async function getMostActiveFriendIds(user, limit = 3) {
  const me = String(user?.$id || "");
  if (!me) return [];
  const { mutual, connected } = await loadFriendPool(user);
  const pool = [...new Set([...mutual, ...connected])];
  const scores = {};
  pool.forEach((id, index) => {
    scores[id] = mutual.includes(id) ? 80_000 - index : 10_000 - index;
  });

  try {
    const [sent, received] = await Promise.all([
      databases.listDocuments(appwriteConfig.databaseId, appwriteConfig.messagesCollectionId, [
        Query.equal("senderId", me),
        Query.orderDesc("$createdAt"),
        Query.limit(80),
      ]),
      databases.listDocuments(appwriteConfig.databaseId, appwriteConfig.messagesCollectionId, [
        Query.equal("receiverId", me),
        Query.orderDesc("$createdAt"),
        Query.limit(80),
      ]),
    ]);
    const now = Date.now();
    [...(sent.documents || []), ...(received.documents || [])].forEach((msg) => {
      const other =
        String(msg.senderId) === me ? String(msg.receiverId || "") : String(msg.senderId || "");
      if (!other || other === me) return;
      if (!scores[other] && !pool.length) scores[other] = 1;
      if (scores[other] == null) return;
      const age = Math.max(0, now - new Date(msg.$createdAt).getTime());
      scores[other] = Math.max(scores[other], 5_000_000_000 - age);
    });
  } catch (_) {}

  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
    .filter(Boolean)
    .slice(0, limit);
}

async function sendShareMessage({ user, friendId, post, media }) {
  const title = String(post?.title || "").trim() || (media.isPhoto ? "photo" : "video");
  const caption = `🔥 ${user.username || "A friend"} sent you this ${media.isPhoto ? "photo" : "video"}: ${title}`;
  const isMedia = Boolean(media.url) && (media.type === "video" || media.type === "image");
  const payload = {
    chatId: friendId,
    senderId: user.$id,
    receiverId: friendId,
    type: isMedia ? media.type : "text",
    content: isMedia ? media.url : media.url ? `${caption}\n${media.url}` : caption,
    fileUrl: isMedia ? media.url : "",
    is_read: false,
  };

  await databases.createDocument(
    appwriteConfig.databaseId,
    appwriteConfig.messagesCollectionId,
    ID.unique(),
    payload
  );

  createNotification("message", user.$id, friendId, null).catch(() => {});
  sendMessagePushNotification({
    fromUserId: user.$id,
    fromUsername: user.username,
    toUserId: friendId,
    messagePreview: caption,
  }).catch(() => {});
}

export async function sharePostToActiveFriends({ user, post }) {
  if (!user?.$id || !post?.$id) {
    return { ok: false, error: "Please login to share." };
  }

  const remaining = getFireShareCooldownRemaining(user.$id, post.$id);
  if (remaining > 0) {
    return {
      ok: false,
      cooldown: true,
      remainingMs: remaining,
      error: "Already sent. Try again in a moment.",
    };
  }

  const friendIds = await getMostActiveFriendIds(user, 3);
  if (!friendIds.length) {
    return { ok: false, error: "Add some friends first to send this with Fire." };
  }

  const media = resolveShareMedia(post);
  const sent = [];
  let lastError = "";
  for (const friendId of friendIds) {
    try {
      await sendShareMessage({ user, friendId, post, media });
      sent.push(friendId);
    } catch (error) {
      lastError = error?.message || String(error || "");
    }
  }

  if (!sent.length) {
    return { ok: false, error: lastError || "Could not send right now. Try again." };
  }

  lastSentAt[cooldownKey(user.$id, post.$id)] = Date.now();
  incrementShareCount(post.$id).catch(() => {});
  const count = sent.length;
  return {
    ok: true,
    count,
    message:
      count === 1
        ? "Sent to your most active friend!"
        : `Sent to your ${count} most active friends!`,
  };
}
