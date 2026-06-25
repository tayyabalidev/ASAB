import * as Linking from "expo-linking";
import Constants from "expo-constants";

import { account, appwriteConfig, checkNetworkConnectivity } from "./appwrite";

/** Deep-link opened after the HTTPS bridge redirects back to the app. */
export const PASSWORD_RECOVERY_DEEP_LINK_PATH = "reset-password";

/** Minimum password length enforced before calling Appwrite. */
export const PASSWORD_MIN_LENGTH = 8;

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function readPasswordRecoveryHttpsUrl() {
  const fromEnv =
    typeof process !== "undefined" && process.env?.EXPO_PUBLIC_PASSWORD_RECOVERY_REDIRECT_URL
      ? String(process.env.EXPO_PUBLIC_PASSWORD_RECOVERY_REDIRECT_URL).trim()
      : "";
  const fromExtra = Constants.expoConfig?.extra?.passwordRecoveryRedirectUrl;
  const raw = (fromEnv || (typeof fromExtra === "string" ? fromExtra : "")).trim();
  return raw.replace(/\/$/, "");
}

/**
 * HTTPS URL passed to Appwrite `createRecovery`.
 * Must be a deployed Appwrite Function (or your website) registered as a Web platform.
 *
 * Example: https://67abc123.appwrite.global
 *
 * Appwrite does NOT accept custom schemes (com.bilal.asab://) for recovery emails.
 */
export function getPasswordRecoveryRedirectUrl() {
  const httpsUrl = readPasswordRecoveryHttpsUrl();
  if (!httpsUrl) {
    throw new Error("RECOVERY_REDIRECT_NOT_CONFIGURED");
  }
  if (!/^https:\/\//i.test(httpsUrl)) {
    throw new Error("RECOVERY_REDIRECT_HTTPS_REQUIRED");
  }
  return httpsUrl;
}

/** Deep link the app opens after the user taps the email link. */
export function getPasswordRecoveryDeepLink() {
  return `${appwriteConfig.platform}://${PASSWORD_RECOVERY_DEEP_LINK_PATH}`;
}

/** Validates email format before any network request. */
export function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  return EMAIL_REGEX.test(email.trim());
}

/**
 * Returns null when valid, otherwise a translation key under `auth.*`.
 */
export function getPasswordValidationError(password) {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return "auth.passwordTooShort";
  }
  if (!/[A-Z]/.test(password)) {
    return "auth.passwordNeedsUppercase";
  }
  if (!/[a-z]/.test(password)) {
    return "auth.passwordNeedsLowercase";
  }
  if (!/[0-9]/.test(password)) {
    return "auth.passwordNeedsNumber";
  }
  return null;
}

/** Maps Appwrite / network errors to user-friendly messages (translation keys). */
export function mapRecoveryError(error) {
  const message = (error?.message || error?.toString() || "").toLowerCase();

  if (
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("timeout") ||
    message.includes("failed to connect")
  ) {
    return "auth.recoveryNetworkError";
  }
  if (message.includes("rate limit") || message.includes("too many")) {
    return "auth.recoveryRateLimit";
  }
  if (message.includes("user_not_found") || message.includes("user not found")) {
    return "auth.recoveryUserNotFound";
  }
  if (
    message.includes("invalid_token") ||
    message.includes("invalid secret") ||
    message.includes("expired") ||
    message.includes("invalid url")
  ) {
    return "auth.recoveryLinkInvalid";
  }
  if (message.includes("redirect") || message.includes("hostname") || message.includes("invalid uri")) {
    return "auth.recoveryRedirectNotAllowed";
  }
  if (message.includes("password") && message.includes("short")) {
    return "auth.passwordTooShort";
  }

  return error?.message || "auth.recoveryGenericError";
}

/**
 * Parses `userId` and `secret` from an Appwrite recovery deep link.
 * Supports both custom-scheme URLs and universal-link style paths.
 */
export function parseRecoveryDeepLink(url) {
  if (!url) return { userId: null, secret: null };

  try {
    const parsed = Linking.parse(url);
    const query = parsed.queryParams || {};

    const userId =
      query.userId ||
      query.userid ||
      query["userId"] ||
      null;
    const secret =
      query.secret ||
      query["secret"] ||
      null;

    return {
      userId: userId ? String(userId) : null,
      secret: secret ? String(secret) : null,
    };
  } catch {
    // Fallback: manual query-string extraction
    const match = url.match(/[?&]userId=([^&]+)/i);
    const secretMatch = url.match(/[?&]secret=([^&]+)/i);
    return {
      userId: match ? decodeURIComponent(match[1]) : null,
      secret: secretMatch ? decodeURIComponent(secretMatch[1]) : null,
    };
  }
}

/** Returns true when the URL is a password-recovery deep link for this app. */
export function isPasswordRecoveryDeepLink(url) {
  if (!url) return false;
  const normalized = url.toLowerCase();
  const scheme = appwriteConfig.platform.toLowerCase();
  return (
    normalized.includes(`${scheme}://`) &&
    (normalized.includes("reset-password") || normalized.includes("recovery"))
  );
}

/** True when the HTTPS recovery bridge URL is configured for this build. */
export function isPasswordRecoveryConfigured() {
  try {
    getPasswordRecoveryRedirectUrl();
    return true;
  } catch {
    return false;
  }
}

/**
 * Sends a password-recovery email via Appwrite.
 * Duplicate submissions should be prevented by the caller (loading state).
 */
export async function requestPasswordRecovery(email) {
  const trimmedEmail = email.trim();

  if (!isValidEmail(trimmedEmail)) {
    throw new Error("INVALID_EMAIL");
  }

  const isOnline = await checkNetworkConnectivity();
  if (!isOnline) {
    throw new Error("NETWORK_OFFLINE");
  }

  try {
    await account.createRecovery({
      email: trimmedEmail,
      url: getPasswordRecoveryRedirectUrl(),
    });
  } catch (error) {
    if (error.message && error.message.includes("readonly")) {
      throw new Error("READONLY_MODE");
    }
    throw error;
  }
}

/**
 * Completes password recovery using the `userId` and `secret` from the email link.
 */
export async function completePasswordRecovery(userId, secret, newPassword) {
  if (!userId || !secret) {
    throw new Error("MISSING_RECOVERY_PARAMS");
  }

  const validationKey = getPasswordValidationError(newPassword);
  if (validationKey) {
    throw new Error(validationKey);
  }

  const isOnline = await checkNetworkConnectivity();
  if (!isOnline) {
    throw new Error("NETWORK_OFFLINE");
  }

  try {
    await account.updateRecovery({
      userId,
      secret,
      password: newPassword,
    });
  } catch (error) {
    if (error.message && error.message.includes("readonly")) {
      throw new Error("READONLY_MODE");
    }
    throw error;
  }
}
