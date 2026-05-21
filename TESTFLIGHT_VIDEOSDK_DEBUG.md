# VideoSDK debug on TestFlight (no Mac / no Xcode)

## Expo Go errors (`checkCameraPermission` / native module)

Those errors mean VideoSDK was loaded inside **Expo Go**, which has no VideoSDK native code. After build **1.0.75+** gate fixes, Expo Go should show the orange **LOG** button without crashing. **Go Live / calls still require TestFlight or `eas build`** — not Expo Go.

Restart Metro after pulling: `npx expo start -c`

## Why logs look different in Expo vs TestFlight

| Where | What you see |
|-------|----------------|
| **Expo Go / `npx expo start`** | Extra **dev-only** panels on the live screen (`phase`, `sdk`, scrollable lines) — only when `__DEV__` is true |
| **TestFlight** | Those dev panels are **hidden**. Use the orange **LOG** button instead |

If you only tested in Expo before, you were not using the same UI as TestFlight.

## Where to find logs on TestFlight (build 1.0.75+)

1. **Orange `LOG` button — top-right** on every screen (shows `v1.0.75` under the label).
2. On **Go Live / broadcast**, also tap **Open VideoSDK logs** (top-left) — opens the same panel.
3. Tap **LOG** → **Share** → paste into Notes or Messages.

If you do **not** see orange **LOG v1.0.75** top-right, your TestFlight build is **older** than this code. Submit a new build with EAS.

## Install build 1.0.75+

**Do not use Expo Go** for live/call testing — VideoSDK native code does not run there.

This build includes:

- Orange **LOG** in a **Modal** (stays above full-screen live UI on iOS)
- **Open VideoSDK logs** on the broadcast screen
- `EXPO_PUBLIC_VIDEOSDK_DEBUG_LOGS=1` in EAS production/preview profiles

## Root cause (VideoSDK dashboard Traces)

If Traces show **Loading Device Capabilities** failed with `device not supported`, use build **1.0.73+** (mic/camera off at join, enabled after `MEETING_JOINED`).

Verify in LOG panel: `MEETING_PROVIDER_MOUNT` with `"micEnabled":false,"webcamEnabled":false`.

## What to look for in shared logs

| Log line | Meaning |
|----------|---------|
| `[S2_SDK][DEBUG_PANEL_READY]` | LOG UI mounted (should appear on app open) |
| `[S1_ROOM][SUCCESS]` | Room created on server |
| `[S2_SDK][TOKEN_OK]` | JWT validated |
| `[S2_SDK][MEETING_PROVIDER_MOUNT]` | SDK session started |
| `[S3_JOIN][REQUESTED]` | `join()` called |
| `[S3_JOIN][MEETING_JOINED]` | Host in room (required) |
| `[S3_JOIN][ENABLE_MIC_AFTER_JOIN]` | Mic publish started |
| `[S3_JOIN][DISCONNECTED]` | Dropped — read `reason` |
| `[S3_JOIN][FAIL_DURING_JOIN]` | Never stayed in room |

## EAS build

```bash
eas build --profile production --platform ios
```

Ensure Expo project env does **not** set `EXPO_PUBLIC_VIDEOSDK_DEBUG_LOGS=0` unless you want logs hidden.

## Disable debug UI for App Store release

Set at build time:

```
EXPO_PUBLIC_VIDEOSDK_DEBUG_LOGS=0
```

And in `app.json` → `extra` → `"videosdkDebugLogs": false`.
