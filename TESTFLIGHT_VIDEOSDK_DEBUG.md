# VideoSDK debug on TestFlight (no Mac / no Xcode)

## Root cause found (VideoSDK dashboard Traces)

If Traces show **Loading Device Capabilities** failed with:

`Could not join the room device not supported`

Then S1/S2 are OK — the SDK rejects **Loading device capabilities** when `micEnabled` or `webcamEnabled` is true at join (your trace still shows both `true` = old build).

Build **1.0.73+** joins with **mic off + camera off**, then enables mic → camera after `MEETING_JOINED`.

Verify in LOG panel: `MEETING_PROVIDER_MOUNT` must show `"micEnabled":false,"webcamEnabled":false`.

## Install build 1.0.73+

**Do not use Expo Go** for live/call testing — VideoSDK native code does not run there.

This build includes:

- Orange **LOG** button (top-right, on top of all screens including Go Live)
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
