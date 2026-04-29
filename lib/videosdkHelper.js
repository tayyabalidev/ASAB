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
  if (!baseUrl) return "";
  if (!path) return baseUrl;
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function extractRoomId(value) {
  if (!value) return "";

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    // Some backends may return plain text roomId instead of JSON.
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return trimmed;
    try {
      return extractRoomId(JSON.parse(trimmed));
    } catch (_) {
      return "";
    }
  }

  if (typeof value !== "object") return "";

  const direct =
    value?.roomId ||
    value?.room_id ||
    value?.id ||
    value?.meetingId ||
    value?.meeting_id ||
    "";
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const nestedCandidates = [
    value?.data,
    value?.result,
    value?.response,
    value?.payload,
    value?.body,
  ];
  for (const candidate of nestedCandidates) {
    const nested = extractRoomId(candidate);
    if (nested) return nested;
  }

  return "";
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
    const rawBody = await response.text();
    let data = null;
    try {
      data = rawBody ? JSON.parse(rawBody) : null;
    } catch (_) {
      data = rawBody;
    }
    const roomId = extractRoomId(data);
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
  if (roomServerUrl) {
    try {
      const backendRoomId = await createRoomViaBackend();
      if (backendRoomId) return backendRoomId;
      throw new Error(
        `Room endpoint did not return roomId. URL: ${buildRoomRequestUrl() || roomServerUrl}`
      );
    } catch (e) {
      // If app explicitly configured a room endpoint, do not silently fall back to direct API.
      throw new Error(
        `Backend room creation failed (${buildRoomRequestUrl() || roomServerUrl}): ${
          e?.message || String(e)
        }`
      );
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

    const rawBody = await response.text();
    let data = null;
    try {
      data = rawBody ? JSON.parse(rawBody) : null;
    } catch (_) {
      data = rawBody;
    }
    const roomId = extractRoomId(data);
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
    if (data?.debug && typeof data.debug === "object") {
      const d = data.debug;
      if (__DEV__) {
        console.log("[VideoSDK][token-debug]", {
          requestedRoomId: d.requestedRoomId || null,
          tokenRoomId: d.tokenRoomId || null,
          tokenApiKey: d.tokenApiKey || null,
          tokenPermissions: Array.isArray(d.tokenPermissions) ? d.tokenPermissions : [],
        });
      }
      if (d.tokenRoomId && String(d.tokenRoomId) !== String(roomId)) {
        throw new Error(
          `Token room mismatch: requested roomId=${roomId}, token roomId=${d.tokenRoomId}.`
        );
      }
      if (
        Array.isArray(d.tokenPermissions) &&
        d.tokenPermissions.length > 0 &&
        !d.tokenPermissions.includes("allow_mod")
      ) {
        console.warn(
          "[VideoSDK] Token debug indicates missing allow_mod; host may fail to start HLS."
        );
      }
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
