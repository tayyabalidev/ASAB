/**
 * Lazy-load screen-share PiP native bridges so camera live does not touch
 * HostCameraPip / ScreenSharePip modules during MeetingProvider startup.
 */
let pipModule = null;

export function getScreenSharePipModule() {
  if (!pipModule) {
    pipModule = require('./screenSharePip');
  }
  return pipModule;
}
