import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Dimensions,
  InteractionManager,
  Platform,
  AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  MeetingProvider,
  useMeeting,
  useParticipant,
  RTCView,
  MediaStream,
  mediaDevices,
  ReactNativeForegroundService,
  createCameraVideoTrack,
  Constants,
} from '@videosdk.live/react-native-sdk';
import { VIDEOSDK_CONFIG, VIDEOSDK_TOKEN_SETUP_MESSAGE } from '../lib/config';
import {
  ensureCallMediaPermissions,
  getCallMediaPermissionSnapshot,
} from '../lib/videosdkMediaPermissions';
import { endLiveStream } from '../lib/livestream';
import { validateMeetingToken } from '../lib/videosdkTokenValidate';
import { mapLiveQualityToHls, mapLiveQualityToEncoderConfig } from '../lib/videosdkLiveQuality';
import {
  ensureAndroidSystemAudioCapture,
  invokeScreenShareEnable,
  invokeScreenShareToggle,
} from '../lib/videosdkScreenShare';
import { waitForMeetingJoinFn } from '../lib/videosdkHelper';
import VideosdkIosScreenShare from '../lib/videosdkIosScreenShare';
import LiveStreamChatOverlay from './LiveStreamChatOverlay';
import LiveStreamHeartReactions from './LiveStreamHeartReactions';
import LiveHostGuestControls from './LiveHostGuestControls';
import LiveRemoteRtcTiles from './LiveRemoteRtcTiles';

/** Minimal settle delays ΓÇö long waits add perceived lag before HLS is available to viewers. */
const IOS_PRE_JOIN_DELAY_MS = 80;
const ANDROID_PRE_JOIN_DELAY_MS = 200;
const ANDROID_POST_PREWARM_MS = 150;
const HLS_START_DELAY_MS = 80;
const MEDIA_PUBLISH_MIC_MS = Platform.OS === 'ios' ? 100 : 150;
const MEDIA_PUBLISH_MIC_TOGGLE_MS = Platform.OS === 'ios' ? 100 : 150;
const MEDIA_PUBLISH_WEBCAM_MS = Platform.OS === 'ios' ? 120 : 200;
const SCREEN_SHARE_AFTER_MIC_MS = Platform.OS === 'ios' ? 250 : 350;
const SCREEN_HLS_EXTRA_DELAY_MS = Platform.OS === 'ios' ? 200 : 300;
const SCREEN_SHARE_READY_TIMEOUT_MS = 60000;
const SCREEN_WEBCAM_RECOVERY_COOLDOWN_MS = 2500;
const SCREEN_WEBCAM_BACKGROUND_KEEPALIVE_MS = 6000;

let InCallManager = null;
try {
  InCallManager = require('@videosdk.live/react-native-incallmanager').default;
} catch (_) {
  InCallManager = null;
}

const { width, height } = Dimensions.get('window');
const TOKEN_ENDPOINT_HINT = `Token URL: ${VIDEOSDK_CONFIG.tokenServerUrl || 'missing'}${
  VIDEOSDK_CONFIG.tokenPath || ''
}`;

async function createHostCameraTrack(quality, facingMode = 'user') {
  const encoderConfig = mapLiveQualityToEncoderConfig(quality);
  const q = String(quality || 'auto').toLowerCase();
  const useHighBitrate = q === '1080p' || q === 'high';
  const bitrateMode = useHighBitrate
    ? Constants?.BitrateMode?.HIGH_QUALITY ??
      Constants?.BitrateMode?.high_quality ??
      'high_quality'
    : Constants?.BitrateMode?.BALANCED ??
      Constants?.BitrateMode?.balanced ??
      'balanced';
  return createCameraVideoTrack({
    optimizationMode: 'motion',
    encoderConfig,
    facingMode,
    multiStream: false,
    bitrateMode,
    maxLayer: 2,
  });
}

/**
 * Warm permissions on iOS. On Android, getUserMedia before join often leaves the camera
 * locked and VideoSDK reports meeting state FAILED ΓÇö use permission APIs only there.
 */
async function prewarmMedia(liveMode) {
  if (Platform.OS === 'android') {
    return;
  }
  try {
    const stream = await mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    stream?.getTracks()?.forEach((track) => {
      try {
        track.stop();
      } catch (_) {}
    });
  } catch (_) {}
}

/** VideoSDK may fire onMeetingJoined + localParticipant without a CONNECTED meeting-state event. */
function normalizeMeetingState(state) {
  const raw =
    typeof state === 'string'
      ? state
      : state?.status || state?.state || state?.meetingState || '';
  const upper = String(raw || '').trim().toUpperCase();
  if (upper === 'CONNECTED' || upper === 'MEETING_JOINED' || upper === 'JOINED') {
    return 'CONNECTED';
  }
  if (upper === 'CONNECTING' || upper === 'RECONNECTING') return 'CONNECTING';
  if (upper === 'DISCONNECTED' || upper === 'CLOSED' || upper === 'FAILED') return upper;
  return String(raw || 'INIT');
}

/** Tracks local webcam track without calling useParticipant with a fake id (crashes on Android). */
function HostLocalWebcamProbe({
  participantId,
  onTrackReady,
  onWebcamStreamDisabled,
  onWebcamMediaDisabled,
}) {
  const handleStreamDisabled = useCallback(
    (stream) => {
      if (stream?.kind === 'video') {
        onWebcamStreamDisabled?.({ forceRefresh: true });
      }
    },
    [onWebcamStreamDisabled]
  );
  const handleMediaStatusChanged = useCallback(
    (data) => {
      const kind = String(data?.kind || '').toLowerCase();
      const status = String(data?.newStatus || '').toLowerCase();
      if (kind === 'video' && (status === 'disabled' || status === 'off')) {
        onWebcamMediaDisabled?.({ forceRefresh: true });
      }
    },
    [onWebcamMediaDisabled]
  );
  const { webcamOn, webcamStream } = useParticipant(participantId, {
    onStreamDisabled: handleStreamDisabled,
    onMediaStatusChanged: handleMediaStatusChanged,
  });
  useEffect(() => {
    onTrackReady(Boolean(webcamOn && webcamStream?.track));
  }, [webcamOn, webcamStream?.track, onTrackReady]);
  return null;
}

/** Tracks local screen-share track for HLS start (needs real RTP, not just SDK flag). */
function HostScreenShareProbe({ participantId, onTrackReady }) {
  const { localScreenShareOn, localScreenShareStream } = useMeeting();
  const { screenShareOn, screenShareStream } = useParticipant(participantId);
  useEffect(() => {
    const hasTrack = Boolean(
      (localScreenShareOn && localScreenShareStream?.track) ||
        (screenShareOn && screenShareStream?.track)
    );
    onTrackReady(hasTrack);
  }, [
    localScreenShareOn,
    localScreenShareStream?.track,
    screenShareOn,
    screenShareStream?.track,
    onTrackReady,
  ]);
  return null;
}

function countRoomParticipants(participants, localParticipant) {
  const localId = localParticipant?.id;
  if (!localId) {
    return participants instanceof Map ? participants.size : 0;
  }
  if (!(participants instanceof Map) || participants.size === 0) return 1;
  return participants.has(localId) ? Math.max(1, participants.size) : participants.size + 1;
}

/** RN SDK may omit mode briefly after join; empty mode still means host with SEND_AND_RECV config. */
function isPublisherParticipantMode(mode) {
  const m = String(mode || '').trim().toUpperCase();
  if (!m) return true;
  return m === 'SEND_AND_RECV' || m === 'CONFERENCE' || m === 'SEND_RECV';
}

