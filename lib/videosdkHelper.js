/**
 * VideoSDK — fetch JWT from backend (Node / Appwrite Function). Never sign tokens in the app.
 */

import { VIDEOSDK_CONFIG } from "./config";

const TIMEOUT = {
  tokenMs: 20000,
  roomMs: 45000,
};

const RETRY = {
  roomAttempts: 2,
  roomDelayMs: 1200,
  tokenAttempts: 1,
  tokenDelayMs: 0,
};

const DEFAULT_METHOD = {
  room: "POST",
  roomAndToken: "POST",
  token: "GET",
};

function normalizeMethod(value, fallback) {
  const method = String(value || "").trim().toUpperCase();
  return method === "GET" || method === "POST" ? method : fallback;
}

function getRequestMethod(kind) {
  const cfg = VIDEOSDK_CONFIG?.requestMethod || {};
  return normalizeMethod(cfg?.[kind], DEFAULT_METHOD[kind]);
}

function isAppwriteHost(rawUrl) {
  try {
    const u = new URL(String(rawUrl || "").includes("://") ? rawUrl : `https://${rawUrl}`);
    return u.hostname === "appwrite.run" || u.hostname.endsWith(".appwrite.run");
  } catch (_) {
    return false;
  }
}

function parseJsonSafe(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return raw;
  }
}

function buildBaseUrl(baseUrl, path) {
  const base = String(baseUrl || "").trim().replace(/\/$/, "");
  if (!base) return "";
  const p = String(path || "").trim();
  if (!p) return base;
  return `${base}${p.startsWith("/") ? p : `/${p}`}`;
}

function buildUrl(baseUrl, path, query = {}) {
  const root = buildBaseUrl(baseUrl, path);
  if (!root) return "";
  const q = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value == null || value === "") return;
    q.set(key, String(value));
  });
  if (__DEV__) q.set("debug", "1");
  const qs = q.toString();
  return qs ? `${root}?${qs}` : root;
}

/** Decode JWT payload (no signature verify) — for client-side claim checks only. */
export function decodeJwtPayload(token) {
  try {
    const payloadPart = String(token || "").split(".")[1] || "";
    if (!payloadPart) return null;
    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "="
    );
    return JSON.parse(atob(padded));
  } catch (_) {
    return null;
  }
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

function validateTokenEndpointContract() {
  const tokenBase = String(VIDEOSDK_CONFIG.tokenServerUrl || "");
  const tokenPath = String(VIDEOSDK_CONFIG.tokenPath || "");
  const appwriteHost = isAppwriteHost(tokenBase);
  if (appwriteHost && tokenPath) {
    throw new Error(
      `Invalid token endpoint config: Appwrite token URL must use empty path, got tokenPath='${tokenPath}'.`
    );
  }
  if (!appwriteHost && tokenPath !== "/get-token") {
    throw new Error(
      `Invalid token endpoint config: non-Appwrite token URL must use '/get-token', got tokenPath='${tokenPath || "(empty)"}'.`
    );
  }
}

async function requestJsonWithRetry({
  url,
  method,
  timeoutMs,
  attempts,
  retryDelayMs,
  requestName,
}) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      const rawBody = await response.text();
      const data = parseJsonSafe(rawBody);

      if (!response.ok) {
        const detail =
          data?.message || data?.error || (typeof data === "string" ? data : JSON.stringify(data));
        const error = new Error(
          `${requestName} failed (${response.status})${detail ? `: ${detail}` : ""}`
        );
        error.status = response.status;
        throw error;
      }

      return data;
    } catch (error) {
      lastError = error;
      const isAbort = error?.name === "AbortError";
      if (__DEV__) {
        console.warn(`[VideoSDK] ${requestName} attempt failed`, {
          attempt,
          maxAttempts: attempts,
          url,
          reason: isAbort ? "timeout" : error?.message || String(error),
        });
      }
      if (attempt < attempts && retryDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    } finally {
      clearTimeout(t);
    }
  }
  throw lastError || new Error(`${requestName} failed`);
}

function requireRoomBaseUrl() {
  const roomServerUrl = VIDEOSDK_CONFIG.roomServerUrl || "";
  if (!roomServerUrl) {
    throw new Error("VideoSDK room URL is not configured. Set EXPO_PUBLIC_VIDEOSDK_ROOM_URL.");
  }
  return roomServerUrl;
}

function requireTokenBaseUrl() {
  const tokenServerUrl = VIDEOSDK_CONFIG.tokenServerUrl || "";
  if (!tokenServerUrl) {
    throw new Error(
      "VideoSDK token URL is not configured. Set EXPO_PUBLIC_VIDEOSDK_TOKEN_URL to your Appwrite Function or API base."
    );
  }
  return tokenServerUrl;
}

function buildRoomUrl(participantId) {
  return buildUrl(VIDEOSDK_CONFIG.roomServerUrl, VIDEOSDK_CONFIG.roomPath, { participantId });
}

