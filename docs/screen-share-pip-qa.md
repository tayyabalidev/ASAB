# Screen Share Host Camera PiP — QA Matrix & Store Disclosure

## Device QA matrix

| Platform | API / OS | Scenario | Expected result |
|----------|----------|----------|-----------------|
| Android | All | Start screen share, pick single app or entire screen | No crash; returns to broadcaster; share active |
| Android | All | Start screen share (XOS / Tecno / Infinix) | Must not crash when MediaProjection dialog opens — PiP must not enter on `onPause` |
| Android | API 31+ | Start screen share, open another app (game) | System PiP shows host camera bubble over the game |
| Android | API 34–35 | Background 5+ minutes | Screen share + camera still publishing; PiP visible |
| Android | All | Return to full app from PiP | Full broadcaster UI restores; stream continues |
| Android | All | Stop screen share from full app | PiP disabled; no PiP on next Home press |
| Android | All | End stream while in PiP | PiP stops; foreground service stops |
| iOS | 15.1–17.x | Start screen share, swipe Home / open game | System PiP shows **live** host camera (requires multitasking camera entitlement for continuous frames) |
| iOS | 18+ | Start screen share, swipe Home | System PiP shows host camera |
| iOS | All | Stop broadcast from Control Center | Screen share stops; PiP stops |
| iOS | Simulator | Any | PiP may be unavailable — test on physical device |

## Regression checks

- Viewers still receive screen + camera in HLS composite (GRID + PIN layout).
- In-app draggable camera bubble still works while ASAB is foreground.
- Feed video PiP on home tab is unaffected.
- 1:1 VideoSDK calls do not auto-enter screen-share PiP.

## Play Store disclosure (Android)

**Data safety / permissions**

- Foreground service (media projection): used while the host shares their screen during a live stream.
- Foreground service (camera/microphone): used to keep the host camera and mic active for viewers during live screen share.
- Picture-in-Picture: used so the host can see their camera preview while using other apps during an active screen-share session.

**Short user-facing explanation**

> While you screen share a live stream, ASAB can show your camera in a small floating window so you can check your framing while using other apps. Screen sharing stops when you end the stream or stop sharing.

## App Store disclosure (iOS)

**App Review notes**

- PiP is only offered during an active live screen-share session with camera enabled.
- Background modes `audio` and `voip` support ongoing WebRTC live publishing.
- If approved, `com.apple.developer.avfoundation.multitasking-camera-access` enables camera capture while PiP is active (see `docs/ios-multitasking-camera-entitlement.md`).

**Privacy nutrition / purpose strings**

- Camera: host self-preview in PiP during live screen share.
- Microphone: live stream audio while screen sharing.

## Build requirements

- Native rebuild required (not Expo Go).
- Android: `npx expo run:android` or EAS build after pulling these changes.
- iOS: EAS iOS build with `EXPO_APPLE_TEAM_ID`. Only set `EXPO_IOS_MULTITASKING_CAMERA_APPROVED=1` **after** Apple approves the entitlement and you regenerate provisioning profiles (see `docs/ios-multitasking-camera-entitlement.md`).
