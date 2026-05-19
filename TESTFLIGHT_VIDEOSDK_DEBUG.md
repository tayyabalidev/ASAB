# VideoSDK debug on TestFlight (no Mac / no Xcode)

## Install build 1.0.70+

**Do not use Expo Go** for live/call testing — VideoSDK native code does not run there.

This build includes:

- Floating **SDK** button (bottom-left, on top of all screens including Go Live)
- In-app log panel with **Share / Copy**
- S3 join fixes (no retry loop before first join, accurate participant count)

## How to capture logs

1. Open the app from TestFlight.
2. Confirm the green **SDK** pill appears bottom-left on the home screen.
3. Tap **Go Live** and reproduce the issue.
4. Tap **SDK** → expand the panel → **Share / Copy**.
5. Save to **Notes** or Messages and send the full text.

## What to look for

| Log line | Meaning |
|----------|---------|
| `[S1_ROOM][SUCCESS]` | Room created on server |
| `[S2_SDK][TOKEN_OK]` | JWT validated |
| `[S2_SDK][MEETING_PROVIDER_MOUNT]` | SDK session started |
| `[S3_JOIN][REQUESTED]` | `join()` called |
| `[S3_JOIN][MEETING_JOINED]` | Host in room (required) |
| `[S3_JOIN][DISCONNECTED]` | Dropped — read `reason` field |
| `[S3_JOIN][FAIL_DURING_JOIN]` | Never stayed in room |

If you see **REQUESTED** but not **MEETING_JOINED**, copy the **DISCONNECTED** line (includes `reason`).

## Disable debug UI for store release

Set at build time:

```
EXPO_PUBLIC_VIDEOSDK_DEBUG_LOGS=0
```