function buildTokenUrl(roomId, participantId, extraQuery = {}) {
  return buildUrl(VIDEOSDK_CONFIG.tokenServerUrl, VIDEOSDK_CONFIG.tokenPath, {
    roomId,
    participantId,
    ...extraQuery,
  });
}

async function requestRoom(participantId) {
  const url = buildRoomUrl(participantId);
  if (!url) return null;
  const data = await requestJsonWithRetry({
    url,
    method: getRequestMethod("room"),
    timeoutMs: TIMEOUT.roomMs,
    attempts: RETRY.roomAttempts,
    retryDelayMs: RETRY.roomDelayMs,
    requestName: "Room creation",
  });
  return extractRoomId(data);
}

/**
 * Create a VideoSDK room and return its roomId.
 * This must happen before token generation for meeting-scoped JWTs.
 *
 * @returns {Promise<string>} roomId
 */
export async function createVideoSDKRoom() {
  const roomServerUrl = requireRoomBaseUrl();
  try {
    const backendRoomId = await requestRoom();
    if (backendRoomId) return backendRoomId;
    throw new Error(`Room endpoint did not return roomId. URL: ${buildRoomUrl() || roomServerUrl}`);
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new Error(
        `Room creation timed out after ${Math.round(
          TIMEOUT.roomMs / 1000
        )}s (retried ${RETRY.roomAttempts}x). Check Appwrite function cold start, execution logs, and network.`
      );
    }
    throw new Error(`Backend room creation failed (${buildRoomUrl() || roomServerUrl}): ${e?.message || String(e)}`);
  }
}

/**
 * Create a room and host token from a single backend request.
 *
 * @param {string} [participantId]
 * @returns {Promise<{ meetingId: string, token: string, debug?: object }>}
 */
export async function createVideoSDKRoomAndToken(participantId) {
  const roomServerUrl = requireRoomBaseUrl();
  const url = buildRoomUrl(participantId);
  try {
    const data = await requestJsonWithRetry({
      method: getRequestMethod("roomAndToken"),
      url,
      timeoutMs: TIMEOUT.roomMs,
      attempts: RETRY.roomAttempts,
      retryDelayMs: RETRY.roomDelayMs,
      requestName: "Room+token request",
    });
    const meetingId = extractRoomId(data?.meetingId || data?.roomId || data?.id || data);
    let token = typeof data?.token === "string" ? data.token : "";
    // Node `/create-room` returns only roomId — fetch a scoped JWT separately.
    if (meetingId && !token) {
      token = await getVideoSDKToken(meetingId, participantId);
    }
    if (!meetingId || !token) {
      throw new Error("Room+token endpoint did not return both { meetingId, token }.");
    }
    return {
      meetingId,
      token,
      debug: data?.debug,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(
        `Room+token request timed out after ${Math.round(
          TIMEOUT.roomMs / 1000
        )}s. Check Appwrite function cold start, execution logs, and network.`
      );
    }
    throw new Error(`Backend room+token failed (${buildRoomUrl() || roomServerUrl}): ${error?.message || String(error)}`);
  }
}

/**
 * @param {string} roomId - VideoSDK roomId returned by POST /v2/rooms
 * @param {string} [participantId] - Optional; Appwrite user id for scoped JWT
 * @param {{ purpose?: 'viewer' | 'call' }} [options] - `viewer` = allow_join only (live HLS); default = RTC join
 * @returns {Promise<string>} JWT string
 */
export async function getVideoSDKToken(roomId, participantId, options = {}) {
  requireTokenBaseUrl();
  validateTokenEndpointContract();

  if (!roomId || String(roomId).trim() === "") {
    throw new Error("VideoSDK: roomId is required to fetch a room-scoped token.");
  }

  const extraQuery = {};
  if (options?.purpose === "viewer") extraQuery.purpose = "viewer";

  const url = buildTokenUrl(roomId, participantId, extraQuery);
  if (__DEV__) {
    console.log("[VideoSDK] token request", {
      roomId: String(roomId),
      participantId: participantId || null,
      url,
    });
  }

  try {
    const data = await requestJsonWithRetry({
      url,
      method: getRequestMethod("token"),
      timeoutMs: TIMEOUT.tokenMs,
      attempts: RETRY.tokenAttempts,
      retryDelayMs: RETRY.tokenDelayMs,
      requestName: "Token request",
    });
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
      if (d.requestedRoomId && String(d.requestedRoomId) !== String(roomId)) {
        throw new Error(
          `Token request mismatch: sent roomId=${roomId}, backend saw roomId=${d.requestedRoomId}.`
        );
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
    if (String(error?.message || "").includes("failed (405)")) {
      throw new Error(
        `Token request failed (405): Method not allowed at ${url}. Verify EXPO_PUBLIC_VIDEOSDK_TOKEN_URL/EXPO_PUBLIC_VIDEOSDK_TOKEN_PATH point to the token endpoint (Appwrite: empty path, Node: /get-token).`
      );
    }
    console.error("Error fetching VideoSDK token:", error);
    throw error;
  }
}
