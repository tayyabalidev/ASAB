import * as FileSystem from "expo-file-system/legacy";

import { account, functions } from "./appwrite";
import {
  createMuxVideoPostDocument,
  deleteVideoPost,
  getVideoById,
} from "./appwrite";
import {
  getMuxDirectUploadFunctionId,
  getMuxDirectUploadHttpUrl,
  getProcessingServerOrigin,
} from "./muxConfig";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const UPLOAD_URL_SCORE = (u) => {
  if (!u || typeof u !== "string") return 0;
  const s = u.toLowerCase();
  if (/googleapis\.com|storage\.googleapis|upload\.video/.test(s)) return 3;
  if (/\/upload|direct.?upload/i.test(s)) return 2;
  if (/^https?:\/\//.test(u.trim())) return 1;
  return 0;
};

/**
 * Mux direct-upload responses vary: Express { uploadUrl }, Mux API { data: { url } },
 * Appwrite Functions (string/double JSON, nested body).
 */
function extractMuxUploadUrlFromResponse(raw) {
  const collected = [];

  const pushIfUrl = (v) => {
    if (typeof v !== "string") return;
    const t = v.trim();
    if (/^https?:\/\//i.test(t)) collected.push(t);
  };

  const visit = (node, depth) => {
    if (node == null || depth > 12) return;
    if (typeof node === "string") {
      pushIfUrl(node);
      const t = node.trim();
      if (
        (t.startsWith("{") && t.includes("}")) ||
        (t.startsWith("[") && t.includes("]"))
      ) {
        try {
          visit(JSON.parse(t), depth + 1);
        } catch {
          /* ignore */
        }
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((x) => visit(x, depth + 1));
      return;
    }
    if (typeof node !== "object") return;

    const preferKeys = [
      "uploadUrl",
      "url",
      "upload_url",
      "target",
      "signedUrl",
      "href",
      "uploadURL",
      "UploadUrl",
    ];
    for (const k of preferKeys) {
      if (Object.prototype.hasOwnProperty.call(node, k)) {
        pushIfUrl(node[k]);
      }
    }
    for (const [k, v] of Object.entries(node)) {
      const kl = k.toLowerCase();
      if (
        typeof v === "string" &&
        ((kl.includes("upload") && kl.includes("url")) || kl === "target")
      ) {
        pushIfUrl(v);
      }
    }

    const nested = node.data;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      pushIfUrl(nested.url);
      pushIfUrl(nested.uploadUrl);
      pushIfUrl(nested.upload_url);
    }
    if (node.direct_upload && typeof node.direct_upload === "object") {
      pushIfUrl(node.direct_upload.url);
    }

    for (const v of Object.values(node)) {
      if (v && (typeof v === "object" || typeof v === "string")) {
        visit(v, depth + 1);
      }
    }
  };

  let root = raw;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (/^https?:\/\//i.test(t) && UPLOAD_URL_SCORE(t) >= 1) return t;
    try {
      root = JSON.parse(t);
    } catch {
      return null;
    }
  }

  visit(root, 0);
  if (!collected.length) return null;
  collected.sort((a, b) => UPLOAD_URL_SCORE(b) - UPLOAD_URL_SCORE(a));
  return collected[0];
}

function responsePreview(text, max = 500) {
  if (text == null) return "";
  const s = String(text).replace(/\s+/g, " ").trim();
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

/** Appwrite Execution uses `errors` / `logs`, not stderr; client may omit logs without API key. */
function describeFailedMuxExecution(result) {
  const errors = String(result?.errors ?? "").trim();
  const logs = String(result?.logs ?? "").trim();
  const body = String(result?.responseBody ?? "").trim();
  const code = result?.responseStatusCode;
  const parts = [];

  if (errors) parts.push(errors);
  if (logs) parts.push(logs);
  if (body && !/^failed$/i.test(body)) parts.push(body);
  else if (body && !errors && !logs) parts.push(body);

  if (typeof code === "number" && code !== 0 && code >= 400) {
    parts.push(`HTTP status from function: ${code}`);
  }

  let text = parts.filter(Boolean).join("\n---\n").trim();
  if (!text) {
    text = `execution status: ${result?.status || "unknown"}`;
  }
  if (text.length > 2500) {
    text = `${text.slice(0, 2500)}…`;
  }

  if (!errors && !logs) {
    text += `\n\nTip: Logged-in clients often get empty errors/logs from the SDK. Open Appwrite Console → your Mux direct-upload function → Executions → failed run for the full stack trace. Typical causes: missing MUX_TOKEN_ID/SECRET in the function, wrong Appwrite API key scope, or documentId/creator check failing.`;
  }
  return text;
}

async function pollExecutionUntilTerminal(functionId, executionId, options = {}) {
  const maxAttempts = options.maxAttempts ?? 120;
  const intervalMs = options.intervalMs ?? 1000;
  let result = await functions.getExecution(functionId, executionId);
  for (let i = 0; i < maxAttempts; i++) {
    if (result.status === "completed" || result.status === "failed") {
      return result;
    }
    if (result.status !== "waiting" && result.status !== "processing") {
      return result;
    }
    await sleep(intervalMs);
    result = await functions.getExecution(functionId, executionId);
  }
  throw new Error("Mux direct upload Appwrite function timed out.");
}

async function requestMuxDirectUploadUrlAppwrite(documentId, functionId) {
  const execution = await functions.createExecution({
    functionId,
    body: JSON.stringify({ documentId, document_id: documentId }),
    async: false,
    method: "POST",
  });
  if (!execution?.$id) {
    throw new Error("Mux direct upload: no execution id from Appwrite.");
  }
  const result = await pollExecutionUntilTerminal(functionId, execution.$id);
  const httpCode = result.responseStatusCode;
  const httpError =
    typeof httpCode === "number" && httpCode >= 400;
  if (result.status !== "completed" || httpError) {
    throw new Error(
      `Mux direct upload failed:\n${describeFailedMuxExecution(result)}`
    );
  }
  const uploadUrl = extractMuxUploadUrlFromResponse(result.responseBody);
  if (!uploadUrl) {
    const prev = responsePreview(
      typeof result.responseBody === "string"
        ? result.responseBody
        : JSON.stringify(result.responseBody)
    );
    throw new Error(
      `Mux function completed but no upload URL was found in the response. Preview: ${prev || "(empty)"}. ` +
        `Return JSON your app can parse (e.g. { "uploadUrl": "https://..." } or Mux { "data": { "url": "..." } }). ` +
        `Use the direct-upload function id, not the Mux webhook function.`
    );
  }
  return uploadUrl;
}

/** POST JSON { documentId } with X-Appwrite-JWT — full URL (Express or Appwrite Function HTTP). */
async function requestMuxDirectUploadUrlHttp(documentId, postUrl) {
  const jwt = await account.createJWT();
  const token = jwt?.jwt || jwt;
  if (!token) {
    throw new Error("Could not create session token for upload.");
  }

  const res = await fetch(postUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Appwrite-JWT": token,
    },
    body: JSON.stringify({ documentId }),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  if (!res.ok) {
    const errBody =
      json && typeof json === "object"
        ? json.error || json.message || JSON.stringify(json)
        : text;
    throw new Error(
      `Mux direct-upload HTTP ${res.status}: ${errBody || "request failed"}`
    );
  }

  const uploadUrl = extractMuxUploadUrlFromResponse(json ?? text);
  if (!uploadUrl) {
    const appwriteHint = /appwrite\.run/i.test(postUrl)
      ? " *.appwrite.run is usually an Appwrite Function, not Node /api/mux. Create a separate Mux *direct upload* function, set EXPO_PUBLIC_MUX_DIRECT_UPLOAD_FUNCTION_ID to its id, or set EXPO_PUBLIC_MUX_DIRECT_UPLOAD_URL to that function’s full POST URL from the console."
      : "";
    throw new Error(
      `Did not find an upload URL in the response.${appwriteHint} Preview: ${responsePreview(text) || "(empty)"}`
    );
  }
  return uploadUrl;
}

/**
 * Create Appwrite post → Mux direct upload URL (Appwrite execution, optional HTTP URL, or Express) → PUT file → poll DB until HLS ready.
 */
export async function publishVideoWithMux(form, processedVideoFile) {
  const functionId = getMuxDirectUploadFunctionId();
  const explicitHttpUrl = getMuxDirectUploadHttpUrl();
  const base = getProcessingServerOrigin();

  const post = await createMuxVideoPostDocument(form);

  try {
    let uploadUrl;
    if (functionId) {
      try {
        uploadUrl = await requestMuxDirectUploadUrlAppwrite(post.$id, functionId);
      } catch (e) {
        const msg = String(e?.message || e || "");
        // Some function deployments return completed execution with empty responseBody.
        // If caller provided a direct function URL, retry via HTTP to read JSON directly.
        if (
          explicitHttpUrl &&
          /no upload URL was found|Preview: \(empty\)/i.test(msg)
        ) {
          uploadUrl = await requestMuxDirectUploadUrlHttp(post.$id, explicitHttpUrl);
        } else {
          throw e;
        }
      }
    } else if (explicitHttpUrl) {
      uploadUrl = await requestMuxDirectUploadUrlHttp(post.$id, explicitHttpUrl);
    } else if (base) {
      const path = `${base.replace(/\/$/, "")}/api/mux/direct-upload`;
      uploadUrl = await requestMuxDirectUploadUrlHttp(post.$id, path);
    } else {
      throw new Error(
        "Set EXPO_PUBLIC_MUX_DIRECT_UPLOAD_FUNCTION_ID, or EXPO_PUBLIC_MUX_DIRECT_UPLOAD_URL, or EXPO_PUBLIC_PROCESSING_SERVER_URL (Node server with /api/mux/direct-upload)."
      );
    }

    const mime =
      processedVideoFile?.type ||
      processedVideoFile?.mimeType ||
      "video/mp4";

    const uploadResult = await FileSystem.uploadAsync(
      uploadUrl,
      processedVideoFile.uri,
      {
        httpMethod: "PUT",
        headers: {
          "Content-Type": mime,
        },
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      }
    );

    if (uploadResult.status < 200 || uploadResult.status >= 300) {
      throw new Error(
        `Mux upload failed: HTTP ${uploadResult.status} ${uploadResult.body || ""}`
      );
    }
  } catch (err) {
    try {
      if (post?.$id) {
        await deleteVideoPost(post.$id);
      }
    } catch {
      /* best-effort */
    }
    throw err;
  }

  return waitForMuxVideoReady(post.$id);
}

export async function waitForMuxVideoReady(
  documentId,
  { maxAttempts = 60, intervalMs = 3000 } = {}
) {
  let lastDoc = null;
  for (let i = 0; i < maxAttempts; i++) {
    const doc = await getVideoById(documentId);
    lastDoc = doc;
    const v = doc?.video;
    const status = doc?.mux_status || doc?.muxStatus || doc?.status;
    const playbackId = doc?.mux_playback_id || doc?.muxPlaybackId || doc?.playbackId;

    if (status === "error") {
      throw new Error("Video processing failed. Try uploading again.");
    }
    if (
      typeof v === "string" &&
      v.includes("stream.mux.com") &&
      v.endsWith(".m3u8")
    ) {
      return doc;
    }
    if (status === "ready" && typeof playbackId === "string" && playbackId.trim()) {
      return doc;
    }
    if (status === "ready" && typeof v === "string" && v.startsWith("http")) {
      return doc;
    }
    await sleep(intervalMs);
  }
  // Don't fail publish when upload already succeeded; let feed keep showing "Processing".
  // Webhook update can arrive after this local wait window.
  return {
    ...(lastDoc || {}),
    $id: documentId,
    mux_status: (lastDoc?.mux_status || lastDoc?.muxStatus || "processing"),
    _muxWaitTimedOut: true,
  };
}
