/**
 * VideoSDK — fetch JWT from backend (Node / Appwrite Function). Never sign tokens in the app.
 */

import { VIDEOSDK_CONFIG } from "./config";

const TOKEN_FETCH_TIMEOUT_MS = 20000;

function buildTokenRequestUrl(meetingId, participantId) {
  const baseUrl = VIDEOSDK_CONFIG.tokenServerUrl.replace(/\/$/, "");
  const path = VIDEOSDK_CONFIG.tokenPath || "";
  const q = new URLSearchParams({ meetingId: String(meetingId || "") });
  if (participantId) q.set("participantId", String(participantId));
  const qs = q.toString();
  if (!path) {
    return `${baseUrl}?${qs}`;
  }
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}?${qs}`;
}

/**
 * @param {string} meetingId - Same string both peers use (e.g. Appwrite call channelName)
 * @param {string} [participantId] - Optional; Appwrite user id for scoped JWT
 * @returns {Promise<string>} JWT string
 */
export async function getVideoSDKToken(meetingId, participantId) {
  if (!VIDEOSDK_CONFIG.tokenServerUrl) {
    const msg =
      "VideoSDK token URL is not configured. Set EXPO_PUBLIC_VIDEOSDK_TOKEN_URL to your Appwrite Function or API base.";
    if (__DEV__) {
      console.warn("[VideoSDK]", msg);
      return null;
    }
    throw new Error(msg);
  }

  if (!VIDEOSDK_CONFIG.tokenServerUrl) {
    const msg =
      "VideoSDK token URL is not configured. Set EXPO_PUBLIC_VIDEOSDK_TOKEN_URL to your Appwrite Function or API base.";
    if (__DEV__) {
      console.warn("[VideoSDK]", msg);
      return null;
    }
    throw new Error(msg);
  }

  if (!meetingId || String(meetingId).trim() === "") {
    throw new Error("VideoSDK: meetingId is required to fetch a room-scoped token.");
  }

  const url = buildTokenRequestUrl(meetingId, participantId);
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
