#import <AVFoundation/AVFoundation.h>
#import <AVKit/AVKit.h>
#import <UIKit/UIKit.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <React/RCTUtils.h>
#import <WebRTC/RTCCVPixelBuffer.h>
#import <WebRTC/RTCI420Buffer.h>
#import <WebRTC/RTCMediaStream.h>
#import <WebRTC/RTCVideoFrame.h>
#import <WebRTC/RTCVideoRenderer.h>
#import <WebRTC/RTCVideoTrack.h>
#import "WebRTCModule.h"

static NSString *const kHostCameraPipModeChanged = @"HostCameraPipModeChanged";

static CVPixelBufferRef HostCameraPipCreatePixelBufferFromI420(id<RTCI420Buffer> i420) {
  const int width = i420.width;
  const int height = i420.height;
  if (width <= 0 || height <= 0) {
    return NULL;
  }

  CVPixelBufferRef pixelBuffer = NULL;
  NSDictionary *options = @{ (NSString *)kCVPixelBufferIOSurfacePropertiesKey : @{} };
  CVReturn status = CVPixelBufferCreate(
      kCFAllocatorDefault,
      width,
      height,
      kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
      (__bridge CFDictionaryRef)options,
      &pixelBuffer);
  if (status != kCVReturnSuccess || pixelBuffer == NULL) {
    return NULL;
  }

  CVPixelBufferLockBaseAddress(pixelBuffer, 0);
  uint8_t *dstY = (uint8_t *)CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0);
  const size_t dstYStride = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0);
  uint8_t *dstUV = (uint8_t *)CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 1);
  const size_t dstUVStride = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 1);

  const uint8_t *srcY = i420.dataY;
  const uint8_t *srcU = i420.dataU;
  const uint8_t *srcV = i420.dataV;
  const int srcYStride = i420.strideY;
  const int srcUStride = i420.strideU;
  const int srcVStride = i420.strideV;

  for (int row = 0; row < height; row++) {
    memcpy(dstY + row * dstYStride, srcY + row * srcYStride, (size_t)width);
  }

  const int chromaHeight = (height + 1) / 2;
  const int chromaWidth = (width + 1) / 2;
  for (int row = 0; row < chromaHeight; row++) {
    uint8_t *dstRow = dstUV + row * dstUVStride;
    const uint8_t *srcURow = srcU + row * srcUStride;
    const uint8_t *srcVRow = srcV + row * srcVStride;
    for (int col = 0; col < chromaWidth; col++) {
      dstRow[col * 2] = srcURow[col];
      dstRow[col * 2 + 1] = srcVRow[col];
    }
  }

  CVPixelBufferUnlockBaseAddress(pixelBuffer, 0);
  return pixelBuffer;
}

static CVPixelBufferRef HostCameraPipCopyPixelBufferFromFrame(RTCVideoFrame *frame) {
  id<RTCVideoFrameBuffer> buffer = frame.buffer;
  if ([buffer isKindOfClass:[RTCCVPixelBuffer class]]) {
    CVPixelBufferRef pixelBuffer = ((RTCCVPixelBuffer *)buffer).pixelBuffer;
    if (pixelBuffer != NULL) {
      CFRetain(pixelBuffer);
      return pixelBuffer;
    }
    return NULL;
  }

  RTCVideoFrame *i420Frame = [frame newI420VideoFrame];
  if (i420Frame == nil) {
    return NULL;
  }
  id<RTCI420Buffer> i420 = (id<RTCI420Buffer>)i420Frame.buffer;
  if (i420 == nil) {
    return NULL;
  }
  return HostCameraPipCreatePixelBufferFromI420(i420);
}

@interface HostCameraPipFrameRenderer : NSObject <RTCVideoRenderer>
@property(nonatomic, weak) AVSampleBufferDisplayLayer *displayLayer;
@property(nonatomic, assign) BOOL enabled;
@property(nonatomic, assign) BOOL mirror;
@property(nonatomic, assign) int64_t pipFrameIndex;
@end

@implementation HostCameraPipFrameRenderer

- (void)setMirror:(BOOL)mirror {
  _mirror = mirror;
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self.displayLayer != nil) {
      self.displayLayer.transform =
          mirror ? CATransform3DMakeScale(-1.0, 1.0, 1.0) : CATransform3DIdentity;
    }
  });
}

- (void)setSize:(CGSize)size {
  (void)size;
}

