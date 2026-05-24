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
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import {
  MeetingProvider,
  useMeeting,
  useParticipant,
  RTCView,
  MediaStream,
  mediaDevices,
} from '@videosdk.live/react-native-sdk';
import { VIDEOSDK_CONFIG, VIDEOSDK_TOKEN_SETUP_MESSAGE } from '../lib/config';
import {
  ensureCallMediaPermissions,
  getCallMediaPermissionSnapshot,
} from '../lib/videosdkMediaPermissions';
import { endLiveStream } from '../lib/livestream';
import { validateMeetingToken } from '../lib/videosdkTokenValidate';
import { waitForMeetingJoinFn } from '../lib/videosdkHelper';
import LiveMeetingChat from './LiveMeetingChat';
import LiveHostGuestControls from './LiveHostGuestControls';
import LiveRemoteRtcTiles from './LiveRemoteRtcTiles';

/** Tunable delays — keep small; join/media publish flow is stability-sensitive. */
const IOS_PRE_JOIN_DELAY_MS = 200;
const ANDROID_PRE_JOIN_DELAY_MS = 500;
const ANDROID_POST_PREWARM_MS = 350;
const HLS_START_DELAY_MS = 200;
const MEDIA_PUBLISH_MIC_MS = 250;
const MEDIA_PUBLISH_MIC_TOGGLE_MS = 250;
const MEDIA_PUBLISH_WEBCAM_MS = 350;
const SCREEN_SHARE_AFTER_MIC_MS = 500;
const SCREEN_HLS_EXTRA_DELAY_MS = 600;

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

/**
 * Warm permissions on iOS. On Android, getUserMedia before join often leaves the camera
 * locked and VideoSDK reports meeting state FAILED — use permission APIs only there.
 */
