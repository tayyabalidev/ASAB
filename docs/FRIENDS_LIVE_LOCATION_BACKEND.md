# Friends Live Location — Step 1: Appwrite Backend Setup

Create and test this in the **Appwrite Console** before any mobile/maps work (Step 2).

**Project:** `6854922e0036a1e8dee6`  
**Database ID:** `685494a1002f8417c2b2`  
**Endpoint:** `https://nyc.cloud.appwrite.io/v1`  
**Schema reference in repo:** `lib/locationSchema.js`

---

## 1. Create collection `userLocations`

1. Open Appwrite Console → your project → **Databases** → database `685494a1002f8417c2b2`
2. Click **Create collection**
3. Settings:

| Field | Value |
|--------|--------|
| Collection ID | `userLocations` (or auto-generate — copy the ID afterward) |
| Name | `userLocations` |
| Document Security | **Off** for Step 1 testing (turn On later for production privacy) |

4. Save and **copy the Collection ID** — you will need it for Step 2 (`appwriteConfig`).

---

## 2. Add attributes

Create each attribute and wait until status is **available** before creating the next (or create in batch and wait for all).

| Key | Type | Size | Required | Default | Array | Notes |
|-----|------|------|----------|---------|-------|--------|
| `userId` | String | 36 | Yes | — | No | Same as users `$id` |
| `latitude` | Float | — | No | — | No | Omit/clear in Ghost mode |
| `longitude` | Float | — | No | — | No | Omit/clear in Ghost mode |
| `accuracy` | Float | — | No | — | No | meters |
| `heading` | Float | — | No | — | No | optional |
| `speed` | Float | — | No | — | No | optional |
| `altitude` | Float | — | No | — | No | optional |
| `placeLabel` | String | 255 | No | — | No | e.g. `SoHo, New York` |
| `isSharing` | Boolean | — | Yes | `false` | No | Must be true to appear on map |
| `privacyMode` | String | 16 | Yes | `ghost` | No | See values below |
| `allowedViewerIds` | String | 36 | No | — | **Yes** | For `selected` mode |
| `lastSeenAt` | DateTime | — | No | — | No | For “15m ago” |
| `updatedAtClient` | DateTime | — | No | — | No | Device GPS time (optional) |

### `privacyMode` allowed values

- `everyone`
- `friends`
- `selected`
- `ghost`

(Appwrite Enum type is fine if you prefer Enum instead of String.)

---

## 3. Create indexes

Wait until all attributes are **available**, then:

| Index name | Type | Attributes | Orders |
|------------|------|------------|--------|
| `userId_unique` | **unique** | `userId` | ASC |
| `sharing_mode_idx` | key | `isSharing`, `privacyMode` | ASC, ASC |
| `lastSeen_idx` | key | `lastSeenAt` | DESC |

---

## 4. Collection permissions (Step 1 — testing)

Use the same style as your other social collections so the logged-in app can read/write during development.

**Recommended for Step 1 test:**

| Role | Create | Read | Update | Delete |
|------|--------|------|--------|--------|
| Users (authenticated) | Yes | Yes | Yes | Yes |

> **Security note:** Open read is OK only for backend verification. Before production / Selected Friends / Ghost Mode, switch to **Document Security** (or an Appwrite Function) so users cannot list everyone’s coordinates. Do not skip this before public release.

**Optional production direction (later):**

- Document Security **On**
- Each doc: `read` = owner + allowed viewers; `update`/`delete` = owner only
- Ghost: remove other users’ read permission and clear lat/lng

---

## 5. Optional — attributes on existing `users` collection

Only if you want settings mirrored on the profile (coordinates still stay in `userLocations`):

| Key | Type | Size | Required | Default |
|-----|------|------|----------|---------|
| `locationSharingEnabled` | Boolean | — | No | `false` |
| `locationPrivacyMode` | String | 16 | No | `ghost` |

You can skip this for Step 1 and add later.

---

## 6. Enable Realtime

1. Ensure the collection is available for **Realtime** (Appwrite Cloud: document create/update events are available by default for subscribed clients).
2. No extra “Realtime collection” toggle is required on Cloud for basic subscribe; the app will subscribe later with:

`databases.{DATABASE_ID}.collections.{USER_LOCATIONS_COLLECTION_ID}.documents`

---

## 7. Manual test checklist (do this before Step 2)

Use **Documents** tab or Appwrite API / REST.

### Test A — Create a location doc

Create document with **Document ID = a real user’s `$id`** (recommended for upserts later).

Example payload:

```json
{
  "userId": "PASTE_REAL_USER_DOCUMENT_ID",
  "latitude": 40.7231,
  "longitude": -73.9982,
  "accuracy": 12.5,
  "placeLabel": "Lower East Side, New York",
  "isSharing": true,
  "privacyMode": "friends",
  "allowedViewerIds": [],
  "lastSeenAt": "2026-08-06T18:00:00.000+00:00",
  "updatedAtClient": "2026-08-06T18:00:00.000+00:00"
}
```

**Pass if:** document saves; unique index rejects a second doc with the same `userId`.

### Test B — Update (simulate live move)

Update same document:

```json
{
  "latitude": 40.7240,
  "longitude": -73.9970,
  "placeLabel": "SoHo, New York",
  "lastSeenAt": "2026-08-06T18:01:00.000+00:00"
}
```

**Pass if:** values update; `$updatedAt` changes.

### Test C — Ghost Mode

```json
{
  "isSharing": false,
  "privacyMode": "ghost",
  "latitude": null,
  "longitude": null,
  "placeLabel": null
}
```

(If Appwrite rejects null floats, omit those attributes or set `isSharing: false` and leave old coords — app will treat Ghost as hidden in Step 2.)

**Pass if:** doc updates; you can query `isSharing = false`.

### Test D — Selected Friends

```json
{
  "isSharing": true,
  "privacyMode": "selected",
  "allowedViewerIds": ["FRIEND_USER_ID_1", "FRIEND_USER_ID_2"],
  "latitude": 40.7231,
  "longitude": -73.9982
}
```

**Pass if:** array of string IDs stores correctly.

### Test E — Query by userId

Query: `userId` equal to your test user.

**Pass if:** exactly one document returns.

### Test F — Query sharing users

Query: `isSharing` equal to `true`.

**Pass if:** only sharing docs return (for Step 1 admin-style list).

---

## 8. After tests pass — record for Step 2

Fill this in and keep it for the mobile config:

```
USER_LOCATIONS_COLLECTION_ID=6a74d4660024fc37b862
DATABASE_ID=685494a1002f8417c2b2
```

Already wired in `lib/appwrite.js` as `appwriteConfig.userLocationsCollectionId`.

Optional env name for later:

```
EXPO_PUBLIC_USER_LOCATIONS_COLLECTION_ID=6a74d4660024fc37b862
```

**Do not start Step 2 (maps / `react-native-maps`) until Tests A–F pass.**

---

## 9. What Step 1 does NOT include

- No React Native map screen  
- No `expo-location` plugin / rebuild  
- No background tracking  
- No push notifications  
- No production document-level privacy enforcement  

Those come after this backend is verified.

---

## Quick attribute checklist

- [ ] Collection `userLocations` created  
- [ ] All attributes available  
- [ ] Indexes created (`userId_unique`, `sharing_mode_idx`, `lastSeen_idx`)  
- [ ] Permissions set for authenticated users (test)  
- [ ] Tests A–F passed  
- [ ] Collection ID saved for Step 2  