- (void)renderFrame:(RTCVideoFrame *)frame {
  if (!self.enabled || self.displayLayer == nil || frame == nil) {
    return;
  }

  CVPixelBufferRef pixelBuffer = HostCameraPipCopyPixelBufferFromFrame(frame);
  if (pixelBuffer == NULL) {
    return;
  }

  CMSampleBufferRef sampleBuffer = NULL;
  CMVideoFormatDescriptionRef formatDescription = NULL;
  OSStatus status = CMVideoFormatDescriptionCreateForImageBuffer(
      kCFAllocatorDefault, pixelBuffer, &formatDescription);
  if (status != noErr || formatDescription == NULL) {
    CVPixelBufferRelease(pixelBuffer);
    return;
  }

  CMSampleTimingInfo timing = {
      .duration = CMTimeMake(1, 30),
      .presentationTimeStamp = CMTimeMake(self.pipFrameIndex++, 30),
      .decodeTimeStamp = kCMTimeInvalid,
  };

  status = CMSampleBufferCreateReadyWithImageBuffer(
      kCFAllocatorDefault, pixelBuffer, formatDescription, &timing, &sampleBuffer);
  CFRelease(formatDescription);
  CVPixelBufferRelease(pixelBuffer);
  if (status != noErr || sampleBuffer == NULL) {
    return;
  }

  dispatch_async(dispatch_get_main_queue(), ^{
    if (!self.enabled || self.displayLayer == nil) {
      CFRelease(sampleBuffer);
      return;
    }
    if (self.displayLayer.status == AVQueuedSampleBufferRenderingStatusFailed) {
      [self.displayLayer flush];
    }
    if (!self.displayLayer.readyForMoreMediaData) {
      [self.displayLayer flush];
    }
    if (self.displayLayer.readyForMoreMediaData) {
      [self.displayLayer enqueueSampleBuffer:sampleBuffer];
    }
    CFRelease(sampleBuffer);
  });
}

@end

@interface HostCameraPipController : NSObject <AVPictureInPictureControllerDelegate>
@property(nonatomic, strong) UIView *sourceView;
@property(nonatomic, strong) AVPictureInPictureVideoCallViewController *pipVideoCallViewController;
@property(nonatomic, strong) AVSampleBufferDisplayLayer *displayLayer;
@property(nonatomic, strong) AVPictureInPictureController *pipController;
@property(nonatomic, strong) HostCameraPipFrameRenderer *frameRenderer;
@property(nonatomic, strong) RTCVideoTrack *videoTrack;
@property(nonatomic, assign) BOOL mirror;
@property(nonatomic, assign) BOOL enabled;
@property(nonatomic, copy) void (^modeChangedHandler)(BOOL isActive);
@end

@implementation HostCameraPipController

- (instancetype)init {
  self = [super init];
  if (self) {
    _enabled = NO;
    _mirror = YES;
    _sourceView = [[UIView alloc] initWithFrame:CGRectMake(0, 0, 2, 2)];
    _sourceView.userInteractionEnabled = NO;
    _sourceView.backgroundColor = UIColor.blackColor;
    _sourceView.alpha = 0.01;

    _pipVideoCallViewController = [[AVPictureInPictureVideoCallViewController alloc] init];
    _pipVideoCallViewController.preferredContentSize = CGSizeMake(180, 320);
    _pipVideoCallViewController.view.backgroundColor = UIColor.blackColor;

    _displayLayer = [[AVSampleBufferDisplayLayer alloc] init];
    _displayLayer.videoGravity = AVLayerVideoGravityResizeAspectFill;
    _displayLayer.frame = _pipVideoCallViewController.view.bounds;
    _displayLayer.needsDisplayOnBoundsChange = YES;
    [_pipVideoCallViewController.view.layer addSublayer:_displayLayer];

    _frameRenderer = [[HostCameraPipFrameRenderer alloc] init];
    _frameRenderer.displayLayer = _displayLayer;
    _frameRenderer.enabled = NO;
    _frameRenderer.pipFrameIndex = 0;
  }
  return self;
}

- (void)attachSourceViewToWindow {
  dispatch_async(dispatch_get_main_queue(), ^{
    UIWindow *window = RCTKeyWindow();
    if (window == nil) {
      return;
    }
    if (self.sourceView.superview == nil) {
      [window addSubview:self.sourceView];
    }
  });
}

- (void)detachSourceView {
  dispatch_async(dispatch_get_main_queue(), ^{
    [self.sourceView removeFromSuperview];
  });
}

- (BOOL)isPictureInPictureSupported {
  if (@available(iOS 15.0, *)) {
    return [AVPictureInPictureController isPictureInPictureSupported];
  }
  return NO;
}

