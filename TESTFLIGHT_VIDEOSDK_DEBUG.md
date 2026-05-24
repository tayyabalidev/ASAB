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

## Build 1.0.86 (faster join, flip camera, chat, mirror fix)

1. **Faster startup** — shorter publish/HLS/iOS delays; no duplicate permission request at join (S2 gate only); direct `join()` when ready.
2. **Flip camera** — center button (`refresh-cw`) calls VideoSDK `changeWebcam()` during live camera mode.
3. **Preview mirror off** — local `RTCView` uses `mirror={false}` (published HLS unchanged).
4. **Live chat** — host can type/send (was hidden with `isHost`); optimistic send + faster comment poll.

Confirm `buildNote` **1.0.86** and traces: `CHANGE_WEBCAM_USER`, `WEBCAM_ENABLE_ONLY` removed.

## Build 1.0.85 (camera preview via useParticipant)

Fixes **“Camera stream loading…”** when join/HLS succeed but `localWebcamStream` from `useMeeting` stays empty (common on iOS).

1. **Local preview** uses official ILS pattern: `useParticipant(localId)` + `MediaStream([webcamStream.track]).toURL()` (fallback: `useMeeting().localWebcamStream`).
2. **`enableWebcam` only after join** — removed `changeWebcam` retries and `toggleWebcam` (they toggled webcam off).
3. **`WEBCAM_ENABLE_ONLY`** trace instead of `CHANGE_WEBCAM_RETRY`.
4. **`LOCAL_WEBCAM_STREAM_READY`** may show `hasParticipantTrack:true` even when `hasMeetingStream:false`.
5. **`WEBCAM_STATE`** includes `hasParticipantTrack` / `participantWebcamOn`.

In LOG, confirm `buildNote` **1.0.85** and look for **`LOCAL_WEBCAM_STREAM_READY`** then visible preview (not endless spinner).

## Build 1.0.84 (join + HLS; preview stuck)

1. **`VIDEOSDK_REGISTER_INIT`** / **`VIDEOSDK_REGISTER_SUCCESS`** — `register()` at app bootstrap ([`app/_layout.jsx`](app/_layout.jsx)).
2. **`@config-plugins/react-native-webrtc`** in [`app.json`](app.json) (rebuild native app required).
3. **`PREWARM_START`** / **`PREWARM_SUCCESS`** — VideoSDK `mediaDevices.getUserMedia` before `MeetingProvider`.
4. **`PERMISSIONS_BEFORE_PROVIDER`** — mic/camera granted before provider mount.
5. Host: `micEnabled:false`, `webcamEnabled:false`; **`PARTICIPANT_OVERRIDE_REMOVED`** (JWT still has `participantId`; omitted from provider config experiment).
6. No `multiStream` / `multistream` in config (SDK default).

In LOG, confirm sequence: register → prewarm → `TOKEN_OK` → `MEETING_JOINED` → `HLS_STARTED`. If `hasStream:false` while `on:true`, upgrade to **1.0.85**.

## Where to find logs on TestFlight (build 1.0.76+)

1. **Orange `LOG` button — top-right** (shows version under the label). The rest of the app stays fully tappable.
2. Tap **LOG** only when you need logs — then **Hide** or tap the dimmed area above the sheet to close.
3. On **Go Live / broadcast**, **Open VideoSDK logs** (top-left) opens the same sheet.
4. **Share** → paste into Notes or Messages.

**Build 1.0.75 and older:** LOG used a full-screen invisible layer that blocked the whole app. Upgrade to **1.0.76+**.

If you do **not** see orange **LOG v1.0.76** top-right, submit a new EAS build.

## Install build 1.0.76+

**Do not use Expo Go** for live/call testing — VideoSDK native code does not run there.

This build includes:

- Orange **LOG** in a **Modal** (stays above full-screen live UI on iOS)
- **Open VideoSDK logs** on the broadcast screen
- `EXPO_PUBLIC_VIDEOSDK_DEBUG_LOGS=1` in EAS production/preview profiles

## Root cause (VideoSDK dashboard Traces)

If Traces show **Loading Device Capabilities** failed with `device not supported`, use build **1.0.73+** (mic/camera off at join, enabled after `MEETING_JOINED`).

Verify in LOG panel: `MEETING_PROVIDER_MOUNT` with `"micEnabled":false,"webcamEnabled":false` (no multiStream field).

## What to look for in shared logs

| Log line | Meaning |
|----------|---------|
| `[S2_SDK][DEBUG_PANEL_READY]` | LOG UI mounted (should appear on app open) |
| `[S1_ROOM][SUCCESS]` | Room created on server |
| `[S2_SDK][TOKEN_OK]` | JWT validated |
| `[S2_SDK][MEETING_PROVIDER_MOUNT]` | SDK session started |
| `[S3_JOIN][REQUESTED]` | `join()` called |
| `[S3_JOIN][MEETING_JOINED]` | Host in room (required) |
| `[S3_JOIN][ENABLE_MIC_AFTER_JOIN]` | Mic publish started (400ms after join) |
| `[S3_JOIN][ENABLE_WEBCAM_AFTER_JOIN]` | Camera publish started (camera mode, ~900ms after join) |
| `[S3_JOIN][CHANGE_WEBCAM_AFTER_JOIN]` | Official ILS pattern — switches camera after join |
| `[S3_JOIN][CHANGE_WEBCAM_RETRY]` | Retries if `localWebcamStream` missing |
| `[S3_JOIN][LOCAL_WEBCAM_STREAM_READY]` | Preview can show (RTCView) |
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
