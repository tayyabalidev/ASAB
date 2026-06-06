#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <ReplayKit/ReplayKit.h>

@interface VideosdkRPK : RCTEventEmitter <RCTBridgeModule>
@end

static void VideosdkRPKStartNotificationCallback(CFNotificationCenterRef center,
                                                 void *observer,
                                                 CFStringRef name,
                                                 const void *object,
                                                 CFDictionaryRef userInfo) {
  [[NSNotificationCenter defaultCenter] postNotificationName:@"START_BROADCAST" object:nil];
}

static void VideosdkRPKStopNotificationCallback(CFNotificationCenterRef center,
                                                void *observer,
                                                CFStringRef name,
                                                const void *object,
                                                CFDictionaryRef userInfo) {
  [[NSNotificationCenter defaultCenter] postNotificationName:@"STOP_BROADCAST" object:nil];
}

@implementation VideosdkRPK {
  NSString *_status;
}

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

- (instancetype)init {
  if (self = [super init]) {
    _status = @"Empty";

    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(startBroadcastCallback:)
                                                 name:@"START_BROADCAST"
                                               object:nil];
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(stopBroadcastCallback:)
                                                 name:@"STOP_BROADCAST"
                                               object:nil];

    CFNotificationCenterRef notificationCenter = CFNotificationCenterGetDarwinNotifyCenter();
    CFNotificationCenterAddObserver(
      notificationCenter,
      NULL,
      VideosdkRPKStartNotificationCallback,
      CFSTR("iOS_BroadcastStarted"),
      NULL,
      CFNotificationSuspensionBehaviorDeliverImmediately);
    CFNotificationCenterAddObserver(
      notificationCenter,
      NULL,
      VideosdkRPKStopNotificationCallback,
      CFSTR("iOS_BroadcastStopped"),
      NULL,
      CFNotificationSuspensionBehaviorDeliverImmediately);
  }
  return self;
}

- (void)dealloc {
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (NSArray<NSString *> *)supportedEvents {
  return @[@"onScreenShare"];
}

- (NSDictionary *)constantsToExport {
  return @{@"initialCount": _status ?: @"Empty"};
}

- (void)startBroadcastCallback:(NSNotification *)notification {
  _status = @"START_BROADCAST";
  [self sendEventWithName:@"onScreenShare" body:_status];
  _status = @"STARTED_BROADCASTING";
}

- (void)stopBroadcastCallback:(NSNotification *)notification {
  _status = @"STOP_BROADCAST";
  [self sendEventWithName:@"onScreenShare" body:_status];
  _status = @"Empty";
}

RCT_EXPORT_METHOD(startBroadcast) {
  dispatch_async(dispatch_get_main_queue(), ^{
    RPSystemBroadcastPickerView *pickerView =
      [[RPSystemBroadcastPickerView alloc] initWithFrame:CGRectMake(0, 0, 0, 0)];
    pickerView.translatesAutoresizingMaskIntoConstraints = NO;

    NSString *infoPlistExtensionName =
      [[NSBundle mainBundle] objectForInfoDictionaryKey:@"RTCScreenSharingExtensionName"];
    NSString *finalExtensionName =
      infoPlistExtensionName ?: @"org.reactjs.native.example.RNCodeSample";
    pickerView.preferredExtension = finalExtensionName;

    UIButton *tap = (UIButton *)pickerView.subviews.firstObject;
    if ([tap isKindOfClass:[UIButton class]]) {
      [tap sendActionsForControlEvents:UIControlEventTouchUpInside];
    }
  });
}

@end
