# Friends Live Location — Step 3: Live sync + friends

Requires Step 1 (collection) + Step 2 (maps / permissions rebuild).

## What Step 3 adds

| Feature | Detail |
|---------|--------|
| Publish GPS → Appwrite | Throttled upsert to `userLocations` (`6a74d4660024fc37b862`) |
| Friend markers | Avatar pins + name + last seen |
| Last seen | `Now` if &lt; 2 min, else `15m` / `2h` / `1d` |
| Privacy | Everyone · Friends (mutual follow) · Selected · Ghost |
| Realtime | Shared Appwrite WebSocket + 8s polling fallback |
| UI | Settings gear, share/ghost chip, friends list sheet |

## Friend definition (Step 3)

**Mutual follow** = you follow them **and** they follow you  
(`following` ∩ `followers` on your user document).

## Files

- `lib/locationService.js` — upsert, visibility, subscribe
- `lib/appwriteRealtime.js` — `getUserLocationsRealtimeChannel`
- `app/live-map/index.jsx` — full map UI

## How to test (two accounts)

1. Use a **rebuilt** dev client (from Step 2).
2. Account A and Account B: **follow each other**.
3. On both: Friends → **Live Map** → allow location.
4. Account A: tap settings → **Friends** (or Everyone) so sharing is on.
5. Account B: same.
6. Confirm:
   - Each sees the other avatar on the map
   - Label shows **Now** while moving / recently updated
   - After ~2+ minutes idle, label becomes e.g. `3m`
   - **Ghost Mode** hides you from the other map
   - **Selected friends** only shows you to chosen mutual friends

### Pass criteria

- [ ] Toggle Sharing / Ghost updates Appwrite (`isSharing` / `privacyMode`)
- [ ] Mutual friend appears when both sharing with Friends mode
- [ ] Ghost hides your pin from the other user
- [ ] Realtime or polling refreshes the other pin within ~8s
- [ ] Last seen text updates

## Notes

- Privacy filtering is **client-side** for now (collection read is open for authenticated users). Harden with Document Security before production.
- Background tracking is **not** in Step 3 (still foreground while map is open / app in use for publishing).
- Android still needs `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` for map tiles.

## Next (later phases)

- Marker clustering
- Tap → message / call actions
- Background location + nearby push
- Document-level Appwrite permissions
