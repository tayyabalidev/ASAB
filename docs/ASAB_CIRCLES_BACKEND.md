# ASAB Circles — Backend

## What’s in the app

| Feature | Where |
|---------|--------|
| Discovery list + filters | `app/(tabs)/circles.jsx` |
| Join / Leave | `lib/circles.js` → `toggleJoinCircle` |
| Seed starter Circles | `ensureSeedCircles` (Basketball, Music, Business, Staten Island, Creators) |
| Circle detail | `app/circle/[id].jsx` |
| Circle Feed + create-in-circle | `getCirclePosts` + `/circle/create` (text / photo / video) |
| Circle Feed likes + comments | Same Appwrite like/comment APIs as Home (video / photo / text) |
| Circle Events + RSVP | `lib/circleEvents.js` + Events tab |

Without Appwrite collections, Circles / events still work **locally on that device** (AsyncStorage).

## Appwrite collections

### 1. `circles`

| Key | Type | Size / notes |
|-----|------|----------------|
| name | String | 128, required |
| slug | String | 64, required (unique index recommended) |
| description | String | 1000 |
| tagline | String | 128 |
| avatar | String | 2048 (URL) |
| banner | String | 2048 (URL) |
| tags | String[] | max ~12 |
| filterKeys | String[] | e.g. `all`, `popular`, `local`, `interests` |
| icon | String | 32 (Feather icon name) |
| memberCount | Integer | default 0 |
| creatorId | String | 36 |
| visibility | String | 32 (`public` / `private`) |

Appwrite `$createdAt` is used when a custom `createdAt` attribute is not present.

**Indexes:** `slug` (unique), `memberCount` (desc for Popular).

### 2. `circleMembers`

| Key | Type | Size / notes |
|-----|------|----------------|
| circleId | String | 36, required |
| userId | String | 36, required |
| username | String | 128 |
| avatar | String | 2048 |
| role | String | 32 (`owner` / `admin` / `member`) |
| joinedAt | String | 64 (ISO) |

**Indexes:** `circleId`, `userId`, and ideally a combined unique on `(circleId, userId)`.

### 3. Optional `circleId` on existing post collections (required for Circle Feed)

Add to **both** video and photo collections:

| Key | Type | Size / notes |
|-----|------|----------------|
| circleId | String | 36, **optional** (empty = global Home feed) |

**Indexes (recommended):** `circleId` on each collection so Circle Feed queries are fast.

Home / Following / Trending feeds **hide** posts that have a non-empty `circleId`.

### 4. `circleTextPosts` (text-only Circle posts)

| Key | Type | Size / notes |
|-----|------|----------------|
| circleId | String | 36, required |
| body | String | 2000, required |
| title | String | 120 |
| creatorId | String | 36, required |
| creatorUsername | String | 128 |
| creatorAvatar | String | 2048 |
| createdAt | String | 64 (ISO) |
| likes | String[] | user ids who liked (optional) |

**Indexes:** `circleId`.

### 5. `circleEvents` (Circle Events tab)

| Key | Type | Size / notes |
|-----|------|----------------|
| circleId | String | 36, required |
| title | String | 80, required |
| note | String | 500 |
| placeLabel | String | 120 |
| startsAt | String | 64 (ISO datetime) |
| whenLabel | String | 80 (display string) |
| creatorId | String | 36 |
| creatorUsername | String | 128 |
| creatorAvatar | String | 2048 |
| createdAt | String | 64 (ISO) |
| rsvpUserIds | String[] | user ids going |
| rsvpUsernames | String[] | parallel to rsvpUserIds |

**Indexes:** `circleId`, `startsAt` (asc).

**Permissions:** Create/Read/Update/Delete for authenticated users (RSVP needs Update).

## Env

```bash
EXPO_PUBLIC_CIRCLES_COLLECTION_ID=6abc123b0031a48ca183
EXPO_PUBLIC_CIRCLE_MEMBERS_COLLECTION_ID=6abc14db000b5a73a03e
EXPO_PUBLIC_CIRCLE_EVENTS_COLLECTION_ID=6abd52b900061e9918a8
EXPO_PUBLIC_CIRCLE_TEXT_POSTS_COLLECTION_ID=6abf905e001c06130427
```

Or paste into `lib/appwrite.js` → `circlesCollectionId` / `circleMembersCollectionId` / `circleEventsCollectionId`.

## Status

| Piece | Status |
|-------|--------|
| Discovery + Join | Done |
| Circle detail (Feed / Events / Members / About) | Done |
| `circleId` on video/photo posts + Circle Feed | Done |
| `circleEvents` collection + RSVP | Done |
| Create your own Circle | Done |
| Edit Circle (owner/admin) | Done |
| Avatar / banner upload + Private Circles | Done |
| Richer Circle Feed media viewer | Done |
| Indexes on circles / members (slug, memberCount, etc.) | Optional polish |
