# Paid Live Streaming

Paid live streams let hosts charge a one-time ticket price. Viewers pay through Stripe before joining; access is recorded in Appwrite and enforced when issuing VideoSDK viewer tokens.

## Appwrite setup

### 1. Extend `liveStreams` collection

Collection ID: `68f20f1f00332e083aff`

**Required for all live streams** (add these first if go-live fails):

| Attribute | Type | Required | Notes |
|-----------|------|----------|-------|
| `videosdkRoomId` | String | Yes | VideoSDK meeting room ID — **must exist before go-live works** |
| `liveMode` | String | No | `camera` or `screen` |
| `hostId` | String | Yes | Host user document ID |
| `hostUsername` | String | Yes | |
| `hostAvatar` | String | No | |
| `title` | String | Yes | |
| `description` | String | No | |
| `category` | String | No | |
| `isLive` | Boolean | Yes | |
| `status` | String | Yes | e.g. `live`, `ended` |
| `viewerCount` | Integer | No | Default 0 |
| `startTime` | DateTime | Yes | |
| `endTime` | DateTime | No | Set when stream ends |
| `thumbnail` | String | No | Storage file ID or URL |

**Paid streams only** (add when enabling monetization):

| Attribute | Type | Required | Notes |
|-----------|------|----------|-------|
| `isPaid` | Boolean | No | Default `false` |
| `price` | Float | No | Ticket price (e.g. `4.99`) |
| `currency` | String | No | Default `USD` (enum: USD, EUR, GBP, JPY) |

In Appwrite Console: **Database → your database → liveStreams → Attributes → Create attribute**.

### 2. Create `streamPurchases` collection

Create a new collection in database `685494a1002f8417c2b2` with these attributes:

| Attribute | Type | Required | Notes |
|-----------|------|----------|-------|
| `streamId` | String | Yes | Live stream document ID |
| `buyerId` | String | Yes | Purchaser user document ID |
| `hostId` | String | Yes | Host user document ID |
| `amount` | Float | Yes | Ticket price charged |
| `platformFee` | Float | Yes | Platform fee (10%) |
| `hostReceives` | Float | Yes | Amount credited to host |
| `paymentIntentId` | String | No | Stripe PaymentIntent ID |
| `status` | String | Yes | Enum: `pending`, `completed`, `failed`, `refunded` |
| `currency` | String | Yes | Enum: USD, EUR, GBP, JPY |
| `purchasedAt` | DateTime | Yes | ISO timestamp |
| `createdAt` | DateTime | No | ISO timestamp |

**Permissions:** Allow authenticated users to create/read their own purchases; hosts may read purchases for their streams. The server API key used by the processing server needs read access for entitlement checks.

### 3. Update collection ID in the app

In `lib/appwrite.js`, set `streamPurchasesCollectionId` to your new collection ID:

```js
streamPurchasesCollectionId: "YOUR_STREAM_PURCHASES_COLLECTION_ID",
```

## Server / Stripe setup

### Processing server (`server/.env`)

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Required for paid stream token gating
APPWRITE_ENDPOINT=https://nyc.cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=6854922e0036a1e8dee6
APPWRITE_API_KEY=your_server_api_key
APPWRITE_DATABASE_ID=685494a1002f8417c2b2
APPWRITE_LIVE_STREAMS_COLLECTION_ID=68f20f1f00332e083aff
APPWRITE_STREAM_PURCHASES_COLLECTION_ID=your_stream_purchases_collection_id
```

### Expo app (`.env`)

```env
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
EXPO_PUBLIC_PROCESSING_SERVER_URL=http://YOUR_IP:3001
```

If you use the **Appwrite `videosdk-token` function** for tokens (not Node `/get-token`), add the same Appwrite collection env vars to that function and redeploy.

## How it works

1. **Host** enables “Paid live stream” on Go Live and sets a price (minimum $1).
2. **Viewer** opens the stream → paywall UI if no completed purchase exists.
3. **Stripe Payment Sheet** collects payment; a `streamPurchases` record is created with `status: completed`.
4. **VideoSDK token** requests include `streamId`; server/function refuses tokens without a valid purchase (hosts always allowed).
5. **Live list** shows a price badge on paid streams.

## API endpoints (processing server)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/create-stream-access-payment-intent` | POST | Create Stripe PaymentIntent for stream ticket |
| `/api/check-stream-access` | GET | `?streamId=&userId=` entitlement check |
| `/get-token` | GET | VideoSDK JWT; gates `purpose=live` when `streamId` present |

## Platform fee

Ticket sales use the same **10% platform fee** as donations. Host receives 90% of the ticket price (payout via existing Stripe Connect flow).

## Testing checklist

- [ ] Create paid stream as host; confirm `isPaid`, `price` on liveStreams document
- [ ] Second account sees paywall, not video
- [ ] Successful payment grants access and starts playback
- [ ] Token request without purchase returns 403
- [ ] Host can watch own paid stream without paying
- [ ] Free streams unchanged