async function prewarmMedia(liveMode) {
  if (Platform.OS === 'android') {
    return;
  }
  try {
    const stream = await mediaDevices.getUserMedia({
      audio: true,
      video: liveMode !== 'screen',
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

function LocalPreviewInner({ liveMode, participantId, mirrorFrontCamera = true }) {
  const { localWebcamOn, localWebcamStream } = useMeeting();
  const {
    webcamOn: participantWebcamOn,
    webcamStream: participantWebcamStream,
    screenShareOn,
    screenShareStream,
  } = useParticipant(participantId);
  const webcamOn = participantWebcamOn ?? localWebcamOn;

  if (liveMode === 'screen') {
    let screenUrl = null;
    try {
      if (screenShareOn && screenShareStream?.track) {
        screenUrl = new MediaStream([screenShareStream.track]).toURL();
      } else if (screenShareStream && typeof screenShareStream.toURL === 'function') {
        screenUrl = screenShareStream.toURL();
      }
    } catch (_) {
      screenUrl = null;
    }
    if (screenUrl) {
      return (
        <RTCView
          streamURL={screenUrl}
          style={styles.video}
          objectFit="contain"
          mirror={false}
          zOrder={0}
        />
      );
    }
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color="#fff" />
        <Text style={styles.placeholderText}>
          Approve screen capture when prompted, then your screen will appear here…
        </Text>
      </View>
    );
  }

  let streamURL = null;
  try {
    if (localWebcamStream && typeof localWebcamStream.toURL === 'function') {
      streamURL = localWebcamStream.toURL();
    } else if (participantWebcamStream?.track) {
      streamURL = new MediaStream([participantWebcamStream.track]).toURL();
    } else if (
      participantWebcamStream &&
      typeof participantWebcamStream.toURL === 'function'
    ) {
      streamURL = participantWebcamStream.toURL();
    }
  } catch (_) {
    streamURL = null;
  }

  if (!webcamOn || !streamURL) {
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color="#fff" />
        <Text style={styles.placeholderText}>
          {webcamOn ? 'Camera stream loading…' : 'Camera starting…'}
        </Text>
      </View>
    );
  }

  return (
    <RTCView
      streamURL={streamURL}
      style={styles.video}
      objectFit="cover"
      mirror={mirrorFrontCamera}
      zOrder={0}
    />
  );
}

function LocalPreview({ liveMode, localParticipantId, mirrorFrontCamera }) {
  if (!localParticipantId) {
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color="#fff" />
        <Text style={styles.placeholderText}>Camera starting…</Text>
      </View>
    );
  }
  return (
    <LocalPreviewInner
      liveMode={liveMode}
      participantId={localParticipantId}
      mirrorFrontCamera={mirrorFrontCamera}
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
  const [showChat, setShowChat] = useState(false);
  const [showGuests, setShowGuests] = useState(false);
  /** Front camera preview uses mirror=true (natural selfie); back camera uses false. */
  const [mirrorFrontCamera, setMirrorFrontCamera] = useState(true);
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
  const joinFnRef = useRef(null);
  const leaveFnRef = useRef(null);
  const enableMicFnRef = useRef(null);
  const enableWebcamFnRef = useRef(null);
  const changeWebcamFnRef = useRef(null);
  const flipInProgressRef = useRef(false);
  const lastFlipAtRef = useRef(0);
  const toggleMicFnRef = useRef(null);
  const toggleScreenShareFnRef = useRef(null);
  const startScreenShareFnRef = useRef(null);
  const mediaPublishAttemptedRef = useRef(false);
  const micReadyRef = useRef(false);
  const [meetingJoined, setMeetingJoined] = useState(false);
  const [joinPending, setJoinPending] = useState(false);

  useEffect(() => {
    liveModeRef.current = liveMode;
  }, [liveMode]);

  const stopMeeting = useCallback(() => {
    const act = actionsRef.current;
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
      stopMeeting();
      hlsStartedRef.current = false;
      try {
        await endLiveStream(streamId);
      } catch (e) {
        console.warn('endLiveStream', e);
      }
      if (notifyUi) {
        onStreamEnd?.();
      }
    },
    [streamId, stopMeeting, onStreamEnd, hlsStartedRef]
  );

  const publishHostMediaAfterJoin = useCallback(async () => {
    if (mediaPublishAttemptedRef.current || endedRef.current) return;
    mediaPublishAttemptedRef.current = true;
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));

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
        await delay(SCREEN_SHARE_AFTER_MIC_MS);
        const startScreen =
          toggleScreenShareFnRef.current ||
          startScreenShareFnRef.current ||
          actionsRef.current.startScreenShare ||
          actionsRef.current.enableScreenShare;
        if (typeof startScreen === 'function') {
          await Promise.resolve(startScreen());
        }
      } catch (_) {
        /* user may deny MediaProjection — HLS will not start until share is on */
      }
      return;
    }

    try {
      await delay(MEDIA_PUBLISH_WEBCAM_MS);
      await Promise.resolve(enableWebcamFnRef.current?.());
    } catch (e) {
    }
  }, [roomDebug]);

  const {
    join,
    leave,
    startHls,
    stopHls,
    enableMic,
    enableWebcam,
    changeWebcam,
    toggleMic,
    startScreenShare,
    enableScreenShare,
    toggleScreenShare,
    localWebcamOn,
    localWebcamStream,
    localMicOn,
    localScreenShareOn,
    presenterId,
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
      // SPOTLIGHT + priority:'PIN' HLS layout only renders pinned participants.
      // Without this pin, HLS has nothing to composite and the pipeline rejects/empties.
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
        const hadEstablishedSession = Boolean(connectedOnceRef.current);

        // Host never completed a stable join — do not leave/rejoin loop (worsens iOS signaling).
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
                  'Check camera/mic permissions and network (Wi‑Fi or cellular). ' +
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

        // Was in room — allow reconnect retries only after a successful join.
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
  toggleScreenShareFnRef.current = toggleScreenShare;
  startScreenShareFnRef.current = startScreenShare;
  joinFnRef.current = join;
  leaveFnRef.current = leave;
  enableMicFnRef.current = enableMic;
  enableWebcamFnRef.current = enableWebcam;
  changeWebcamFnRef.current = changeWebcam;
  toggleMicFnRef.current = toggleMic;
  localParticipantRef.current = localParticipant || null;

  const localParticipantIdForMedia = localParticipant?.id || '';
  const {
    webcamOn: participantWebcamOn,
    webcamStream: participantWebcamStream,
  } = useParticipant(localParticipantIdForMedia || '__asab_pending__');

  const participantHasWebcamTrack = Boolean(
    participantWebcamOn && participantWebcamStream?.track
  );

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
        ? Boolean(localMicOn && localScreenShareOn)
        : cameraVideoReady || cameraAudioOnlyReady;

    if (!producerReady) {
      return undefined;
    }

    hlsStartTriggeredRef.current = true;
    hlsStartAttemptRef.current += 1;
    const attempt = hlsStartAttemptRef.current;

    // Fallback pin: if onMeetingJoined fired before localParticipant was materialized,
    // pin now. SPOTLIGHT + PIN layout requires at least one pinned participant.
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
            ? { type: 'SPOTLIGHT', priority: 'PIN', gridSize: 1 }
            : { type: 'GRID', priority: 'SPEAKER', gridSize: 4 },
          theme: 'DARK',
          mode: 'video-and-audio',
          quality: 'high',
          orientation: 'portrait',
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
    localParticipant,
    participantHasWebcamTrack,
    sdkMeetingId,
    roomDebug,
    streamId,
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

  // Join once — permissions already granted before MeetingProvider (S2 gate).
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
            InCallManager.start({ media: liveMode === 'screen' ? 'audio' : 'video' });
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
      try {
        if (!connectedOnceRef.current && !joinRequestedRef.current) {
          return;
        }
        if (hlsStartedRef.current) actionsRef.current.stopHls?.();
        leaveFnRef.current?.();
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
        await Promise.resolve(enableWebcamFnRef.current());
        await new Promise((r) => setTimeout(r, 400));
      }
      await Promise.resolve(changeWebcamFnRef.current?.());
    } catch (_) {
      /* ignore — stream may recover without blocking UI */
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
      <LocalPreview
        liveMode={liveMode}
        localParticipantId={localParticipant?.id}
        mirrorFrontCamera={mirrorFrontCamera}
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
                ? 'LIVE'
                : hostInRoom
                  ? 'IN ROOM'
                  : connectedOnceRef.current && lastSdkState === 'DISCONNECTED'
                    ? 'RECONNECTING'
                    : 'CONNECTING'}
            </Text>
          </View>
          <View style={styles.participantPill}>
            <Text style={styles.participantPillText}>
              👤 {participantPillLabel}
            </Text>
          </View>
        </View>
      </View>
      {phase === 'joining' && (
        <View style={styles.banner}>
          <ActivityIndicator color="#fff" size="small" />
          <Text style={styles.bannerText}> Starting stream…</Text>
        </View>
      )}
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
      <TouchableOpacity
        style={[styles.sideFab, styles.sideFabRight, { bottom: Math.max(insets.bottom, 16) + 88 }]}
        onPress={() => setShowChat(true)}
        activeOpacity={0.85}
        accessibilityLabel="Open chat"
      >
        <Text style={styles.chatFabText}>💬</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.sideFab, styles.sideFabRight, { bottom: Math.max(insets.bottom, 16) + 152 }]}
        onPress={() => setShowGuests(true)}
        activeOpacity={0.85}
        accessibilityLabel="Manage guests"
      >
        <Feather name="users" size={20} color="#fff" />
      </TouchableOpacity>

      <Modal visible={showChat} animationType="slide" transparent onRequestClose={() => setShowChat(false)}>
        <View style={styles.chatModal}>
          <View style={styles.chatModalHeader}>
            <Text style={styles.chatModalTitle}>Live chat</Text>
            <TouchableOpacity onPress={() => setShowChat(false)} hitSlop={12}>
              <Text style={styles.chatModalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <LiveMeetingChat displayName={hostDisplayName || 'Host'} showRaiseHand={false} />
        </View>
      </Modal>

      <TouchableOpacity
        style={[styles.endStream, { bottom: Math.max(insets.bottom, 16) + 16 }]}
        onPress={handleEndPress}
      >
        <Text style={styles.endStreamText}>End stream</Text>
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
        if (__DEV__) {
          console.log('[LiveBroadcast] host token ready', {
            streamId: streamId || null,
            roomId: effectiveRoomId,
          });
        }
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

  // Grant mic/camera before MeetingProvider mounts — logs showed mic "undetermined" at provider init.
  useEffect(() => {
    if (!token || loading || !effectiveRoomId) {
      setMediaPermissionsReady(false);
      return undefined;
    }
    let cancelled = false;
    setMediaPermissionsError(null);
    setMediaPermissionsReady(false);
    (async () => {
      const permCallType = liveMode === 'screen' ? 'audio' : 'video';
      const before = await getCallMediaPermissionSnapshot(permCallType);
      if (cancelled) return;
      const ok = await ensureCallMediaPermissions(permCallType);
      if (cancelled) return;
      const after = await getCallMediaPermissionSnapshot(permCallType);
      if (!ok) {
        setMediaPermissionsError(
          liveMode === 'screen'
            ? 'Microphone permission is required for live streaming.'
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
        <Text style={styles.sub}>Preparing camera and microphone…</Text>
      </View>
    );
  }

  const meetingConfig = {
    meetingId: effectiveRoomId,
    mode: 'SEND_AND_RECV',
    micEnabled: false,
    webcamEnabled: false,
    name: hostDisplayName || hostUserId || 'Host',
    debugMode: __DEV__,
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
  chatModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    marginTop: height * 0.28,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  chatModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.15)',
  },
  chatModalTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  chatModalClose: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
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
