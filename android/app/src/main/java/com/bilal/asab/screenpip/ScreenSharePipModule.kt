package com.bilal.asab.screenpip

import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = ScreenSharePipModule.NAME)
class ScreenSharePipModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  override fun initialize() {
    super.initialize()
    ScreenSharePipHelper.attachReactContext(reactApplicationContext)
  }

  override fun invalidate() {
    ScreenSharePipHelper.detachReactContext()
    super.invalidate()
  }

  @ReactMethod
  fun setScreenSharePipEnabled(enabled: Boolean) {
    ScreenSharePipHelper.setScreenSharePipArmed(
      reactApplicationContext.currentActivity,
      enabled
    )
  }

  @ReactMethod
  fun setMediaProjectionConsentInProgress(inProgress: Boolean) {
    ScreenSharePipHelper.setMediaProjectionConsentInProgress(
      inProgress,
      reactApplicationContext.currentActivity
    )
  }

  @ReactMethod
  fun enterPip(promise: Promise) {
    val activity: Activity? = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.resolve(false)
      return
    }
    promise.resolve(ScreenSharePipHelper.enterPip(activity))
  }

  @ReactMethod
  fun isPictureInPictureSupported(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      promise.resolve(false)
      return
    }
    val supported =
      reactApplicationContext.packageManager.hasSystemFeature(
        PackageManager.FEATURE_PICTURE_IN_PICTURE
      )
    promise.resolve(supported)
  }

  companion object {
    const val NAME = "ScreenSharePip"
  }
}
