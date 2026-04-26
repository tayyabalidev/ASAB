/**
 * VideoSDK — fetch JWT from backend (Node / Appwrite Function). Never sign tokens in the app.
 */

import { VIDEOSDK_CONFIG } from "./config";

const TOKEN_FETCH_TIMEOUT_MS = 20000;
const ROOM_CREATE_TIMEOUT_MS = 20000;
const VIDEOSDK_ROOMS_URL = "https://api.videosdk.live/v2/rooms";

function isAppwriteHost(baseUrl) {
  try {
    const u = new URL(baseUrl.includes("://") ? baseUrl : `https://${baseUrl}`);
    return u.hostname === "appwrite.run" || u.hostname.endsWith(".appwrite.run");
  } catch (_) {
    return false;
  }
}

function buildTokenRequestUrl(roomId, participantId) {
  const baseUrl = VIDEOSDK_CONFIG.tokenServerUrl.replace(/\/$/, "");
  const path = VIDEOSDK_CONFIG.tokenPath || "";
  const q = new URLSearchParams({ roomId: String(roomId || "") });
  if (participantId) q.set("participantId", String(participantId));
  const qs = q.toString();
  if (!path) {
    return `${baseUrl}?${qs}`;
  }
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}?${qs}`;
}

function buildRoomRequestUrl() {
  const baseUrl = (VIDEOSDK_CONFIG.roomServerUrl || "").replace(/\/$/, "");
  const path = VIDEOSDK_CONFIG.roomPath || "";
  if (!baseUrl || !path) return "";
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

async function createRoomViaBackend() {
  const url = buildRoomRequestUrl();
  if (!url) return null;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ROOM_CREATE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      let detail = "";
      try {
        const errBody = await response.json();
        detail = errBody?.message || errBody?.error || JSON.stringify(errBody);
      } catch (_) {
        try {
          detail = await response.text();
        } catch (_) {}
      }
      throw new Error(
        `Backend room creation failed (${response.status})${detail ? `: ${detail}` : ""}`
      );
    }
    const data = await response.json();
    const roomId = data?.roomId || data?.room_id || data?.id || "";
    return typeof roomId === "string" && roomId ? roomId : null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Create a VideoSDK room and return its roomId.
 * This must happen before token generation for meeting-scoped JWTs.
 *
 * @returns {Promise<string>} roomId
 */
export async function createVideoSDKRoom() {
  const roomServerUrl = VIDEOSDK_CONFIG.roomServerUrl || "";
  // Preferred: create room on backend using server env (VIDEOSDK_AUTH_TOKEN/VIDEOSDK_API_KEY).
  if (roomServerUrl && !isAppwriteHost(roomServerUrl)) {
    try {
      const backendRoomId = await createRoomViaBackend();
      if (backendRoomId) return backendRoomId;
    } catch (e) {
      console.warn("[VideoSDK] Backend room creation failed; attempting direct API fallback.", e?.message || e);
    }
  }

  if (!VIDEOSDK_CONFIG.apiKey) {
    throw new Error("VideoSDK room creation failed. Set backend /create-room or EXPO_PUBLIC_VIDEOSDK_API_KEY.");
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ROOM_CREATE_TIMEOUT_MS);

  try {
    const response = await fetch(VIDEOSDK_ROOMS_URL, {
      method: "POST",
      headers: {
        Authorization: VIDEOSDK_CONFIG.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
      signal: controller.signal,
    });

    if (!response.ok) {
      let detail = "";
      try {
        const errBody = await response.json();
        detail = errBody?.message || errBody?.error || JSON.stringify(errBody);
      } catch (_) {
        try {
          detail = await response.text();
        } catch (_) {}
      }
      if (response.status === 401) {
        throw new Error(
          "Room creation unauthorized (401). Prefer backend room creation by setting EXPO_PUBLIC_VIDEOSDK_ROOM_URL to your Node server and ensure VIDEOSDK_AUTH_TOKEN is valid."
        );
      }
      throw new Error(
        `Room creation failed (${response.status})${detail ? `: ${detail}` : ""}`
      );
    }

    const data = await response.json();
    const roomId = data?.roomId || data?.room_id || data?.id || "";
    if (!roomId || typeof roomId !== "string") {
      throw new Error("VideoSDK room API did not return roomId.");
    }
    return roomId;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Room creation timed out. Check network and VideoSDK credentials.");
    }
    console.error("Error creating VideoSDK room:", error);
    throw error;
  } finally {
    clearTimeout(t);
  }
}

/**
 * @param {string} roomId - VideoSDK roomId returned by POST /v2/rooms
 * @param {string} [participantId] - Optional; Appwrite user id for scoped JWT
 * @returns {Promise<string>} JWT string
 */
export async function getVideoSDKToken(roomId, participantId) {
  if (!VIDEOSDK_CONFIG.tokenServerUrl) {
    const msg =
      "VideoSDK token URL is not configured. Set EXPO_PUBLIC_VIDEOSDK_TOKEN_URL to your Appwrite Function or API base.";
    console.warn("[VideoSDK]", msg);
    return null;
  }

  if (!roomId || String(roomId).trim() === "") {
    throw new Error("VideoSDK: roomId is required to fetch a room-scoped token.");
  }

  const url = buildTokenRequestUrl(roomId, participantId);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TOKEN_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      let detail = "";
      try {
        const errBody = await response.json();
        detail = errBody?.message || errBody?.error || JSON.stringify(errBody);
      } catch (_) {
        try {
          detail = await response.text();
        } catch (_) {}
      }
      throw new Error(
        `Token request failed (${response.status})${detail ? `: ${detail}` : ""}`
      );
    }

    const data = await response.json();
    if (!data?.token || typeof data.token !== "string") {
      throw new Error("Token server did not return a string { token }.");
    }
    return data.token;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Token request timed out. Check EXPO_PUBLIC_VIDEOSDK_TOKEN_URL and network.");
    }
    console.error("Error fetching VideoSDK token:", error);
    throw error;
  } finally {
    clearTimeout(t);
  }
}