- (void)setEnabled:(BOOL)enabled {
  _enabled = enabled;
  if (!enabled) {
    [self stop];
  } else {
    [self installBackgroundObservers];
  }
}

- (void)installBackgroundObservers {
  NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
  [center removeObserver:self name:UIApplicationWillResignActiveNotification object:nil];
  [center removeObserver:self name:UIApplicationDidEnterBackgroundNotification object:nil];
  [center addObserver:self
             selector:@selector(handleAppWillResignActive)
                 name:UIApplicationWillResignActiveNotification
               object:nil];
  [center addObserver:self
             selector:@selector(handleAppDidEnterBackground)
                 name:UIApplicationDidEnterBackgroundNotification
               object:nil];
}

- (void)removeBackgroundObservers {
  NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
  [center removeObserver:self name:UIApplicationWillResignActiveNotification object:nil];
  [center removeObserver:self name:UIApplicationDidEnterBackgroundNotification object:nil];
}

- (void)handleAppDidEnterBackground {
  if (!self.enabled) {
    return;
  }
  self.frameRenderer.enabled = YES;
  [self layoutDisplayLayer];
  [self enterPictureInPictureWithRetryCount:8];
}

- (void)layoutDisplayLayer {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self.displayLayer == nil || self.pipVideoCallViewController == nil) {
      return;
    }
    self.displayLayer.frame = self.pipVideoCallViewController.view.bounds;
  });
}

- (void)handleAppWillResignActive {
  if (!self.enabled) {
    return;
  }
  [self enterPictureInPictureWithRetryCount:8];
}

- (void)ensurePipController {
  if (@available(iOS 15.0, *)) {
    if (self.pipController != nil) {
      return;
    }
    [self attachSourceViewToWindow];

    AVPictureInPictureControllerContentSource *contentSource =
        [[AVPictureInPictureControllerContentSource alloc]
            initWithActiveVideoCallSourceView:self.sourceView
                       contentViewController:self.pipVideoCallViewController];

    self.pipController = [[AVPictureInPictureController alloc] initWithContentSource:contentSource];
    self.pipController.delegate = self;
    self.pipController.canStartPictureInPictureAutomaticallyFromInline = YES;

    if (@available(iOS 14.2, *)) {
      self.pipController.requiresLinearPlayback = YES;
    }
  }
}

- (BOOL)startWithVideoTrack:(RTCVideoTrack *)videoTrack mirror:(BOOL)mirror {
  if (!self.enabled || videoTrack == nil || ![self isPictureInPictureSupported]) {
    return NO;
  }

  [self stopRendererOnly];

  self.videoTrack = videoTrack;
  self.mirror = mirror;
  self.frameRenderer.mirror = mirror;
  self.frameRenderer.enabled = YES;
  self.frameRenderer.pipFrameIndex = 0;
  [videoTrack addRenderer:self.frameRenderer];

  [self ensurePipController];
  [self installBackgroundObservers];

  return self.pipController != nil;
}

- (BOOL)enterPictureInPicture {
  [self enterPictureInPictureWithRetryCount:8];
  if (@available(iOS 15.0, *)) {
    return self.pipController.isPictureInPictureActive;
  }
  return NO;
}

- (void)enterPictureInPictureWithRetryCount:(NSInteger)retryCount {
  if (@available(iOS 15.0, *)) {
    if (!self.enabled || self.pipController == nil) {
      return;
    }
    if (self.pipController.isPictureInPictureActive) {
      return;
    }
    if (self.pipController.isPictureInPicturePossible) {
      [self.pipController startPictureInPicture];
      return;
    }
    if (retryCount > 0) {
      dispatch_after(
          dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.25 * NSEC_PER_SEC)),
          dispatch_get_main_queue(),
          ^{
            [self enterPictureInPictureWithRetryCount:retryCount - 1];
          });
    }
  }
}

- (BOOL)refreshWithVideoTrack:(RTCVideoTrack *)videoTrack mirror:(BOOL)mirror {
  if (!self.enabled || videoTrack == nil) {
    return NO;
  }
  if (self.videoTrack == videoTrack && self.pipController != nil) {
    self.frameRenderer.enabled = YES;
    [self layoutDisplayLayer];
    return YES;
  }
  return [self startWithVideoTrack:videoTrack mirror:mirror];
}

- (void)stopRendererOnly {
  if (self.videoTrack != nil) {
    [self.videoTrack removeRenderer:self.frameRenderer];
    self.videoTrack = nil;
  }
  self.frameRenderer.enabled = NO;
  self.frameRenderer.pipFrameIndex = 0;
  [self.displayLayer flush];
}

