/**
 * Resolve playback URL for a video post (Mux HLS vs legacy Appwrite / other URLs).
 */

import { isMuxPendingVideoUrl } from "./muxConfig";

const MUX_STREAM = "https://stream.mux.com";

export function getMuxHlsUrl(playbackId) {
  if (!playbackId || typeof playbackId !== "string") return null;
  return `${MUX_STREAM}/${playbackId.trim()}.m3u8`;
}

export function isMuxProcessingPost(post) {
  return isMuxPendingVideoUrl(post?.video);
}

/** Primary stream URI for expo-av (HLS adaptive) or legacy progressive URL. */
export function getPlaybackUriForPost(post) {
  if (!post) return null;
  const pid = post.mux_playback_id || post.muxPlaybackId || post.playbackId;
  if (pid) {
    return getMuxHlsUrl(pid);
  }
  const v = post.video;
  if (v == null || typeof v !== "string") return null;
  if (isMuxPendingVideoUrl(v)) return null;
  return v;
}

export function getThumbnailUriForPost(post) {
  if (!post) return null;
  const pid = post.mux_playback_id || post.muxPlaybackId || post.playbackId;
  if (pid) {
    return `https://image.mux.com/${pid}/thumbnail.jpg?time=1&width=720`;
  }
  return post.thumbnail || null;
}
