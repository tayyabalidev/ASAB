/**
 * Paid live stream access — purchase records and entitlement checks.
 */

import { ID, Query } from "react-native-appwrite";
import { appwriteConfig, databases } from "./appwrite";

const PLATFORM_FEE_RATE = 0.1;

export function calculateStreamAccessFees(amount) {
  const parsed = parseFloat(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  const platformFee = Math.round(parsed * PLATFORM_FEE_RATE * 100) / 100;
  const hostReceives = Math.round((parsed - platformFee) * 100) / 100;
  return { amount: parsed, platformFee, hostReceives };
}

export function isPaidLiveStream(stream) {
  if (!stream) return false;
  const price = parseFloat(stream.price);
  const hasPrice = Number.isFinite(price) && price > 0;
  if (!hasPrice) return false;
  if (stream.isPaid === true || stream.isPaid === "true" || stream.isPaid === 1) {
    return true;
  }
  return hasPrice;
}

export function getStreamAccessPrice(stream) {
  if (!isPaidLiveStream(stream)) return 0;
  const price = parseFloat(stream.price);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

function purchaseGrantsAccess(doc, streamId, userId) {
  if (!doc) return false;
  return (
    String(doc.streamId || "") === String(streamId || "") &&
    String(doc.buyerId || "") === String(userId || "") &&
    String(doc.status || "").toLowerCase() === "completed"
  );
}

/**
 * Check purchase access without fragile compound Appwrite queries.
 * Uses client-side filtering (same pattern as live comments).
 */
export async function hasStreamAccess(stream, userId) {
  if (!stream) return false;
  if (!isPaidLiveStream(stream)) return true;
  if (!userId) return false;
  if (String(stream.hostId || "") === String(userId)) return true;

  const collectionId = appwriteConfig.streamPurchasesCollectionId;
  if (!collectionId) return false;

  try {
    const result = await databases.listDocuments(
      appwriteConfig.databaseId,
      collectionId,
      [Query.orderDesc("$createdAt"), Query.limit(100)]
    );

    return (result?.documents || []).some((doc) =>
      purchaseGrantsAccess(doc, stream.$id, userId)
    );
  } catch (_) {
    return false;
  }
}

export async function createStreamPurchase({
  streamId,
  buyerId,
  hostId,
  amount,
  platformFee,
  hostReceives,
  paymentIntentId = null,
  status = "pending",
  currency = "USD",
}) {
  const now = new Date();
  return databases.createDocument(
    appwriteConfig.databaseId,
    appwriteConfig.streamPurchasesCollectionId,
    ID.unique(),
    {
      streamId,
      buyerId,
      hostId,
      amount: parseFloat(amount),
      platformFee: parseFloat(platformFee),
      hostReceives: parseFloat(hostReceives),
      paymentIntentId: paymentIntentId || "",
      status,
      currency: String(currency || "USD").toUpperCase(),
      purchasedAt: now.toISOString(),
      createdAt: now.toISOString(),
    }
  );
}

export async function updateStreamPurchaseStatus(purchaseId, status, paymentIntentId = null) {
  const updateData = { status };
  if (paymentIntentId) {
    updateData.paymentIntentId = paymentIntentId;
  }
  return databases.updateDocument(
    appwriteConfig.databaseId,
    appwriteConfig.streamPurchasesCollectionId,
    purchaseId,
    updateData
  );
}

export async function getStreamPurchaseForUser(streamId, buyerId) {
  try {
    const result = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.streamPurchasesCollectionId,
      [Query.orderDesc("$createdAt"), Query.limit(100)]
    );
    return (
      (result?.documents || []).find((doc) =>
        String(doc.streamId) === String(streamId) &&
        String(doc.buyerId) === String(buyerId)
      ) || null
    );
  } catch (_) {
    return null;
  }
}
