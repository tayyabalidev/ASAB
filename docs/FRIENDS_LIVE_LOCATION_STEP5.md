# Friends Live Location — Step 5: Background + notifications

Requires Steps 1–4 and a **new native rebuild** (background location permissions changed).

## What Step 5 adds

| Feature | Detail |
|---------|--------|
| Background GPS | Continues publishing when app is backgrounded/closed (OS-limited) |
| Always permission | Requests background / “Always” when sharing starts |
| Android FGS | Foreground service notification while sharing |
| Share-started push | Mutual friends (or selected list) get a push when you start sharing |
| Nearby alert | Local notification if a visible friend is within **1 km** (once per friend / 24h) |

### Defaults (tunable in `lib/locationSchema.js`)

- Nearby radius: **1000 m**
- Nearby cooldown: **24 hours** per friend
- Background interval: ~**60 s** or **100 m** movement

## Files

- `lib/locationBackground.js` — TaskManager task + start/stop
- `lib/locationSharingPrefs.js` — AsyncStorage for background
- `lib/locationSharingSession.js` — enable/disable orchestration
- `lib/locationNotifications.js` — share-started + nearby
- `app.json` — background location modes / permissions
- `app/_layout.jsx` — imports background task at startup
- `app/live-map/index.jsx` — uses sharing session helpers

## Rebuild required

```bash
npx eas build --platform ios --profile development
# and/or android
```

Background location **will not work** on an old binary or Expo Go.

## How to test

1. Install new build → Friends → Live Map → enable **Sharing** (Friends mode).
2. Allow **While Using**, then **Always** / background when prompted.
3. Confirm status shows `background on` (or an alert if Always was denied).
4. Put app in background / swipe away; wait ~1–2 minutes; check Appwrite `userLocations` updates.
5. On Android, confirm ongoing “ASAB Live Location” notification while sharing.
6. Second account (mutual follow, sharing): move within ~1 km → nearby local notification (once/day).
7. When A starts sharing, B should get **location_share** push (if push tokens / relay work).
8. Tap push → opens Live Map.

### Pass criteria

- [ ] Background updates appear in Appwrite after leaving the app
- [ ] Ghost / stop sharing stops background updates
- [ ] Share-started push reaches eligible friends
- [ ] Nearby notification fires within radius (and respects cooldown)

## Store / privacy notes

- Explain Always location clearly in App Store / Play listings.
- Background updates are **throttled** (not Zenly-level continuous GPS).
- Production should still add Appwrite document security for coordinates.

## Next (optional)

- Harden Appwrite document permissions
- Tune nearby radius / cooldown with client
- Marker clustering polish already in Step 4
