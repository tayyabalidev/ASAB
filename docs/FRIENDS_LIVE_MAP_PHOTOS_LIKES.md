# Friends Live Map — Photos & Likes

## What’s in the app

| Feature | Where |
|---------|--------|
| **Take a pic** | Orange camera button (right side of map) → camera → posts a square photo pin at your GPS |
| **Friend likes** | Heart on each friend in the bottom list; pink heart badge on their map pin when liked |
| **Photo likes** | Tap a map photo pin → heart to like |

## Appwrite (optional, for sharing photos with friends)

Create collection `mapMoments` with attributes:

| Key | Type | Notes |
|-----|------|--------|
| userId | String 36 | required |
| username | String 128 | |
| avatar | String 2048 | |
| photoUrl | String 2048 | required |
| latitude | Float | required |
| longitude | Float | required |
| placeLabel | String 255 | |
| createdAt | String 64 | ISO |
| likeCount | Integer | default 0 |
| likedBy | String[] | user ids |

Set collection ID in `.env`:

```bash
EXPO_PUBLIC_MAP_MOMENTS_COLLECTION_ID=your_collection_id
```

Or paste into `lib/appwrite.js` → `mapMomentsCollectionId`.

Without the collection, photos still work **locally on that device** (good for UI testing). Friend likes always work (AsyncStorage).

## Permissions

Camera permission string is already set in `app.json` for profile / posts / map photos.