- (void)stop {
  [self removeBackgroundObservers];
  if (@available(iOS 15.0, *)) {
    if (self.pipController != nil && self.pipController.isPictureInPictureActive) {
      [self.pipController stopPictureInPicture];
    }
    self.pipController = nil;
  }
  [self stopRendererOnly];
  [self detachSourceView];
  if (self.modeChangedHandler != nil) {
    self.modeChangedHandler(NO);
  }
}

#pragma mark - AVPictureInPictureControllerDelegate

- (void)pictureInPictureControllerDidStartPictureInPicture:
    (AVPictureInPictureController *)pictureInPictureController {
  self.frameRenderer.enabled = YES;
  [self layoutDisplayLayer];
  if (self.modeChangedHandler != nil) {
    self.modeChangedHandler(YES);
  }
}

- (void)pictureInPictureControllerDidStopPictureInPicture:
    (AVPictureInPictureController *)pictureInPictureController {
  if (self.enabled) {
    self.frameRenderer.enabled = YES;
  }
  if (self.modeChangedHandler != nil) {
    self.modeChangedHandler(NO);
  }
}

- (void)pictureInPictureController:(AVPictureInPictureController *)pictureInPictureController
    failedToStartPictureInPictureWithError:(NSError *)error {
  if (self.modeChangedHandler != nil) {
    self.modeChangedHandler(NO);
  }
}

@end

@interface HostCameraPip : RCTEventEmitter <RCTBridgeModule>
@property(nonatomic, strong) HostCameraPipController *controller;
@end

@implementation HostCameraPip

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

- (NSArray<NSString *> *)supportedEvents {
  return @[ kHostCameraPipModeChanged ];
}

- (instancetype)init {
  self = [super init];
  if (self) {
    _controller = [[HostCameraPipController alloc] init];
    __weak typeof(self) weakSelf = self;
    _controller.modeChangedHandler = ^(BOOL isActive) {
      [weakSelf sendEventWithName:kHostCameraPipModeChanged
                             body:@{@"isInPipMode" : @(isActive)}];
    };
  }
  return self;
}

- (WebRTCModule *)webrtcModule {
  return [self.bridge moduleForClass:[WebRTCModule class]];
}

- (RTCVideoTrack *)videoTrackForStreamURL:(NSString *)streamURL {
  if (streamURL.length == 0) {
    return nil;
  }
  WebRTCModule *webrtc = [self webrtcModule];
  if (webrtc == nil) {
    return nil;
  }
  RTCMediaStream *stream = [webrtc streamForReactTag:streamURL];
  if (stream == nil || stream.videoTracks.count == 0) {
    return nil;
  }
  return stream.videoTracks.firstObject;
}

RCT_EXPORT_METHOD(setHostCameraPipEnabled : (BOOL)enabled) {
  dispatch_async(dispatch_get_main_queue(), ^{
    self.controller.enabled = enabled;
    if (!enabled) {
      [self.controller stop];
    }
  });
}

RCT_EXPORT_METHOD(isPictureInPictureSupported : (RCTPromiseResolveBlock)resolve
                      rejecter : (RCTPromiseRejectBlock)reject) {
  resolve(@([self.controller isPictureInPictureSupported]));
}

RCT_EXPORT_METHOD(
    startHostCameraPip : (NSString *)streamURL mirror : (BOOL)mirror resolver : (RCTPromiseResolveBlock)
        resolve rejecter : (RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    RTCVideoTrack *track = [self videoTrackForStreamURL:streamURL];
    if (track == nil) {
      resolve(@(NO));
      return;
    }
    BOOL started = [self.controller startWithVideoTrack:track mirror:mirror];
    resolve(@(started));
  });
}

RCT_EXPORT_METHOD(enterHostCameraPip : (RCTPromiseResolveBlock)resolve rejecter : (RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    resolve(@([self.controller enterPictureInPicture]));
  });
}

RCT_EXPORT_METHOD(
    refreshHostCameraPip : (NSString *)streamURL mirror : (BOOL)mirror resolver : (RCTPromiseResolveBlock)
        resolve rejecter : (RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    RTCVideoTrack *track = [self videoTrackForStreamURL:streamURL];
    if (track == nil) {
      resolve(@(NO));
      return;
    }
    BOOL refreshed = [self.controller refreshWithVideoTrack:track mirror:mirror];
    resolve(@(refreshed));
  });
}

RCT_EXPORT_METHOD(stopHostCameraPip) {
  dispatch_async(dispatch_get_main_queue(), ^{
    [self.controller stop];
  });
}

@end