function resolveWebcamStreamUrl(participantWebcamStream, localWebcamStream) {
  try {
    if (participantWebcamStream?.track) {
      return new MediaStream([participantWebcamStream.track]).toURL();
    }
    if (localWebcamStream?.track) {
      return new MediaStream([localWebcamStream.track]).toURL();
    }
    if (participantWebcamStream && typeof participantWebcamStream.toURL === 'function') {
      return participantWebcamStream.toURL();
    }
    if (localWebcamStream && typeof localWebcamStream.toURL === 'function') {
      return localWebcamStream.toURL();
    }
  } catch (_) {
    return null;
  }
  return null;
}

function LocalPreviewInner({ liveMode, participantId, useFrontCamera = true }) {
  const { t } = useTranslation();
  const { localScreenShareOn, localWebcamOn, localWebcamStream } = useMeeting();
  const {
    screenShareOn,
    webcamOn: participantWebcamOn,
    webcamStream: participantWebcamStream,
  } = useParticipant(participantId);
  const webcamOn = participantWebcamOn ?? localWebcamOn;

  if (liveMode === 'screen') {
    const sharing = Boolean(localScreenShareOn || screenShareOn);
    const streamURL = resolveWebcamStreamUrl(participantWebcamStream, localWebcamStream);
    const showWebcamPip = sharing && Boolean(webcamOn && streamURL);

    if (!sharing) {
      return (
        <View style={styles.placeholder}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.placeholderText}>{t('liveBroadcast.screenSharePrompt')}</Text>
        </View>
      );
    }

    return (
      <View style={styles.screenShareHostRoot}>
        <View style={styles.screenShareHostBackdrop}>
          <Feather name="monitor" size={48} color="#a77df8" />
          <Text style={styles.screenShareActiveTitle}>{t('liveBroadcast.screenShareActive')}</Text>
          <Text style={styles.placeholderText}>{t('liveBroadcast.screenShareActiveHint')}</Text>
        </View>
        {showWebcamPip ? (
          <View style={styles.hostWebcamPip} pointerEvents="none">
            <RTCView
              streamURL={streamURL}
              style={styles.hostWebcamPipVideo}
              objectFit="cover"
              mirror={Boolean(useFrontCamera)}
              zOrder={2}
            />
          </View>
        ) : null}
      </View>
    );
  }

  const streamURL = resolveWebcamStreamUrl(participantWebcamStream, localWebcamStream);

  if (!webcamOn || !streamURL) {
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color="#fff" />
        <Text style={styles.placeholderText}>
          {webcamOn ? t('liveBroadcast.cameraLoading') : t('liveBroadcast.cameraStarting')}
        </Text>
      </View>
    );
  }

  // Match expo-camera Go Live preview: front camera is mirrored; back camera is not.
  const previewMirror = Boolean(useFrontCamera);

  return (
    <RTCView
      streamURL={streamURL}
      style={styles.video}
      objectFit="cover"
      mirror={previewMirror}
      zOrder={0}
    />
  );
}

function LocalPreview({ liveMode, localParticipantId, useFrontCamera }) {
  const { t } = useTranslation();
  if (!localParticipantId) {
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color="#fff" />
        <Text style={styles.placeholderText}>{t('liveBroadcast.cameraStarting')}</Text>
      </View>
    );
  }
  return (
    <LocalPreviewInner
      liveMode={liveMode}
      participantId={localParticipantId}
      useFrontCamera={useFrontCamera}
    />
  );
}

