# Friends Live Location — Step 2: Maps + Location Permissions

Complete Step 1 (`docs/FRIENDS_LIVE_LOCATION_BACKEND.md`) before this.

## What Step 2 adds

| Item | Status |
|------|--------|
| `react-native-maps` dependency | Installed |
| `expo-location` config plugin | In `app.json` |
| iOS location usage strings | In `app.json` infoPlist |
| Android `ACCESS_FINE/COARSE_LOCATION` | In `app.json` permissions |
| Google Maps API key wiring | Via `app.config.js` + env |
| Test screen `/live-map` | Own GPS pin only |
| Entry button | Friends (Discover) → **Live Map** |

**Not in Step 2:** friend markers, Appwrite location sync, privacy modes, background tracking, nearby push.

## Required: rebuild native app

Location + maps are native modules. Expo Go is not enough for a reliable store-like test with your current VideoSDK setup — use a **development or preview build**.

```bash
# After pulling these changes:
npx eas build --platform ios --profile development
# or
npx eas build --platform android --profile development
```

Or local:

```bash
npx expo prebuild --clean
npx expo run:ios
# / npx expo run:android
```

## Google Maps API key (Android required)

iOS can use **Apple Maps** without a key.  
Android needs a Google Maps key or the map tiles may be blank.

1. Google Cloud Console → enable **Maps SDK for Android** (and iOS if you want Google on iOS)
2. Create an API key restricted to `com.bilal.asab`
3. Add to `.env` (and EAS secrets for cloud builds):

```
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your_key_here
```

`app.config.js` injects this into:

- `android.config.googleMaps.apiKey`
- `ios.config.googleMapsApiKey` (optional; used only if you switch to Google provider on iOS)

## How to test Step 2

1. Install a fresh build that includes these native changes  
2. Open the app → **Friends** tab  
3. Tap **Live Map**  
4. Allow location when prompted  
5. Confirm:
   - Map renders (light or dark theme)
   - Green pin on your current position
   - Place label / coordinates in the bottom card
   - Crosshair button recenters the map
   - Back button returns to Friends

### Pass criteria

- [ ] Permission prompt appears (first time)
- [ ] Map visible
- [ ] Own location marker updates when you move (or GPS refreshes)
- [ ] No crash when denying permission (error message shown instead)

## Files touched

- `package.json` — `react-native-maps`
- `app.json` — location plugin + permissions
- `app.config.js` — Google Maps key from env
- `lib/locationPermissions.js` — foreground permission helpers
- `app/live-map/index.jsx` — test map screen
- `app/_layout.jsx` — stack route
- `app/(tabs)/friends.jsx` — Live Map entry

## After Step 2 passes → Step 3

Foreground publish/subscribe to `userLocations`, friend markers, last seen, Ghost Mode.
