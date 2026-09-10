export const MAX_PHOTO_SLIDES = 10;

function parseEditsObject(edits) {
  if (!edits) return null;
  if (typeof edits === "object") return edits;
  if (typeof edits !== "string") return null;
  try {
    const parsed = JSON.parse(edits);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_) {
    return null;
  }
}

function pushPhotoField(target, value) {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach((item) => pushPhotoField(target, item));
    return;
  }
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (!trimmed) return;
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        parsed.forEach((item) => pushPhotoField(target, item));
        return;
      }
    } catch (_) {
      // treat as a single field
    }
  }
  if (trimmed.includes(",") && !trimmed.startsWith("http")) {
    trimmed.split(",").forEach((part) => pushPhotoField(target, part));
    return;
  }
  target.push(trimmed);
}

function isDisplayPhotoUri(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return (
    /^https?:\/\//i.test(trimmed) ||
    trimmed.includes("/files/") ||
    trimmed.startsWith("file:") ||
    trimmed.startsWith("content:")
  );
}

/** Extra slide fields stored on a raw photo document (`edits.p` / `photos`). */
export function extractExtraPhotoRaw(post) {
  if (!post) return [];
  const extras = [];
  const edits = parseEditsObject(post.edits);
  if (edits) {
    pushPhotoField(extras, edits.p);
    pushPhotoField(extras, edits.photos);
  }
  if (typeof post.photos === "string") {
    pushPhotoField(extras, post.photos);
  } else if (Array.isArray(post.photos)) {
    pushPhotoField(extras, post.photos);
  }
  return extras;
}

export function mergeExtraPhotoIdsIntoEdits(edits, extraIds) {
  const obj = parseEditsObject(edits) || {};
  obj.p = extraIds;
  return JSON.stringify(obj);
}

/** Display URLs for a photo post, including extra slides. */
export function getSlidePhotoUris(post) {
  if (!post) return [];
  const merged = [];
  const seen = new Set();
  const push = (value) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    merged.push(trimmed);
  };

  if (Array.isArray(post.photos)) {
    post.photos.forEach(push);
  }
  if (typeof post.photo === "string") {
    push(post.photo);
  }
  extractExtraPhotoRaw(post)
    .filter(isDisplayPhotoUri)
    .forEach(push);

  return merged;
}
