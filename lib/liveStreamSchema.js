/**
 * Appwrite schema reference for paid live streaming (Step 1).
 * Create these attributes/collections in Appwrite Console before enabling paid streams.
 */

/** Default currency for paid live streams. */
export const LIVE_STREAM_DEFAULT_CURRENCY = "USD";

/** Platform fee on stream ticket sales (10%). */
export const STREAM_ACCESS_PLATFORM_FEE_RATE = 0.1;

/** Minimum ticket price in dollars. */
export const STREAM_ACCESS_MIN_PRICE = 0.99;

/** Maximum ticket price in dollars. */
export const STREAM_ACCESS_MAX_PRICE = 999.99;

/**
 * New attributes on existing `liveStreams` collection.
 * Free streams: omit fields or set isPaid=false (default).
 */
export const LIVE_STREAMS_PAID_ATTRIBUTES = [
  {
    key: "isPaid",
    type: "Boolean",
    required: false,
    default: false,
    note: "true = viewers must purchase access",
  },
  {
    key: "price",
    type: "Float",
    required: false,
    note: "Ticket price in dollars when isPaid is true",
  },
  {
    key: "currency",
    type: "String",
    size: 8,
    required: false,
    default: LIVE_STREAM_DEFAULT_CURRENCY,
    note: "ISO currency code, e.g. USD",
  },
];

/**
 * New `streamPurchases` collection — one doc per buyer per stream purchase.
 */
export const STREAM_PURCHASES_COLLECTION = {
  name: "streamPurchases",
  documentSecurity: false,
  attributes: [
    { key: "streamId", type: "String", size: 36, required: true },
    { key: "buyerId", type: "String", size: 36, required: true },
    { key: "hostId", type: "String", size: 36, required: true },
    { key: "amount", type: "Float", required: true },
    { key: "platformFee", type: "Float", required: true },
    { key: "hostReceives", type: "Float", required: true },
    { key: "status", type: "String", size: 16, required: true },
    { key: "paymentIntentId", type: "String", size: 64, required: false },
    { key: "currency", type: "String", size: 8, required: true },
    { key: "purchasedAt", type: "DateTime", required: false },
  ],
  indexes: [
    {
      name: "stream_buyer_status",
      type: "key",
      attributes: ["streamId", "buyerId", "status"],
      orders: ["ASC", "ASC", "ASC"],
    },
    { name: "buyer_idx", type: "key", attributes: ["buyerId"], orders: ["ASC"] },
    { name: "host_idx", type: "key", attributes: ["hostId"], orders: ["ASC"] },
    {
      name: "payment_intent_idx",
      type: "key",
      attributes: ["paymentIntentId"],
      orders: ["ASC"],
    },
  ],
  statusValues: ["pending", "completed", "failed", "refunded"],
};
