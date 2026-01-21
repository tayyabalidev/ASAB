/**
 * Admin gating utilities
 *
 * Configure admins via env:
 * EXPO_PUBLIC_ADMIN_EMAILS=email1@example.com,email2@example.com
 */

export function getAdminEmails() {
  const raw = process.env.EXPO_PUBLIC_ADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminUser(user) {
  const email = (user?.email || "").trim().toLowerCase();
  if (!email) return false;
  const allowlist = getAdminEmails();
  return allowlist.includes(email);
}

