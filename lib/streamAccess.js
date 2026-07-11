import { Query } from "react-native-appwrite";
import { appwriteConfig, databases } from "./appwrite";
import { verifyStreamAccessOnServer } from "./paymentService";
import {
  LIVE_STREAM_DEFAULT_CURRENCY,
  STREAM_ACCESS_MAX_PRICE,
  STREAM_ACCESS_MIN_PRICE,
  STREAM_ACCESS_PLATFORM_FEE_RATE,
  STREAM_PURCHASES_COLLECTION,
} from "./liveStreamSchema";

export const STREAM_PURCHASE_STATUS = {
  PENDING: "pending",
  COMPLETED: "completed",
  FAILED: "failed",
  REFUNDED: "refunded",
};

export { STREAM_ACCESS_PLATFORM_FEE_RATE, STREAM_PURCHASES_COLLECTION };

/** Whether streamPurchases collection ID is configured in the app. */
export function isStreamPurchasesCollectionConfigured() {
  return Boolean(String(appwriteConfig.streamPurchasesCollectionId || "").trim());
}

/** True when stream is marked as paid with a valid price. */
export function isPaidLiveStream(stream) {
  if (!stream) return false;
  if (stream.isPaid === true || stream.isPaid === "true" || stream.isPaid === 1) {
    const price = Number(stream.price);
    return Number.isFinite(price) && price > 0;
  }
  return false;
}

/** Ticket price in dollars, or 0 for free streams. */
export function getStreamAccessPrice(stream) {
  if (!isPaidLiveStream(stream)) return 0;
  return Number(stream.price);
}

/** Currency code for a paid stream (defaults to USD). */
export function getStreamAccessCurrency(stream) {
  if (!stream?.currency) return LIVE_STREAM_DEFAULT_CURRENCY;
  return String(stream.currency).trim().toUpperCase() || LIVE_STREAM_DEFAULT_CURRENCY;
}

/** Platform fee breakdown for a ticket price. */
export function calculateStreamAccessFees(price) {
  const amount = Number(price);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { amount: 0, platformFee: 0, hostReceives: 0 };
  }
  const platformFee = Math.round(amount * STREAM_ACCESS_PLATFORM_FEE_RATE * 100) / 100;
  const hostReceives = Math.round((amount - platformFee) * 100) / 100;
  return { amount, platformFee, hostReceives };
}

/** Validate host-entered ticket price before creating a paid stream. */
export function validateStreamAccessPrice(price) {
  const value = Number(price);
  if (!Number.isFinite(value)) {
    return { ok: false, error: "Enter a valid price." };
  }
  if (value < STREAM_ACCESS_MIN_PRICE) {
    return { ok: false, error: `Minimum price is $${STREAM_ACCESS_MIN_PRICE.toFixed(2)}.` };
  }
  if (value > STREAM_ACCESS_MAX_PRICE) {
    return { ok: false, error: `Maximum price is $${STREAM_ACCESS_MAX_PRICE.toFixed(2)}.` };
  }
  return { ok: true, price: Math.round(value * 100) / 100 };
}

/**
 * Client-side lookup of a completed purchase (UI hint only — server check is authoritative).
 */
export async function getCompletedStreamPurchase(streamId, buyerId) {
  if (!isStreamPurchasesCollectionConfigured()) return null;
  const sid = String(streamId || "").trim();
  const bid = String(buyerId || "").trim();
  if (!sid || !bid) return null;

  try {
    const result = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.streamPurchasesCollectionId,
      [
        Query.equal("streamId", sid),
        Query.equal("buyerId", bid),
        Query.equal("status", STREAM_PURCHASE_STATUS.COMPLETED),
        Query.limit(1),
      ]
    );
    return result.documents?.[0] || null;
  } catch {
    return null;
  }
}

/** Whether the client can see a completed purchase record (not a security gate). */
export async function hasClientStreamPurchase(streamId, buyerId) {
  const purchase = await getCompletedStreamPurchase(streamId, buyerId);
  return Boolean(purchase);
}

/**
 * Whether the user may watch this stream.
 * Free streams and hosts always pass. Paid streams use the processing server as source of truth.
 */
export async function hasStreamAccess(stream, userId) {
  if (!stream || !userId) return false;
  if (!isPaidLiveStream(stream)) return true;
  if (String(stream.hostId || "") === String(userId)) return true;

  const serverResult = await verifyStreamAccessOnServer(stream.$id, userId);
  return serverResult?.allowed === true;
}

/**
 * Re-check access for a returning viewer (e.g. after app resume).
 * @returns {Promise<{ allowed: boolean, reason?: string, fromServer?: object }>}
 */
export async function verifyReturningPurchaseAccess(stream, userId) {
  if (!stream || !userId) {
    return { allowed: false, reason: "missing_params" };
  }
  if (!isPaidLiveStream(stream)) {
    return { allowed: true, reason: "free_stream" };
  }
  if (String(stream.hostId || "") === String(userId)) {
    return { allowed: true, reason: "host" };
  }

  const fromServer = await verifyStreamAccessOnServer(stream.$id, userId);
  return {
    allowed: fromServer?.allowed === true,
    reason: fromServer?.reason,
    fromServer,
  };
}

/**
 * Detailed access status for paywall UI.
 * @returns {Promise<{ allowed: boolean, needsPaywall: boolean, reason?: string, price?: number, currency?: string, purchaseId?: string }>}
 */
export async function getStreamAccessStatus(stream, userId) {
  if (!stream || !userId) {
    return { allowed: false, needsPaywall: false, reason: "missing_params" };
  }

  if (!isPaidLiveStream(stream)) {
    return { allowed: true, needsPaywall: false, reason: "free_stream" };
  }

  const price = getStreamAccessPrice(stream);
  const currency = getStreamAccessCurrency(stream);

  if (String(stream.hostId || "") === String(userId)) {
    return { allowed: true, needsPaywall: false, reason: "host", price, currency };
  }

  const fromServer = await verifyStreamAccessOnServer(stream.$id, userId);
  if (fromServer?.allowed === true) {
    return {
      allowed: true,
      needsPaywall: false,
      reason: fromServer.reason || "granted",
      price,
      currency,
      purchaseId: fromServer.purchaseId,
    };
  }

  return {
    allowed: false,
    needsPaywall: true,
    reason: fromServer?.reason || "payment_required",
    price: fromServer?.price ?? price,
    currency: fromServer?.currency ?? currency,
    message: fromServer?.message,
  };
}
