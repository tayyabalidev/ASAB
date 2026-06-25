package com.bilal.asab.screenpip

import android.app.Activity
import android.app.PictureInPictureParams
import android.os.Build
import android.util.Rational
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule

object ScreenSharePipHelper {
  @Volatile
  var pipEnabled: Boolean = false

  @Volatile
  var allowHomePipEnter: Boolean = false

  @Volatile
  var mediaProjectionConsentInProgress: Boolean = false

  @Volatile
  private var reactContext: ReactApplicationContext? = null

  fun attachReactContext(context: ReactApplicationContext) {
    reactContext = context
  }

  fun detachReactContext() {
    reactContext = null
  }

  private fun canEnterPip(): Boolean {
    return pipEnabled && allowHomePipEnter && !mediaProjectionConsentInProgress
  }

  fun enterPip(activity: Activity): Boolean {
    if (!canEnterPip() || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return false
    }
    if (activity.isInPictureInPictureMode) {
      return true
    }
    return try {
      val paramsBuilder = PictureInPictureParams.Builder()
        .setAspectRatio(Rational(HOST_PIP_ASPECT_WIDTH, HOST_PIP_ASPECT_HEIGHT))
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        paramsBuilder.setAutoEnterEnabled(false)
        paramsBuilder.setSeamlessResizeEnabled(true)
      }
      val entered = activity.enterPictureInPictureMode(paramsBuilder.build())
      if (entered) {
        emitPipModeChanged(true)
      }
      entered
    } catch (_: Throwable) {
      false
    }
  }

  fun onUserLeaveHint(activity: Activity) {
    if (!canEnterPip() || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }
    if (activity.isInPictureInPictureMode) {
      return
    }
    enterPip(activity)
  }

  fun onPictureInPictureModeChanged(activity: Activity, isInPictureInPictureMode: Boolean) {
    emitPipModeChanged(isInPictureInPictureMode)
    if (!isInPictureInPictureMode && canEnterPip()) {
      applyPipParams(activity)
    }
  }

  fun setMediaProjectionConsentInProgress(inProgress: Boolean, activity: Activity?) {
    mediaProjectionConsentInProgress = inProgress
    if (inProgress) {
      allowHomePipEnter = false
    } else if (pipEnabled) {
      allowHomePipEnter = true
    }
    applyPipParams(activity)
  }

  fun setScreenSharePipArmed(activity: Activity?, enabled: Boolean) {
    pipEnabled = enabled
    allowHomePipEnter = enabled && !mediaProjectionConsentInProgress
    applyPipParams(activity)
  }

  private fun applyPipParams(activity: Activity?) {
    if (activity == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      return
    }
    try {
      val paramsBuilder = PictureInPictureParams.Builder()
        .setAspectRatio(Rational(HOST_PIP_ASPECT_WIDTH, HOST_PIP_ASPECT_HEIGHT))
        .setSeamlessResizeEnabled(true)
      // Manual PiP only — auto-enter races with MediaProjection consent on Android 12+.
      paramsBuilder.setAutoEnterEnabled(false)
      activity.setPictureInPictureParams(paramsBuilder.build())
    } catch (_: Throwable) {
      /* best-effort */
    }
  }

  private fun emitPipModeChanged(isInPipMode: Boolean) {
    val context = reactContext ?: return
    if (!context.hasActiveReactInstance()) {
      return
    }
    val payload = Arguments.createMap().apply {
      putBoolean("isInPipMode", isInPipMode)
    }
    context
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT_PIP_MODE_CHANGED, payload)
  }

  private const val HOST_PIP_ASPECT_WIDTH = 9
  private const val HOST_PIP_ASPECT_HEIGHT = 16
  const val EVENT_PIP_MODE_CHANGED = "ScreenSharePipModeChanged"
}
