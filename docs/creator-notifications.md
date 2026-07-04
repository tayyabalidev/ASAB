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
- **CEO / admin account** → every user on the platform receives in-app + push alerts for live, video, and photo posts (no follow/bell required).

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

Users receive **Expo push** immediately and **in-app** updates via Appwrite Realtime + 3s polling.

## Notification types

| Type | Trigger |
|------|---------|
| `live` | Creator goes live |
| `video_post` | Video published (direct upload or Mux ready) |
| `photo_post` | Photo post created |

Duplicates are prevented per subscriber + creator + content (`postId` / stream id).

## Files

- `lib/creatorSubscriptions.js` — subscribe / unsubscribe
- `lib/notificationService.js` — in-app notification realtime + polling
- `lib/messageService.js` — DM message realtime + polling
- `context/NotificationProvider.js` — global subscription at app root
- `lib/ceo.js` — CEO account detection
- `app/(tabs)/profile/[id].jsx` — star notification toggle (top-right of profile card)
