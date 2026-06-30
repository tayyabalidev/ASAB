# Creator notification subscriptions

Per-creator bell notifications use a `notificationSubscribers` array on each **users** document in Appwrite.

## Appwrite setup (required once)

In the **users** collection, add:

| Attribute | Type | Required | Notes |
|-----------|------|----------|-------|
| `notificationSubscribers` | **String array** (recommended) or **String** (max 500 chars) | No |

**Recommended:** use **String array** so many subscribers are supported.

If you already created **String** (single text), the app stores comma-separated user IDs (e.g. `id1,id2,id3`). That works for small follower counts but is limited to 500 characters.

## Behavior

- **Follow** → subscriber is added automatically (notifications on by default).
- **Unfollow** → subscriber is removed.
- **Bell (top-right)** → orange when on, purple/gray when off; tap to toggle notifications.
- **Live / video / photo** → only users in `notificationSubscribers` receive in-app + push alerts.

## Notification types

| Type | Trigger |
|------|---------|
| `live` | Creator goes live |
| `video_post` | Video published (direct upload or Mux ready) |
| `photo_post` | Photo post created |

Duplicates are prevented per subscriber + creator + content (`postId` / stream id).

## Files

- `lib/creatorSubscriptions.js` — subscribe / unsubscribe
- `lib/creatorNotificationDelivery.js` — fan-out to subscribers
- `app/(tabs)/profile/[id].jsx` — star notification toggle (top-right of profile card)
