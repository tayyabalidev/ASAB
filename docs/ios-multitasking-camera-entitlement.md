# iOS Multitasking Camera Entitlement

Host camera Picture-in-Picture during screen share can use Apple's multitasking camera access entitlement on iOS 16 and 17. **Do not enable this in EAS until Apple has approved it for your App ID.**

## Request the entitlement

1. Sign in to [Apple Developer](https://developer.apple.com/contact/request/multitasking-camera-access/).
2. Submit the **Multitasking Camera Access** request for bundle ID `com.bilal.asab`.
3. Explain the use case: live screen sharing with a floating self-view camera preview (PiP) so hosts can see themselves while using other apps, similar to Google Meet or Zoom.

## Build without the entitlement (default)

iOS builds work **without** this entitlement. PiP UI compiles and runs; on **iOS 16–17** the system may refuse to show a **live camera** PiP bubble over other apps until Apple approves multitasking camera access. Screen share (ReplayKit) still works.

**Symptom without approval:** Screen share works in ASAB, in-app camera bubble works, but **no system PiP window** appears over games or Home.

**Important:** Remove `EXPO_IOS_MULTITASKING_CAMERA` from your EAS environment if you added it early. It is no longer used by the config plugin and is safe to delete.

## Enable in EAS builds (only after Apple approval)

After Apple approves the capability for `com.bilal.asab`:

1. In [expo.dev](https://expo.dev) → your project → **Environment variables**, add to the profiles you build with:

   ```bash
   EXPO_IOS_MULTITASKING_CAMERA_APPROVED=1
   ```

2. Regenerate iOS provisioning profiles so they include the new capability:

   ```bash
   eas credentials -p ios
   ```

   Choose to recreate the provisioning profile for `com.bilal.asab`, or clear credentials and let the next build regenerate them.

3. Run a new iOS build:

   ```bash
   eas build --platform ios --profile preview
   ```

The [`plugins/withIosHostCameraPip.js`](../plugins/withIosHostCameraPip.js) config plugin merges the entitlement only when `EXPO_IOS_MULTITASKING_CAMERA_APPROVED=1`.

## Troubleshooting: provisioning profile errors

If the build fails with:

- `doesn't support the Multitasking Camera Access capability`
- `doesn't include the com.apple.developer.avfoundation.multitasking-camera-access entitlement`

Then either:

- **Apple has not approved yet** — unset `EXPO_IOS_MULTITASKING_CAMERA_APPROVED` and rebuild, or
- **Apple approved but profiles are stale** — run `eas credentials -p ios` and regenerate profiles, then rebuild.

## iOS 18+

On iOS 18 and later, camera access during PiP may also use `AVCaptureSession.isMultitaskingCameraAccessEnabled`. WebRTC camera tracks published through VideoSDK should continue while the app is backgrounded when `UIBackgroundModes` includes `audio` and `voip` (already configured in `app.json`).

## App Review notes

Include in App Review notes:

- The app uses PiP only during an active live screen-share session.
- Camera and microphone are used for live broadcasting to viewers.
- PiP lets the host verify their camera framing while navigating other apps.