function BroadcasterMeetingInner({
  streamId,
  quality,
  liveMode,
  onStreamEnd,
  hlsStartedRef,
  tokenParticipantId,
  hostUserId,
  meetingParticipantId,
  roomDebug,
  hostDisplayName,
}) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [showChat, setShowChat] = useState(true);
  const [showGuests, setShowGuests] = useState(false);
  /** Tracks front vs back for preview mirroring (VideoSDK ILS: mirror only for local front). */
  const [useFrontCamera, setUseFrontCamera] = useState(true);
  const [phase, setPhase] = useState('joining');
  const [errorMessage, setErrorMessage] = useState(null);
  const [errorDetail, setErrorDetail] = useState(null);
  const [lastSdkState, setLastSdkState] = useState('INIT');
  const endedRef = useRef(false);
  const actionsRef = useRef({});
  const hlsStartTriggeredRef = useRef(false);
  const hlsStartTimerRef = useRef(null);
  const hlsStartAttemptRef = useRef(0);
  const cameraReadyRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const connectedOnceRef = useRef(false);
  const localParticipantRef = useRef(null);
  const pinAttemptedRef = useRef(false);
  const meetingJoinedRef = useRef(false);
  const joinRequestedRef = useRef(false);
  const joinStartedAtRef = useRef(0);
  const disconnectFatalTimerRef = useRef(null);
  const liveModeRef = useRef(liveMode);
  const qualityRef = useRef(quality);
  const useFrontCameraRef = useRef(true);
  const joinFnRef = useRef(null);
  const leaveFnRef = useRef(null);
  const enableMicFnRef = useRef(null);
  const enableWebcamFnRef = useRef(null);
  const changeWebcamFnRef = useRef(null);
  const flipInProgressRef = useRef(false);
  const lastFlipAtRef = useRef(0);
  const toggleMicFnRef = useRef(null);
  const startScreenShareFnRef = useRef(null);
  const enableScreenShareFnRef = useRef(null);
  const disableScreenShareFnRef = useRef(null);
  const toggleScreenShareFnRef = useRef(null);
  const screenSharePendingRef = useRef(false);
  const localScreenShareOnRef = useRef(false);
  const localWebcamOnRef = useRef(false);
  const localMicOnRef = useRef(false);
  const resumeAllStreamsFnRef = useRef(null);
  const disableWebcamFnRef = useRef(null);
  const ensureScreenLiveWebcamRef = useRef(null);
  const webcamRecoveryInFlightRef = useRef(false);
  const lastWebcamRecoveryAtRef = useRef(0);
  const appStateRef = useRef(AppState.currentState);
  const screenWebcamKeepaliveTimerRef = useRef(null);
  const mediaPublishAttemptedRef = useRef(false);
  const micReadyRef = useRef(false);
  const [meetingJoined, setMeetingJoined] = useState(false);
  const [joinPending, setJoinPending] = useState(false);
  const [screenShareError, setScreenShareError] = useState(null);
  const [screenShareTrackReady, setScreenShareTrackReady] = useState(false);

  useEffect(() => {
    liveModeRef.current = liveMode;
  }, [liveMode]);

  useEffect(() => {
    qualityRef.current = quality;
  }, [quality]);

  useEffect(() => {
    useFrontCameraRef.current = useFrontCamera;
  }, [useFrontCamera]);

  const stopMeeting = useCallback(async () => {
    const act = actionsRef.current;
    if (
      liveModeRef.current === 'screen' &&
      (localScreenShareOnRef.current || screenSharePendingRef.current)
    ) {
      const stopShareFns = [
        disableScreenShareFnRef.current,
        act.disableScreenShare,
        toggleScreenShareFnRef.current,
        act.toggleScreenShare,
      ].filter((fn) => typeof fn === 'function');
      for (const fn of stopShareFns) {
        try {
          await Promise.resolve(fn());
          break;
        } catch (_) {
          /* try next SDK entry point */
        }
      }
    }
    try {
      if (hlsStartedRef.current) {
        act.stopHls?.();
      }
    } catch (_) {}
    try {
      act.leave?.();
    } catch (_) {}
  }, [hlsStartedRef]);

  const finalizeEnd = useCallback(
    async (notifyUi) => {
      if (endedRef.current) return;
      endedRef.current = true;
      await stopMeeting();
      hlsStartedRef.current = false;
      try {
        await endLiveStream(streamId);
      } catch (_) {
        /* stream may already be ended server-side */
      }
      if (notifyUi) {
        onStreamEnd?.();
      }
    },
    [streamId, stopMeeting, onStreamEnd, hlsStartedRef]
  );

  const startScreenLivePlatformServices = useCallback(() => {
    if (Platform.OS === 'android' && ReactNativeForegroundService?.startAll) {
      try {
        ReactNativeForegroundService.startAll();
      } catch (_) {}
    }
    try {
      if (InCallManager && typeof InCallManager.start === 'function') {
        InCallManager.start({ media: 'video' });
      }
    } catch (_) {}
  }, []);

  const ensureScreenShareMicAndSystemAudio = useCallback(async () => {
    if (endedRef.current || liveModeRef.current !== 'screen') return;
    if (!localMicOnRef.current) {
      try {
        await Promise.resolve(enableMicFnRef.current?.());
      } catch (_) {}
      if (!localMicOnRef.current && typeof toggleMicFnRef.current === 'function') {
        try {
          await Promise.resolve(toggleMicFnRef.current());
        } catch (_) {}
      }
    }
    ensureAndroidSystemAudioCapture();
  }, []);

  const startHostScreenShare = useCallback(async () => {
    if (endedRef.current || liveModeRef.current !== 'screen') return;
    setScreenShareError(null);
    screenSharePendingRef.current = true;
    setScreenShareTrackReady(false);

    try {
      startScreenLivePlatformServices();

      if (Platform.OS === 'ios') {
        if (!VideosdkIosScreenShare.isAvailable) {
          throw new Error(t('liveBroadcast.screenShareUnavailable'));
        }
        await VideosdkIosScreenShare.startBroadcast();
        return;
      }

      const enableFns = [
        enableScreenShareFnRef.current,
        actionsRef.current.enableScreenShare,
      ].filter((fn) => typeof fn === 'function');
      let started = false;
      for (const fn of enableFns) {
        if (await invokeScreenShareEnable(fn)) {
          started = true;
          break;
        }
      }
      if (!started) {
        const toggleFns = [
          toggleScreenShareFnRef.current,
          actionsRef.current.toggleScreenShare,
        ].filter((fn) => typeof fn === 'function');
        for (const fn of toggleFns) {
          if (await invokeScreenShareToggle(fn)) {
            started = true;
            break;
          }
        }
      }
      if (!started) {
        throw new Error(t('liveBroadcast.screenShareStartFailed'));
      }

      await ensureScreenShareMicAndSystemAudio();

      await new Promise((r) => setTimeout(r, 800));
      if (!endedRef.current && screenSharePendingRef.current && !localScreenShareOnRef.current) {
        for (const fn of enableFns) {
          if (await invokeScreenShareEnable(fn)) {
            break;
          }
        }
        await ensureScreenShareMicAndSystemAudio();
      }
    } catch (err) {
      screenSharePendingRef.current = false;
      setScreenShareError(err?.message || t('liveBroadcast.screenShareDenied'));
    }
  }, [t, startScreenLivePlatformServices, ensureScreenShareMicAndSystemAudio]);

  const publishHostMediaAfterJoin = useCallback(async () => {
    if (mediaPublishAttemptedRef.current || endedRef.current) return;
    mediaPublishAttemptedRef.current = true;
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));

    if (liveModeRef.current === 'screen') {
      startScreenLivePlatformServices();
    }

    try {
      await delay(MEDIA_PUBLISH_MIC_MS);
      await Promise.resolve(enableMicFnRef.current?.());
      await delay(MEDIA_PUBLISH_MIC_TOGGLE_MS);
      if (!micReadyRef.current && typeof toggleMicFnRef.current === 'function') {
        await Promise.resolve(toggleMicFnRef.current());
      }
    } catch (e) {
    }

    if (liveModeRef.current === 'screen') {
      try {
        // Publish webcam while the app is foreground before MediaProjection / ReplayKit starts.
        await delay(MEDIA_PUBLISH_WEBCAM_MS);
        const facingMode = useFrontCameraRef.current ? 'user' : 'environment';
        try {
          const customTrack = await createHostCameraTrack(qualityRef.current, facingMode);
          await Promise.resolve(enableWebcamFnRef.current?.(customTrack));
        } catch (_) {
          await Promise.resolve(enableWebcamFnRef.current?.());
        }
        await delay(SCREEN_SHARE_AFTER_MIC_MS);
        await startHostScreenShare();
      } catch (err) {
        screenSharePendingRef.current = false;
        setScreenShareError(err?.message || t('liveBroadcast.screenShareDenied'));
      }
      return;
    }

    try {
      await delay(MEDIA_PUBLISH_WEBCAM_MS);
      const facingMode = useFrontCameraRef.current ? 'user' : 'environment';
      try {
        const customTrack = await createHostCameraTrack(qualityRef.current, facingMode);
        await Promise.resolve(enableWebcamFnRef.current?.(customTrack));
      } catch (_) {
        await Promise.resolve(enableWebcamFnRef.current?.());
      }
    } catch (e) {
    }
  }, [roomDebug, startHostScreenShare, startScreenLivePlatformServices, t]);

  const {
    join,
    leave,
    startHls,
    stopHls,
    enableMic,
    enableWebcam,
    disableWebcam,
    changeWebcam,
    toggleMic,
    startScreenShare,
    enableScreenShare,
    disableScreenShare,
    toggleScreenShare,
    resumeAllStreams,
    localWebcamOn,
    localWebcamStream,
    localMicOn,
    localScreenShareOn,
    localParticipant,
    participants,
    meetingId: sdkMeetingId,
  } = useMeeting({
    onMeetingJoined: () => {
      meetingJoinedRef.current = true;
      connectedOnceRef.current = true;
      setMeetingJoined(true);
      setLastSdkState('MEETING_JOINED');
      setPhase('live');
      publishHostMediaAfterJoin();
      // GRID + PIN: during screenshare, VideoSDK composites screen (main) + pinned webcams (side panel).
      try {
        const lp = localParticipantRef.current;
        if (lp && !pinAttemptedRef.current && typeof lp.pin === 'function') {
          lp.pin();
          pinAttemptedRef.current = true;
        }
      } catch (e) {
      }
    },
    onMeetingLeft: (data) => {
      const leftCode = data?.code != null ? Number(data.code) : null;
      const leftMessage = data?.message || data?.reason || null;
      if (!connectedOnceRef.current && (leftCode === 1103 || String(leftMessage || '').toLowerCase().includes('device not supported'))) {
        setErrorMessage('Could not join the live room (VideoSDK 1103)');
        setErrorDetail(
          leftMessage ||
            'Device capability check failed during join. Ensure mic/camera permissions and rebuild 1.0.82+.'
        );
        setPhase('error');
      }
    },
    onConnectionOpen: () => {
      connectedOnceRef.current = true;
      meetingJoinedRef.current = true;
      setMeetingJoined(true);
      setLastSdkState('CONNECTED');
      reconnectAttemptsRef.current = 0;
      try {
        const lp = localParticipantRef.current;
        if (lp && !pinAttemptedRef.current && typeof lp.pin === 'function') {
          lp.pin();
          pinAttemptedRef.current = true;
        }
      } catch (e) {
      }
    },
    onConnectionClose: (e) => {
    },
    onParticipantJoined: (p) => {
    },
    onParticipantLeft: (p) => {
    },
    onWebcamRequested: ({ accept }) => {
      accept?.();
    },
    onMicRequested: ({ accept }) => {
      accept?.();
    },
    onHlsStarted: (e) => {
      if (endedRef.current) return;
      hlsStartedRef.current = true;
      setPhase('live');
    },
    onHlsStopped: (e) => {
      hlsStartedRef.current = false;
    },
    onHlsStateChanged: (data) => {
      if (!data || endedRef.current) return;
      const statusText = String(data?.status || '');
      setLastSdkState(statusText);
      if (statusText === 'HLS_STARTED' || statusText === 'HLS_PLAYABLE') {
        hlsStartedRef.current = true;
        setPhase('live');
      }
      if (statusText.includes('FAILED') || statusText === 'HLS_REQUEST_FAILED') {
        setErrorMessage('HLS failed to start');
        setErrorDetail(
          data?.message || data?.error || data?.reason || JSON.stringify(data || {})
        );
        setPhase('error');
        // Allow the trigger effect to retry on next CONNECTED if user reconnects manually.
        hlsStartTriggeredRef.current = false;
      }
    },
    onMeetingStateChanged: (state) => {
      if (!state) return;
      const stateText = normalizeMeetingState(state);
      const stateReason =
        (typeof state === 'object' &&
          (state?.message || state?.reason || state?.error || state?.errorMessage)) ||
        null;
      setLastSdkState(stateText);

      if (stateText === 'CONNECTED') {
        connectedOnceRef.current = true;
        meetingJoinedRef.current = true;
        setMeetingJoined(true);
        reconnectAttemptsRef.current = 0;
        setPhase((current) => (current === 'error' ? current : 'live'));
        if (!mediaPublishAttemptedRef.current) {
          publishHostMediaAfterJoin();
        }
      }

      if (
        (stateText === 'DISCONNECTED' || stateText === 'FAILED') &&
        !endedRef.current
      ) {
        if (liveModeRef.current === 'screen' && screenSharePendingRef.current) {
          return;
        }

        const hadEstablishedSession = Boolean(connectedOnceRef.current);

        // Host never completed a stable join ΓÇö do not leave/rejoin loop (worsens iOS signaling).
        if (!hadEstablishedSession) {
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }
          reconnectAttemptsRef.current = 0;
          hlsStartTriggeredRef.current = false;
          pinAttemptedRef.current = false;
          meetingJoinedRef.current = false;
          setMeetingJoined(false);
          setJoinPending(false);
          const reasonLower = String(stateReason || '').toLowerCase();
          const deviceUnsupported = reasonLower.includes('device not supported');
          setErrorMessage(
            deviceUnsupported
              ? 'Camera not supported on this device for VideoSDK'
              : stateText === 'FAILED'
                ? 'Could not join the live room (SDK: FAILED). Start a new stream and confirm camera/mic permissions.'
                : 'Could not join the live room'
          );
          setErrorDetail(
            deviceUnsupported
              ? `VideoSDK: ${stateReason || 'device not supported'}. iPhone X and some iOS builds fail when the camera is enabled at join. Use build 1.0.72+ (camera enabled after join).`
              : (stateReason
                  ? `${stateReason}. `
                  : `VideoSDK ${stateText} before the host could stay in the room. `) +
                  'Start a NEW live stream (do not reuse an old room id). ' +
                  'Check camera/mic permissions and network (Wi-Fi or cellular). ' +
                  `Token URL: ${VIDEOSDK_CONFIG.tokenServerUrl || 'missing'}.`
          );
          setPhase('error');
          return;
        }

        if (stateText === 'FAILED') {
          setErrorMessage('Lost connection to the live room');
          setErrorDetail(stateReason || 'VideoSDK meeting state FAILED after join.');
          setPhase('error');
          return;
        }

        // Was in room ΓÇö allow reconnect retries only after a successful join.
        setMeetingJoined(false);
        meetingJoinedRef.current = false;
        if (disconnectFatalTimerRef.current) {
          clearTimeout(disconnectFatalTimerRef.current);
        }
        disconnectFatalTimerRef.current = setTimeout(() => {
          if (endedRef.current || meetingJoinedRef.current) return;
          setErrorMessage('Lost connection to the live room');
          setErrorDetail(
            'VideoSDK disconnected after join. Start a new live stream and check network permissions.'
          );
          setPhase('error');
        }, 4000);

        hlsStartTriggeredRef.current = false;
        pinAttemptedRef.current = false;

        const nextAttempt = reconnectAttemptsRef.current + 1;
        if (nextAttempt <= 4) {
          reconnectAttemptsRef.current = nextAttempt;
          const waitMs = nextAttempt === 1 ? 400 : nextAttempt * 1000;
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }
          reconnectTimerRef.current = setTimeout(() => {
            if (endedRef.current) return;
            (async () => {
              try {
                leaveFnRef.current?.();
                await new Promise((r) => setTimeout(r, 800));
                await new Promise((resolve) =>
                  InteractionManager.runAfterInteractions(() => resolve(undefined))
                );
                await new Promise((r) => setTimeout(r, 500));
                if (endedRef.current) return;
                joinFnRef.current?.();
              } catch (retryError) {
              }
            })();
          }, waitMs);
        } else {
          setErrorMessage('Could not join the live room');
          setErrorDetail(
            'VideoSDK disconnected before the host could stay in the room. Start a NEW live stream (do not reuse an old room id). ' +
              'Confirm videosdk-token is deployed (JWT: version 2, roomId, no roles) and ' +
              `token URL: ${VIDEOSDK_CONFIG.tokenServerUrl || 'missing'}.`
          );
          setPhase('error');
        }
      }
      if (stateText === 'CLOSED') {
        if (hlsStartTimerRef.current) {
          clearTimeout(hlsStartTimerRef.current);
          hlsStartTimerRef.current = null;
        }
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
        setErrorMessage(stateReason || 'Meeting closed by SDK');
        setErrorDetail(
          typeof state === 'object' ? JSON.stringify(state) : stateText || 'CLOSED'
        );
        setPhase('error');
      }
    },
    onError: (err) => {
      const code = Number(err?.code ?? err?.errorCode ?? 0);
      const sessionLive =
        connectedOnceRef.current && meetingJoinedRef.current && !endedRef.current;
      // 3044 often fires transiently after camera flip / ICE refresh while HLS is still fine.
      if (sessionLive && code === 3044) {
        return;
      }

      if (hlsStartTimerRef.current && !sessionLive) {
        clearTimeout(hlsStartTimerRef.current);
        hlsStartTimerRef.current = null;
      }
      const sdkMessage =
        err?.message || err?.reason || err?.error || err?.errorMessage || 'Meeting error';
      const deviceUnsupported = String(sdkMessage).toLowerCase().includes('device not supported');
      setErrorMessage(
        deviceUnsupported
          ? 'This device could not start camera/mic for live streaming (VideoSDK 1103)'
          : sdkMessage
      );
      setErrorDetail(
        deviceUnsupported
          ? `VideoSDK device not supported (1103). ${JSON.stringify(err || {})}`
          : JSON.stringify(err || {})
      );
      setPhase('error');
    },
  });

  actionsRef.current.stopHls = stopHls;
  actionsRef.current.leave = leave;
  actionsRef.current.join = join;
  actionsRef.current.startHls = startHls;
  actionsRef.current.enableMic = enableMic;
  actionsRef.current.enableWebcam = enableWebcam;
  actionsRef.current.changeWebcam = changeWebcam;
  actionsRef.current.startScreenShare = startScreenShare;
  actionsRef.current.enableScreenShare = enableScreenShare;
  actionsRef.current.disableScreenShare = disableScreenShare;
  actionsRef.current.toggleScreenShare = toggleScreenShare;
  startScreenShareFnRef.current = startScreenShare;
  enableScreenShareFnRef.current = enableScreenShare;
  disableScreenShareFnRef.current = disableScreenShare;
  toggleScreenShareFnRef.current = toggleScreenShare;
  resumeAllStreamsFnRef.current = resumeAllStreams;
  joinFnRef.current = join;
  leaveFnRef.current = leave;
  enableMicFnRef.current = enableMic;
  enableWebcamFnRef.current = enableWebcam;
  disableWebcamFnRef.current = disableWebcam;
  changeWebcamFnRef.current = changeWebcam;
  toggleMicFnRef.current = toggleMic;
  localParticipantRef.current = localParticipant || null;

  const localParticipantIdForMedia = localParticipant?.id || '';
  const [participantHasWebcamTrack, setParticipantHasWebcamTrack] = useState(false);

  const ensureScreenLiveWebcam = useCallback(async (options = {}) => {
    const forceRefresh = Boolean(options.forceRefresh);
    if (
      endedRef.current ||
      liveModeRef.current !== 'screen' ||
      !meetingJoinedRef.current ||
      webcamRecoveryInFlightRef.current
    ) {
      return;
    }
    const now = Date.now();
    if (
      !forceRefresh &&
      now - lastWebcamRecoveryAtRef.current < SCREEN_WEBCAM_RECOVERY_COOLDOWN_MS
    ) {
      return;
    }
    webcamRecoveryInFlightRef.current = true;
    lastWebcamRecoveryAtRef.current = now;
    try {
      startScreenLivePlatformServices();
      try {
        await Promise.resolve(resumeAllStreamsFnRef.current?.());
      } catch (_) {}

      const appBackgrounded = appStateRef.current !== 'active';
      const shouldRefreshTrack =
        forceRefresh || !localWebcamOnRef.current || appBackgrounded;

      if (shouldRefreshTrack) {
        if (localWebcamOnRef.current && typeof disableWebcamFnRef.current === 'function') {
          try {
            await Promise.resolve(disableWebcamFnRef.current());
            await new Promise((r) => setTimeout(r, 250));
          } catch (_) {}
        }
        const facingMode = useFrontCameraRef.current ? 'user' : 'environment';
        try {
          const customTrack = await createHostCameraTrack(qualityRef.current, facingMode);
          await Promise.resolve(enableWebcamFnRef.current?.(customTrack));
        } catch (_) {
          await Promise.resolve(enableWebcamFnRef.current?.());
        }
        try {
          const lp = localParticipantRef.current;
          if (lp && typeof lp.pin === 'function') {
            lp.pin();
            pinAttemptedRef.current = true;
          }
        } catch (_) {}
      }
    } catch (_) {
      /* best-effort recovery while screen sharing */
    } finally {
      webcamRecoveryInFlightRef.current = false;
    }
  }, [startScreenLivePlatformServices]);

  ensureScreenLiveWebcamRef.current = ensureScreenLiveWebcam;

  useEffect(() => {
    localMicOnRef.current = Boolean(localMicOn);
  }, [localMicOn]);

  useEffect(() => {
    localWebcamOnRef.current = Boolean(localWebcamOn);
  }, [localWebcamOn]);

  useEffect(() => {
    localScreenShareOnRef.current = Boolean(localScreenShareOn);
    if (localScreenShareOn) {
      screenSharePendingRef.current = false;
      setScreenShareError(null);
      ensureScreenShareMicAndSystemAudio();
      const lp = localParticipant || localParticipantRef.current;
      if (liveMode === 'screen' && lp && typeof lp.pin === 'function') {
        try {
          lp.pin();
          pinAttemptedRef.current = true;
        } catch (_) {}
      }
    }
  }, [localScreenShareOn, liveMode, localParticipant, ensureScreenShareMicAndSystemAudio]);

  useEffect(() => {
    if (liveMode !== 'screen' || Platform.OS !== 'ios') return undefined;
    const subscription = VideosdkIosScreenShare.addListener((event) => {
      if (event === 'START_BROADCAST') {
        Promise.resolve(invokeScreenShareToggle(toggleScreenShareFnRef.current))
          .then(() => ensureScreenShareMicAndSystemAudio())
          .then(() => ensureScreenLiveWebcamRef.current?.({ forceRefresh: true }))
          .catch(() => {});
      } else if (event === 'STOP_BROADCAST') {
        Promise.resolve(toggleScreenShareFnRef.current?.()).catch(() => {});
      }
    });
    return () => {
      VideosdkIosScreenShare.removeListener(subscription);
    };
  }, [liveMode]);

  useEffect(() => {
    if (liveMode !== 'screen' || !meetingJoined) return undefined;
    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      if (endedRef.current) return;
      if (nextState === 'active') {
        ensureScreenLiveWebcamRef.current?.({ forceRefresh: true });
        return;
      }
      if (nextState === 'background' || nextState === 'inactive') {
        ensureScreenLiveWebcamRef.current?.({ forceRefresh: true });
      }
    });
    return () => subscription.remove();
  }, [liveMode, meetingJoined]);

  useEffect(() => {
    if (liveMode !== 'screen' || !meetingJoined || !localScreenShareOn) {
      if (screenWebcamKeepaliveTimerRef.current) {
        clearInterval(screenWebcamKeepaliveTimerRef.current);
        screenWebcamKeepaliveTimerRef.current = null;
      }
      return undefined;
    }
    screenWebcamKeepaliveTimerRef.current = setInterval(() => {
      if (endedRef.current || appStateRef.current === 'active') return;
      ensureScreenLiveWebcamRef.current?.({ forceRefresh: true });
    }, SCREEN_WEBCAM_BACKGROUND_KEEPALIVE_MS);
    return () => {
      if (screenWebcamKeepaliveTimerRef.current) {
        clearInterval(screenWebcamKeepaliveTimerRef.current);
        screenWebcamKeepaliveTimerRef.current = null;
      }
    };
  }, [liveMode, meetingJoined, localScreenShareOn]);

  useEffect(() => {
    if (
      liveMode !== 'screen' ||
      !meetingJoined ||
      !localScreenShareOn ||
      participantHasWebcamTrack
    ) {
      return undefined;
    }
    const timer = setTimeout(() => {
      ensureScreenLiveWebcamRef.current?.({ forceRefresh: true });
    }, 1200);
    return () => clearTimeout(timer);
  }, [
    liveMode,
    meetingJoined,
    localScreenShareOn,
    participantHasWebcamTrack,
  ]);

  useEffect(() => {
    if (liveMode !== 'screen' || !localScreenShareOn || localMicOn) return undefined;
    ensureScreenShareMicAndSystemAudio();
    return undefined;
  }, [liveMode, localScreenShareOn, localMicOn, ensureScreenShareMicAndSystemAudio]);

  useEffect(() => {
    if (liveMode !== 'screen' || !meetingJoined || screenShareTrackReady || localScreenShareOn) {
      return undefined;
    }
    if (endedRef.current || screenShareError) return undefined;
    const timer = setTimeout(() => {
      if (
        endedRef.current ||
        screenShareTrackReady ||
        localScreenShareOnRef.current ||
        screenShareError
      ) {
        return;
      }
      screenSharePendingRef.current = false;
      setScreenShareError(t('liveBroadcast.screenShareTimeout'));
    }, SCREEN_SHARE_READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [
    liveMode,
    meetingJoined,
    screenShareTrackReady,
    localScreenShareOn,
    screenShareError,
    t,
  ]);

  const handleRetryScreenShare = useCallback(async () => {
    if (endedRef.current || liveMode !== 'screen') return;
    setScreenShareError(null);
    screenSharePendingRef.current = true;
    setScreenShareTrackReady(false);
    await startHostScreenShare();
  }, [liveMode, startHostScreenShare]);

  const handleStopScreenShare = useCallback(async () => {
    if (endedRef.current || liveMode !== 'screen' || !localScreenShareOnRef.current) return;
    const stopShareFns = [
      disableScreenShareFnRef.current,
      actionsRef.current.disableScreenShare,
      toggleScreenShareFnRef.current,
      actionsRef.current.toggleScreenShare,
    ].filter((fn) => typeof fn === 'function');
    for (const fn of stopShareFns) {
      try {
        await Promise.resolve(fn());
        break;
      } catch (_) {
        /* try next SDK entry point */
      }
    }
    setScreenShareTrackReady(false);
    screenSharePendingRef.current = false;
    setScreenShareError(t('liveBroadcast.screenShareStopped'));
  }, [liveMode, t]);

  const participantCount = countRoomParticipants(participants, localParticipant);

  const isBroadcasterMode = isPublisherParticipantMode(localParticipant?.mode);

  const signalingUp =
    meetingJoined &&
    lastSdkState !== 'DISCONNECTED' &&
    lastSdkState !== 'CLOSED' &&
    lastSdkState !== 'FAILED';

  const hostInRoom =
    signalingUp && Boolean(localParticipant?.id) && isBroadcasterMode;

  const hostCanPublish = hostInRoom;

  // Match VideoSDK dashboard: only show 1 after server-confirmed join (not joinPending alone).
  const displayParticipantCount = hostInRoom ? Math.max(1, participantCount) : 0;
  const participantPillLabel = hostInRoom
    ? String(displayParticipantCount)
    : joinPending
      ? '…'
      : '0';


  // Start HLS once the host is in-room and publishing audio/video (or screen+audio).
  useEffect(() => {
    if (endedRef.current) return undefined;
    if (!hostCanPublish) return undefined;
    if (hlsStartTriggeredRef.current) return undefined;

    const cameraVideoReady =
      Boolean(localWebcamOn && localWebcamStream) || participantHasWebcamTrack;
    const cameraAudioOnlyReady =
      liveMode === 'camera' && Boolean(localMicOn) && !cameraVideoReady;
    const producerReady =
      liveMode === 'screen'
        ? Boolean(
            localMicOn &&
              screenShareTrackReady &&
              (Boolean(localWebcamOn && localWebcamStream) || participantHasWebcamTrack)
          )
        : cameraVideoReady || cameraAudioOnlyReady;

    if (!producerReady) {
      return undefined;
    }

    hlsStartTriggeredRef.current = true;
    hlsStartAttemptRef.current += 1;
    const attempt = hlsStartAttemptRef.current;

    // Fallback pin: if onMeetingJoined fired before localParticipant was materialized,
    // pin now. GRID + PIN layout composites screenshare (main) and webcam (side panel).
    try {
      const lp = localParticipant || localParticipantRef.current;
      if (lp && !pinAttemptedRef.current && typeof lp.pin === 'function') {
        lp.pin();
        pinAttemptedRef.current = true;
      }
    } catch (e) {
    }

    // Tiny stabilization delay so the first RTP packet has been transmitted.
    const hlsDelay =
      liveMode === 'screen' ? HLS_START_DELAY_MS + SCREEN_HLS_EXTRA_DELAY_MS : HLS_START_DELAY_MS;

    hlsStartTimerRef.current = setTimeout(async () => {
      if (endedRef.current) return;
      try {
        const lp = localParticipant || localParticipantRef.current;
        if (liveMode === 'screen' && lp && typeof lp.pin === 'function') {
          try {
            lp.pin();
            pinAttemptedRef.current = true;
          } catch (_) {}
        }
        const isScreen = liveModeRef.current === 'screen';
        actionsRef.current.startHls?.({
          layout: isScreen
            ? { type: 'GRID', priority: 'PIN', gridSize: 4 }
            : { type: 'GRID', priority: 'SPEAKER', gridSize: 4 },
          theme: 'DARK',
          mode: 'video-and-audio',
          quality: mapLiveQualityToHls(quality),
          orientation: isScreen ? 'landscape' : 'portrait',
        });
      } catch (err) {
        setErrorMessage(err?.message || 'HLS start error');
        setPhase('error');
        hlsStartTriggeredRef.current = false;
      }
    }, hlsDelay);

    return () => {
      if (hlsStartTimerRef.current) {
        clearTimeout(hlsStartTimerRef.current);
        hlsStartTimerRef.current = null;
      }
    };
  }, [
    hostCanPublish,
    liveMode,
    localWebcamOn,
    localWebcamStream,
    localMicOn,
    localScreenShareOn,
    screenShareTrackReady,
    localParticipant,
    participantHasWebcamTrack,
    sdkMeetingId,
    roomDebug,
    streamId,
    quality,
  ]);

  useEffect(() => {
    const cameraReady =
      Boolean(localWebcamOn && localWebcamStream) || participantHasWebcamTrack;
    const wasReady = cameraReadyRef.current;
    cameraReadyRef.current = cameraReady;
    micReadyRef.current = Boolean(localMicOn);
    if (cameraReady && !wasReady) {
      setPhase((current) => (current === 'error' ? current : 'live'));
    }
  }, [localWebcamOn, localWebcamStream, localMicOn, participantHasWebcamTrack, liveMode]);

  // Join once ΓÇö permissions already granted before MeetingProvider (S2 gate).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let joinFn = joinFnRef.current;
        if (typeof joinFn !== 'function') {
          joinFn = await waitForMeetingJoinFn(() => joinFnRef.current, {
            isCancelled: () => cancelled,
            timeoutMs: 4000,
            intervalMs: 40,
          });
        }
        if (cancelled) return;
        if (!joinFn) {
          throw new Error('VideoSDK join() was not ready');
        }

        try {
          if (InCallManager && typeof InCallManager.start === 'function') {
            InCallManager.start({ media: 'video' });
          }
        } catch (incallErr) {
        }
        const preJoinDelay =
          Platform.OS === 'ios'
            ? IOS_PRE_JOIN_DELAY_MS
            : Platform.OS === 'android'
              ? ANDROID_PRE_JOIN_DELAY_MS
              : 0;
        if (preJoinDelay > 0) {
          await new Promise((r) => setTimeout(r, preJoinDelay));
          if (cancelled) return;
        }
        joinStartedAtRef.current = Date.now();
        joinRequestedRef.current = true;
        setJoinPending(true);
        await Promise.resolve(joinFn());
      } catch (e) {
        if (!cancelled) {
          setErrorMessage('Failed to join meeting');
          setPhase('error');
        }
      }
    })();
    return () => {
      cancelled = true;
      if (hlsStartTimerRef.current) {
        clearTimeout(hlsStartTimerRef.current);
        hlsStartTimerRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (disconnectFatalTimerRef.current) {
        clearTimeout(disconnectFatalTimerRef.current);
        disconnectFatalTimerRef.current = null;
      }
    };
  }, [liveMode, roomDebug]);

  // Leave only when the broadcast screen unmounts (not on join-effect re-run / Strict Mode).
  useEffect(() => {
    return () => {
      if (endedRef.current) return;
      if (hlsStartTimerRef.current) {
        clearTimeout(hlsStartTimerRef.current);
        hlsStartTimerRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (screenWebcamKeepaliveTimerRef.current) {
        clearInterval(screenWebcamKeepaliveTimerRef.current);
        screenWebcamKeepaliveTimerRef.current = null;
      }
      try {
        if (!connectedOnceRef.current && !joinRequestedRef.current) {
          return;
        }
        if (liveModeRef.current === 'screen' && localScreenShareOnRef.current) {
          const stopShareFns = [
            disableScreenShareFnRef.current,
            actionsRef.current.disableScreenShare,
          ].filter((fn) => typeof fn === 'function');
          for (const fn of stopShareFns) {
            try {
              Promise.resolve(fn()).catch(() => {});
              break;
            } catch (_) {}
          }
        }
        if (hlsStartedRef.current) actionsRef.current.stopHls?.();
        leaveFnRef.current?.();
        if (ReactNativeForegroundService?.stopAll) {
          try {
            ReactNativeForegroundService.stopAll();
          } catch (_) {}
        }
      } catch (_) {}
    };
  }, []);

  useEffect(() => {
    if (phase !== 'joining' || meetingJoined) return undefined;
    const t = setTimeout(() => {
      if (endedRef.current || meetingJoinedRef.current) return;
      setErrorMessage(
        `Could not join the live room (SDK: ${lastSdkState}). Start a new stream and confirm camera/mic permissions.`
      );
      setPhase((current) => (current === 'joining' ? 'error' : current));
    }, 45000);
    return () => clearTimeout(t);
  }, [phase, meetingJoined, lastSdkState]);

  const handleEndPress = () => {
    finalizeEnd(true);
  };

  const handleFlipCamera = useCallback(async () => {
    if (liveMode !== 'camera' || !meetingJoined || flipInProgressRef.current) return;
    const now = Date.now();
    if (now - lastFlipAtRef.current < 3500) return;

    flipInProgressRef.current = true;
    lastFlipAtRef.current = now;
    try {
      if (!localWebcamOn && enableWebcamFnRef.current) {
        const facingMode = useFrontCamera ? 'user' : 'environment';
        try {
          const customTrack = await createHostCameraTrack(qualityRef.current, facingMode);
          await Promise.resolve(enableWebcamFnRef.current(customTrack));
        } catch (_) {
          await Promise.resolve(enableWebcamFnRef.current());
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      await Promise.resolve(changeWebcamFnRef.current?.());
      setUseFrontCamera((prev) => !prev);
    } catch (_) {
      /* ignore ΓÇö stream may recover without blocking UI */
    } finally {
      setTimeout(() => {
        flipInProgressRef.current = false;
      }, 2000);
    }
  }, [liveMode, meetingJoined, localWebcamOn]);

  if (phase === 'error' && errorMessage) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>{errorMessage}</Text>
        {__DEV__ && errorDetail ? <Text style={styles.sub}>{errorDetail}</Text> : null}
        <TouchableOpacity style={styles.endBtn} onPress={handleEndPress}>
          <Text style={styles.endBtnText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {localParticipantIdForMedia ? (
        <>
          <HostLocalWebcamProbe
            participantId={localParticipantIdForMedia}
            onTrackReady={setParticipantHasWebcamTrack}
            onWebcamStreamDisabled={ensureScreenLiveWebcam}
            onWebcamMediaDisabled={ensureScreenLiveWebcam}
          />
          {liveMode === 'screen' ? (
            <HostScreenShareProbe
              participantId={localParticipantIdForMedia}
              onTrackReady={setScreenShareTrackReady}
            />
          ) : null}
        </>
      ) : null}
      <LocalPreview
        liveMode={liveMode}
        localParticipantId={localParticipant?.id}
        useFrontCamera={useFrontCamera}
      />
      <LiveRemoteRtcTiles excludeParticipantId={localParticipant?.id} />
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <View style={styles.topBarRow}>
          <View
            style={[
              styles.livePill,
              phase !== 'live' && !hostInRoom && styles.connectingPill,
              phase !== 'live' && hostInRoom && styles.inRoomPill,
            ]}
          >
            <View style={styles.dot} />
            <Text style={styles.liveText}>
              {phase === 'live'
                ? t('liveBroadcast.statusLive')
                : hostInRoom
                  ? t('liveBroadcast.statusInRoom')
                  : connectedOnceRef.current && lastSdkState === 'DISCONNECTED'
                    ? t('liveBroadcast.statusReconnecting')
                    : t('liveBroadcast.statusConnecting')}
            </Text>
          </View>
          <View style={styles.participantPill}>
            <Feather name="user" size={13} color="#fff" style={styles.participantPillIcon} />
            <Text style={styles.participantPillText}>{participantPillLabel}</Text>
          </View>
        </View>
      </View>
      {phase === 'joining' && (
        <View style={styles.banner}>
          <ActivityIndicator color="#fff" size="small" />
          <Text style={styles.bannerText}>{t('liveBroadcast.startingStream')}</Text>
        </View>
      )}
      {liveMode === 'screen' && screenShareError ? (
        <View style={[styles.screenShareErrorBanner, { top: insets.top + 56 }]}>
          <Text style={styles.screenShareErrorText}>{screenShareError}</Text>
          <View style={styles.screenShareErrorActions}>
            <TouchableOpacity style={styles.screenShareRetryBtn} onPress={handleRetryScreenShare}>
              <Text style={styles.screenShareRetryText}>{t('liveBroadcast.retry')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.screenShareEndBtn} onPress={handleEndPress}>
              <Text style={styles.screenShareEndText}>{t('liveBroadcast.endStream')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      <LiveHostGuestControls visible={showGuests} onClose={() => setShowGuests(false)} />

      {liveMode === 'camera' && meetingJoined ? (
        <TouchableOpacity
          style={[styles.sideFab, styles.sideFabLeft, { bottom: Math.max(insets.bottom, 16) + 88 }]}
          onPress={handleFlipCamera}
          activeOpacity={0.85}
          accessibilityLabel="Switch camera"
        >
          <Feather name="refresh-cw" size={22} color="#fff" />
        </TouchableOpacity>
      ) : null}
      {liveMode === 'screen' && meetingJoined && localScreenShareOn && !screenShareError ? (
        <TouchableOpacity
          style={[styles.sideFab, styles.sideFabLeft, { bottom: Math.max(insets.bottom, 16) + 88 }]}
          onPress={handleStopScreenShare}
          activeOpacity={0.85}
          accessibilityLabel="Stop screen sharing"
        >
          <Feather name="monitor" size={20} color="#fff" />
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        style={[styles.sideFab, styles.sideFabRight, { bottom: Math.max(insets.bottom, 16) + 88 }]}
        onPress={() => setShowChat((prev) => !prev)}
        activeOpacity={0.85}
        accessibilityLabel={showChat ? 'Hide chat' : 'Show chat'}
      >
        <Feather name="message-circle" size={22} color={showChat ? '#fff' : 'rgba(255,255,255,0.45)'} />
      </TouchableOpacity>
      <LiveStreamChatOverlay
        streamId={streamId}
        displayName={hostDisplayName || 'Host'}
        visible={showChat}
        bottomOffset={Math.max(insets.bottom, 16) + 72}
        compact={liveMode === 'screen'}
      />
      <LiveStreamHeartReactions
        streamId={streamId}
        isHost
        bottomOffset={Math.max(insets.bottom, 16) + 88}
      />
      <TouchableOpacity
        style={[styles.sideFab, styles.sideFabRight, { bottom: Math.max(insets.bottom, 16) + 152 }]}
        onPress={() => setShowGuests(true)}
        activeOpacity={0.85}
        accessibilityLabel="Manage guests"
      >
        <Feather name="users" size={20} color="#fff" />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.endStream, { bottom: Math.max(insets.bottom, 16) + 16 }]}
        onPress={handleEndPress}
      >
        <Text style={styles.endStreamText}>{t('liveBroadcast.endStream')}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function LiveStreamBroadcasterImpl({
  streamId,
  roomId,
  initialToken,
  hostUserId,
  hostDisplayName,
  quality = 'auto',
  liveMode = 'camera',
  onStreamEnd,
}) {
  const { t } = useTranslation();
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mediaPermissionsReady, setMediaPermissionsReady] = useState(false);
  const [mediaPermissionsError, setMediaPermissionsError] = useState(null);
  const [tokenError, setTokenError] = useState(null);
  const [tokenParticipantId, setTokenParticipantId] = useState(null);
  const hlsStartedRef = useRef(false);
  const validatedTokenRef = useRef('');
  // Host must always join using the real VideoSDK room id (not Appwrite stream id).
  const effectiveRoomId = typeof roomId === 'string' ? roomId.trim() : '';

  useEffect(() => {
    let cancelled = false;
    const prefilled = typeof initialToken === 'string' ? initialToken.trim() : '';
    if (prefilled && validatedTokenRef.current === prefilled && token) {
      return undefined;
    }

    setTokenError(null);
    if (!token) {
      setLoading(true);
    }

    const applyHostToken = (meetingToken) => {
      const validation = validateMeetingToken(meetingToken, effectiveRoomId, { requireMod: true });
      if (!validation.ok) {
        setTokenError(validation.error);
        return false;
      }
      const claims = validation.claims || {};
      if (validation.participantId) {
        setTokenParticipantId(validation.participantId);
      }
      validatedTokenRef.current = meetingToken;
      setToken(meetingToken);
      return true;
    };

    (async () => {
      try {
        if (!effectiveRoomId) {
          throw new Error(
            `Missing videosdkRoomId for host broadcast. streamId=${streamId || 'n/a'}, roomId=${
              roomId || 'n/a'
            }.`
          );
        }
        if (!prefilled) {
          throw new Error(
            'Missing host token from create-room-and-token response. Ensure backend returns both meetingId and token in one call.'
          );
        }
        if (cancelled) return;
        if (!applyHostToken(prefilled)) return;
      } catch (e) {
        if (!cancelled) setTokenError(e?.message || 'Token error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveRoomId, initialToken, streamId, roomId, token]);

  // Grant mic/camera before MeetingProvider mounts ΓÇö logs showed mic "undetermined" at provider init.
  useEffect(() => {
    if (!token || loading || !effectiveRoomId) {
      setMediaPermissionsReady(false);
      return undefined;
    }
    let cancelled = false;
    setMediaPermissionsError(null);
    setMediaPermissionsReady(false);
    (async () => {
      const permCallType = 'video';
      const before = await getCallMediaPermissionSnapshot(permCallType);
      if (cancelled) return;
      const ok = await ensureCallMediaPermissions(permCallType);
      if (cancelled) return;
      const after = await getCallMediaPermissionSnapshot(permCallType);
      if (!ok) {
        setMediaPermissionsError(
          liveMode === 'screen'
            ? 'Camera and microphone permissions are required for screen sharing.'
            : 'Camera and microphone permissions are required for live streaming.'
        );
        setMediaPermissionsReady(false);
        return;
      }
      await prewarmMedia(liveMode);
      if (cancelled) return;
      if (Platform.OS === 'android' && ANDROID_POST_PREWARM_MS > 0) {
        await new Promise((r) => setTimeout(r, ANDROID_POST_PREWARM_MS));
        if (cancelled) return;
      }
      setMediaPermissionsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [token, loading, effectiveRoomId, liveMode]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#a77df8" style={{ flex: 1 }} />
      </View>
    );
  }

  if (tokenError || mediaPermissionsError) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>{tokenError || mediaPermissionsError}</Text>
        <Text style={styles.sub}>
          Set EXPO_PUBLIC_VIDEOSDK_TOKEN_URL and EXPO_PUBLIC_VIDEOSDK_TOKEN_PATH correctly, then
          rebuild a native dev client.
          VideoSDK does not run in Expo Go.
        </Text>
        <Text style={styles.sub}>{TOKEN_ENDPOINT_HINT}</Text>
        <TouchableOpacity style={styles.endBtn} onPress={() => onStreamEnd?.()}>
          <Text style={styles.endBtnText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const authToken = token;
  // Only pass participantId when the JWT includes it. Minting without participantId but joining
  // with hostUserId causes CONNECTING -> DISCONNECTED on many VideoSDK deployments.
  const meetingParticipantId =
    typeof tokenParticipantId === 'string' && tokenParticipantId.trim()
      ? tokenParticipantId.trim()
      : undefined;

  if (!authToken) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>Missing VideoSDK token</Text>
        <TouchableOpacity style={styles.endBtn} onPress={() => onStreamEnd?.()}>
          <Text style={styles.endBtnText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!hostUserId || !effectiveRoomId) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>Missing host or videosdkRoomId</Text>
        <TouchableOpacity style={styles.endBtn} onPress={() => onStreamEnd?.()}>
          <Text style={styles.endBtnText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!mediaPermissionsReady) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#a77df8" style={{ flex: 1 }} />
        <Text style={styles.sub}>
          {liveMode === 'screen'
            ? t('liveBroadcast.preparingScreenBroadcast')
            : t('liveBroadcast.preparingCameraMic')}
        </Text>
      </View>
    );
  }

  const meetingConfig = {
    meetingId: effectiveRoomId,
    mode: 'SEND_AND_RECV',
    micEnabled: false,
    webcamEnabled: false,
    name: hostDisplayName || hostUserId || 'Host',
    debugMode: false,
    notification: {
      title: 'ASAB Live',
      message: 'You are live',
    },
    ...(meetingParticipantId ? { participantId: meetingParticipantId } : {}),
  };

  return (
    <MeetingProvider key={effectiveRoomId} config={meetingConfig} token={authToken}>
      <BroadcasterMeetingInner
        streamId={streamId}
        quality={quality}
        liveMode={liveMode}
        onStreamEnd={onStreamEnd}
        hlsStartedRef={hlsStartedRef}
        tokenParticipantId={tokenParticipantId}
        hostUserId={hostUserId}
        meetingParticipantId={meetingParticipantId}
        roomDebug={effectiveRoomId}
        hostDisplayName={hostDisplayName}
      />
    </MeetingProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  video: {
    width,
    height,
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
  },
  placeholderText: {
    color: '#aaa',
    marginTop: 12,
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 22,
  },
  screenShareActiveTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
    textAlign: 'center',
  },
  screenShareHostRoot: {
    flex: 1,
    backgroundColor: '#000',
  },
  hostWebcamPip: {
    position: 'absolute',
    right: 16,
    bottom: 128,
    width: 104,
    height: 148,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: '#111',
    zIndex: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  hostWebcamPipVideo: {
    width: '100%',
    height: '100%',
  },
  screenShareHostBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  participantPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  participantPillIcon: {
    marginRight: 6,
  },
  participantPillText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 71, 87, 0.95)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  connectingPill: {
    backgroundColor: 'rgba(80, 80, 90, 0.95)',
  },
  inRoomPill: {
    backgroundColor: 'rgba(46, 125, 50, 0.92)',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
    marginRight: 8,
  },
  liveText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 1,
  },
  banner: {
    position: 'absolute',
    bottom: 120,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingVertical: 12,
    borderRadius: 12,
  },
  bannerText: {
    color: '#fff',
    marginLeft: 10,
    fontSize: 15,
  },
  screenShareErrorBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 20,
    backgroundColor: 'rgba(120, 20, 20, 0.92)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  screenShareErrorText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  screenShareErrorActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  screenShareRetryBtn: {
    backgroundColor: '#a77df8',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  screenShareRetryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  screenShareEndBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  screenShareEndText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  sideFab: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 16,
  },
  sideFabLeft: {
    left: 16,
  },
  sideFabRight: {
    right: 16,
  },
  chatFabText: {
    fontSize: 22,
  },
  endStream: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 16,
    backgroundColor: '#F44336',
    paddingHorizontal: 36,
    paddingVertical: 14,
    borderRadius: 28,
  },
  endStreamText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#000',
  },
  err: {
    color: '#ff9800',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 12,
  },
  sub: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  endBtn: {
    backgroundColor: '#F44336',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
  },
  endBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
