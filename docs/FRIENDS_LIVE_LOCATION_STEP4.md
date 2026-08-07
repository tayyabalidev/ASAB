# Friends Live Location — Step 4: Actions, search, clustering

Requires Steps 1–3.

## What Step 4 adds

| Feature | Detail |
|---------|--------|
| Friend actions | Tap pin or list row → Profile / Message / Audio / Video call |
| Search | Bottom sheet “Search for friends…” filters the list |
| Clustering | Nearby pins group via `react-native-map-clustering` |
| Your pin | Not clustered (`cluster={false}`) |

## Files

- `app/live-map/index.jsx` — UI upgrades
- `lib/liveMapActions.js` — profile / chat / call helpers
- `package.json` — `react-native-map-clustering`

## How to test

Use a **dev client** (not Expo Go).

1. Open Live Map with at least 2 friends sharing nearby (or zoom out so pins overlap).
2. Confirm overlapping pins show a **cluster** bubble; tap cluster to zoom.
3. Tap a friend pin → action sheet with Profile / Message / Audio / Video.
4. Type in search → list filters by name/place.
5. Message opens chat; call uses existing `/call` flow; profile opens `/profile/[id]`.

### Pass criteria

- [ ] Cluster appears when pins are close
- [ ] Action sheet works from pin and from list
- [ ] Search filters correctly
- [ ] Message / call / profile navigate without crash

## Notes

- Clustering is a JS dependency (no extra native rebuild for clustering alone). You still need the Step 2 rebuild for maps/location.
- Call/message still need the VideoSDK **dev build** (same as the rest of ASAB).

## Next (later)

- Background location when app closed
- Nearby / share-started push notifications
- Appwrite document-level privacy hardening
