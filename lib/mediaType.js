// Utility helpers for reliably determining media kind from a URL/filename.
// We prefer URL inference because some records may have an incorrect persisted `type`.

export const normalizeMediaUrl = (url) => {
  if (!url || typeof url !== "string") return "";
  return url.split("?")[0].split("#")[0].trim().toLowerCase();
};

export const inferMediaKindFromUrl = (url) => {
  const u = normalizeMediaUrl(url);
  if (!u) return null;

  // Video extensions
  if (/\.(mp4|mov|m4v|webm|mkv|3gp)$/i.test(u)) return "video";

  // Image extensions
  if (/\.(jpg|jpeg|png|gif|webp|heic|heif|bmp)$/i.test(u)) return "image";

  return null;
};

export const isVideoUrl = (url) => inferMediaKindFromUrl(url) === "video";
export const isImageUrl = (url) => inferMediaKindFromUrl(url) === "image";

// Some backends (e.g. Appwrite "view" URLs) don't include a file extension.
// In those cases, allow a trusted hint (like postType) to decide.
export const isVideoMedia = (url, hint) => {
  if (!url) return false;
  if (hint === "photo" || hint === "image") return false;
  if (hint === "video") return true;
  return isVideoUrl(url);
};

export const isImageMedia = (url, hint) => {
  if (!url) return false;
  if (hint === "photo" || hint === "image") return true;
  if (hint === "video") return false;
  return isImageUrl(url);
};

