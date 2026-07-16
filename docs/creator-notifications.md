# Creator notification subscriptions

Per-creator bell notifications use a `notificationSubscribers` array on each **users** document in Appwrite.
Device push uses `expoPushToken` on each **users** document. Expo delivers through APNs on iOS and FCM on Android.

## Appwrite setup (required once)

In the **users** collection, add:

| Attribute | Type | Required | Notes |
|-----------|------|----------|-------|
| `notificationSubscribers` | **String array** (recommended) or **String** (max 500 chars) | No |
| `expoPushToken` | **String** | No | Saved when a signed-in user grants push permission on a physical device |

**Recommended:** use **String array** so many subscribers are supported.

If you already created **String** (single text), the app stores comma-separated user IDs (e.g. `id1,id2,id3`). That works for small follower counts but is limited to 500 characters.

## Behavior

- **Follow** → subscriber is added automatically (notifications on by default).
- **Profile like / favorite** → subscriber is added automatically.
- **Unfollow / unlike** → subscriber is removed only when the user has neither followed nor favorited that creator.
- **Bell (top-right)** → orange when on, purple/gray when off; tap to toggle notifications.
- **Live / video / photo / generic content post** → **followers ∪ favorites ∪ notificationSubscribers** receive in-app + push (same Expo delivery path as DMs/follows).
- **CEO / admin account** → every user on the platform receives in-app + push alerts for live, video, photo, and generic content posts (no follow/bell required).

## Real-time push architecture (same as DMs)

1. Resolve recipients (followers / favorites / subscribers, or all users for admin).
2. Prefer **server** `/api/creator/notify-content` or `/api/push/send` (API key reads `expoPushToken`).
3. Fall back to client → Expo Push API when the server URL is unset.
4. Expo delivers via **FCM (Android)** and **APNs (iOS)** even when the app is backgrounded or closed.

### Required for reliable multi-user push

Run `server/server.js` with `APPWRITE_API_KEY`, then in app `.env`:

```env
EXPO_PUBLIC_PROCESSING_SERVER_URL=http://YOUR_LAN_IP:3001
# Optional dedicated endpoints:
# EXPO_PUBLIC_PUSH_RELAY_URL=http://YOUR_LAN_IP:3001/api/push/send
# EXPO_PUBLIC_ADMIN_BROADCAST_URL=http://YOUR_LAN_IP:3001/api/admin/broadcast-content
# EXPO_PUBLIC_CREATOR_NOTIFY_URL=http://YOUR_LAN_IP:3001/api/creator/notify-content
```

Or deploy Appwrite Functions `push-relay` / `admin-broadcast` and set the matching `EXPO_PUBLIC_*_URL` values.

## CEO / admin broadcast setup

Set the broadcaster account in `.env` (restart Expo after changes):

```env
# Appwrite user ID (singular or plural env names both work)
EXPO_PUBLIC_CEO_USER_ID=your_user_id
# EXPO_PUBLIC_CEO_USER_IDS=id1,id2

# Email fallback
EXPO_PUBLIC_CEO_USER_EMAIL=you@example.com
# EXPO_PUBLIC_CEO_EMAILS=you@example.com

# Admins in EXPO_PUBLIC_ADMIN_EMAILS also broadcast to all users when they post
EXPO_PUBLIC_ADMIN_EMAILS=you@example.com
```

### Real-time mobile push for admin posts

Deploy `appwrite-functions/admin-broadcast` in Appwrite, then in app `.env`:

```env
EXPO_PUBLIC_ADMIN_BROADCAST_URL=https://your-function.nyc.appwrite.run
```

Function variables: `APPWRITE_DATABASE_ID`, `APPWRITE_USER_COLLECTION_ID`, `APPWRITE_NOTIFICATIONS_COLLECTION_ID`, `ADMIN_EMAILS`, `CEO_USER_ID`.

Or run `server/server.js` with API key and set `EXPO_PUBLIC_PROCESSING_SERVER_URL=http://YOUR_IP:3001`.

Users receive **Expo push** immediately and **in-app** updates via Appwrite Realtime + polling.

## Notification types

| Type | Trigger |
|------|---------|
| `live` | Creator goes live |
| `video_post` | Video published (direct upload or Mux ready) |
| `photo_post` | Photo post created |
| `content_post` / `post` | Generic content post |

Duplicates are prevented per subscriber + creator + content (`postId` / stream id).

## Files

- `lib/creatorSubscriptions.js` — subscribe / unsubscribe + recipient resolution
- `lib/creatorNotificationDelivery.js` — post/live/admin fan-out orchestration
- `lib/creatorContentNotifyClient.js` — server notify client
- `lib/pushNotificationService.js` — Expo push (relay-first, same as DMs)
- `lib/pushRelayClient.js` — `/api/push/send` client
- `server/creatorContentNotify.js` — server follower/admin content notify
- `server/pushRelay.js` — server token relay
- `lib/notificationService.js` — in-app notification realtime + polling
- `lib/ceo.js` — CEO account detection
- `app/(tabs)/profile/[id].jsx` — bell notification toggle
