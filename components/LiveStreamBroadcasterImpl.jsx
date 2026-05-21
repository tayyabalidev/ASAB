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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MeetingProvider, useMeeting, RTCView } from '@videosdk.live/react-native-sdk';
import * as Device from 'expo-device';
import { VIDEOSDK_CONFIG, VIDEOSDK_TOKEN_SETUP_MESSAGE } from '../lib/config';
import { ensureCallMediaPermissions } from '../lib/videosdkMediaPermissions';
import { endLiveStream } from '../lib/livestream';
import { validateMeetingToken } from '../lib/videosdkTokenValidate';
import { waitForMeetingJoinFn } from '../lib/videosdkHelper';
import { videosdkTrace, videosdkTraceMirror } from '../lib/videosdkTrace';

const { width, height } = Dimensions.get('window');
const TOKEN_ENDPOINT_HINT = `Token URL: ${VIDEOSDK_CONFIG.tokenServerUrl || 'missing'}${
  VIDEOSDK_CONFIG.tokenPath || ''
}`;

function buildHealthUrl(baseUrl) {
  const raw = String(baseUrl || '').trim();
  if (!raw) return '';
  const joiner = raw.includes('?') ? '&' : '?';
  return `${raw}${joiner}health=1&debug=1`;
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

function LocalPreview({ liveMode }) {
  const { localWebcamOn, localWebcamStream } = useMeeting();

  if (liveMode === 'screen') {
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color="#fff" />
        <Text style={styles.placeholderText}>Screen sharing live…</Text>
      </View>
    );
  }

  if (!localWebcamOn || !localWebcamStream) {
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color="#fff" />
        <Text style={styles.placeholderText}>Camera starting…</Text>
      </View>
    );
  }

  return (
    <RTCView
      streamURL={localWebcamStream.toURL()}
      style={styles.video}
      objectFit="cover"
      mirror
      zOrder={0}
    />
  );
}

function BroadcasterMeetingInner({
  streamId,
  quality,
  liveMode,
  onStreamEnd,
  hlsStartedRef,
  tokenDebug,
  tokenParticipantId,
  hostUserId,
  meetingParticipantId,
  roomDebug,
}) {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState('joining');
  const [errorMessage, setErrorMessage] = useState(null);
  const [errorDetail, setErrorDetail] = useState(null);
  const [lastSdkState, setLastSdkState] = useState('INIT');
  const [debugLines, setDebugLines] = useState([]);
  const endedRef = useRef(false);
  const actionsRef = useRef({});
  const hlsStartTriggeredRef = useRef(false);
  const hlsStartTimerRef = useRef(null);
  const sessionIdRef = useRef(`LS-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`);
  const hlsStartAttemptRef = useRef(0);
  const cameraReadyRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const connectedOnceRef = useRef(false);
  const webcamEnableAttemptedRef = useRef(false);
  const enableWebcamTimerRef = useRef(null);
  const localParticipantRef = useRef(null);
  const pinAttemptedRef = useRef(false);
  const meetingJoinedRef = useRef(false);
  const joinRequestedRef = useRef(false);
  const joinStartedAtRef = useRef(0);
  const disconnectFatalTimerRef = useRef(null);
  const liveModeRef = useRef(liveMode);
  const joinFnRef = useRef(null);
  const leaveFnRef = useRef(null);
  const [meetingJoined, setMeetingJoined] = useState(false);
  const [joinPending, setJoinPending] = useState(false);

  useEffect(() => {
    liveModeRef.current = liveMode;
  }, [liveMode]);

  const stringifyValue = useCallback((value) => {
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch (_) {
      return String(value);
    }
  }, []);

  const pushDebugLine = useCallback(
    (label, value) => {
      const line = `${new Date().toISOString()} [${sessionIdRef.current}] ${label}: ${stringifyValue(value)}`;
      setDebugLines((prev) => [line, ...prev].slice(0, 40));
      videosdkTraceMirror(label, value == null ? '' : value);
    },
    [stringifyValue]
  );

  const logEvent = useCallback(
    (label, value) => {
      const payload = value == null ? '' : stringifyValue(value);
      console.log(`[LiveBroadcast][${sessionIdRef.current}] ${label}`, payload);
      pushDebugLine(label, value == null ? '' : value);
    },
    [pushDebugLine, stringifyValue]
  );

  useEffect(() => {
    logEvent('INIT', {
      streamId,
      roomId: roomDebug || null,
      liveMode,
      quality,
      hostUserId: hostUserId || null,
      meetingParticipantId: meetingParticipantId || null,
      tokenParticipantId: tokenParticipantId || null,
      deviceModel: Device.modelName || Device.modelId || null,
      osVersion: Device.osVersion || null,
    });
    videosdkTrace('S3_JOIN', 'HOST_DEVICE', {
      roomId: roomDebug || null,
      modelName: Device.modelName || null,
      modelId: Device.modelId || null,
      osVersion: Device.osVersion || null,
    });
  }, [
    streamId,
    roomDebug,
    liveMode,
    quality,
    hostUserId,
    meetingParticipantId,
    tokenParticipantId,
    logEvent,
  ]);

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

  // TEST 1.0.77: media enabled on MeetingProvider; no post-join enableMic/enableWebcam.
  const publishMediaAfterJoin = useCallback(
    (source) => {
      logEvent('PUBLISH_MEDIA_DEFERRED_DISABLED', { source, build: '1.0.77' });
    },
    [logEvent]
  );

  const {
    join,
    leave,
    startHls,
    stopHls,
    enableMic,
    enableWebcam,
    startScreenShare,
    enableScreenShare,
    localWebcamOn,
    localWebcamStream,
    localMicOn,
    localParticipant,
    participants,
    meetingId: sdkMeetingId,
  } = useMeeting({
    onMeetingJoined: () => {
      meetingJoinedRef.current = true;
      connectedOnceRef.current = true;
      setMeetingJoined(true);
      setLastSdkState('MEETING_JOINED');
      videosdkTrace('S3_JOIN', 'MEETING_JOINED', {
        roomId: roomDebug || null,
        streamId,
      });
      logEvent('MEETING_JOINED', {
        sdkMeetingId: sdkMeetingId || null,
        expected: roomDebug || null,
        localParticipantId: localParticipantRef.current?.id || null,
        localParticipantMode: localParticipantRef.current?.mode || null,
      });
      publishMediaAfterJoin('onMeetingJoined');
      // SPOTLIGHT + priority:'PIN' HLS layout only renders pinned participants.
      // Without this pin, HLS has nothing to composite and the pipeline rejects/empties.
      try {
        const lp = localParticipantRef.current;
        if (lp && !pinAttemptedRef.current && typeof lp.pin === 'function') {
          lp.pin();
          pinAttemptedRef.current = true;
          logEvent('LOCAL_PARTICIPANT_PINNED', { id: lp.id });
        }
      } catch (e) {
        logEvent('PIN_ERROR', e);
      }
    },
    onMeetingLeft: (data) => {
      videosdkTrace('S3_JOIN', 'MEETING_LEFT', {
        roomId: roomDebug || null,
        streamId,
        hadEstablishedSession: Boolean(connectedOnceRef.current),
        localParticipantId: localParticipantRef.current?.id || null,
        modelName: Device.modelName || null,
        modelId: Device.modelId || null,
        detail: data || null,
      });
      logEvent('MEETING_LEFT', {
        hadEstablishedSession: Boolean(connectedOnceRef.current),
        localParticipantId: localParticipantRef.current?.id || null,
        data: data || null,
      });
    },
    onConnectionOpen: () => {
      connectedOnceRef.current = true;
      meetingJoinedRef.current = true;
      setMeetingJoined(true);
      setLastSdkState('CONNECTED');
      reconnectAttemptsRef.current = 0;
      logEvent('CONNECTION_OPEN', {
        localParticipantId: localParticipantRef.current?.id || null,
      });
      publishMediaAfterJoin('onConnectionOpen');
      try {
        const lp = localParticipantRef.current;
        if (lp && !pinAttemptedRef.current && typeof lp.pin === 'function') {
          lp.pin();
          pinAttemptedRef.current = true;
          logEvent('LOCAL_PARTICIPANT_PINNED_ON_CONNECTION', { id: lp.id });
        }
      } catch (e) {
        logEvent('PIN_ON_CONNECTION_ERROR', e);
      }
    },
    onConnectionClose: (e) => {
      videosdkTrace('S3_JOIN', 'CONNECTION_CLOSE', {
        roomId: roomDebug || null,
        detail: e || null,
      });
      logEvent('CONNECTION_CLOSE', e);
    },
    onParticipantJoined: (p) => {
      videosdkTrace('S4_PARTICIPANTS', 'JOINED', {
        roomId: roomDebug || null,
        id: p?.id || null,
        mode: p?.mode || null,
      });
      logEvent('PARTICIPANT_JOINED', { id: p?.id, mode: p?.mode });
    },
    onParticipantLeft: (p) => {
      logEvent('PARTICIPANT_LEFT', { id: p?.id });
    },
    onWebcamRequested: ({ accept }) => {
      logEvent('WEBCAM_REQUESTED');
      accept?.();
    },
    onMicRequested: ({ accept }) => {
      logEvent('MIC_REQUESTED');
      accept?.();
    },
    onHlsStarted: (e) => {
      videosdkTrace('S7_HLS', 'STARTED', { roomId: roomDebug || null, streamId });
      logEvent('HLS_STARTED', e || {});
      if (endedRef.current) return;
      hlsStartedRef.current = true;
      setPhase('live');
    },
    onHlsStopped: (e) => {
      logEvent('HLS_STOPPED', e || {});
      hlsStartedRef.current = false;
    },
    onHlsStateChanged: (data) => {
      if (!data || endedRef.current) return;
      const statusText = String(data?.status || '');
      logEvent('HLS_STATE', data);
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
      logEvent('MEETING_STATE', state);
      setLastSdkState(stateText);

      if (stateText === 'CONNECTED') {
        connectedOnceRef.current = true;
        meetingJoinedRef.current = true;
        setMeetingJoined(true);
        reconnectAttemptsRef.current = 0;
        publishMediaAfterJoin('onMeetingStateConnected');
      }

      if (stateText === 'DISCONNECTED' && !endedRef.current) {
        const msSinceJoin = joinStartedAtRef.current
          ? Date.now() - joinStartedAtRef.current
          : null;
        const hadEstablishedSession = Boolean(connectedOnceRef.current);

        videosdkTrace('S3_JOIN', 'DISCONNECTED', {
          roomId: roomDebug || null,
          streamId,
          stateText,
          reason: stateReason,
          hadEstablishedSession,
          meetingJoined: meetingJoinedRef.current,
          localParticipantId: localParticipantRef.current?.id || null,
          msSinceJoin,
          raw:
            typeof state === 'object'
              ? {
                  status: state?.status,
                  state: state?.state,
                  message: state?.message,
                  reason: state?.reason,
                  error: state?.error,
                }
              : state,
        });

        // Host never completed a stable join — do not leave/rejoin loop (worsens iOS signaling).
        if (!hadEstablishedSession) {
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }
          reconnectAttemptsRef.current = 0;
          hlsStartTriggeredRef.current = false;
          webcamEnableAttemptedRef.current = false;
          pinAttemptedRef.current = false;
          if (enableWebcamTimerRef.current) {
            clearTimeout(enableWebcamTimerRef.current);
            enableWebcamTimerRef.current = null;
          }
          meetingJoinedRef.current = false;
          setMeetingJoined(false);
          setJoinPending(false);
          logEvent('DISCONNECTED_DURING_JOIN', {
            localParticipantId: localParticipantRef.current?.id || null,
            msSinceJoin,
            reason: stateReason,
          });
          videosdkTrace('S3_JOIN', 'FAIL_DURING_JOIN', {
            roomId: roomDebug || null,
            reason: stateReason,
            msSinceJoin,
          });
          const reasonLower = String(stateReason || '').toLowerCase();
          const deviceUnsupported = reasonLower.includes('device not supported');
          setErrorMessage(
            deviceUnsupported
              ? 'Camera not supported on this device for VideoSDK'
              : 'Could not join the live room'
          );
          setErrorDetail(
            deviceUnsupported
              ? `VideoSDK: ${stateReason || 'device not supported'}. iPhone X and some iOS builds fail when the camera is enabled at join. Use build 1.0.72+ (camera enabled after join).`
              : (stateReason
                  ? `${stateReason}. `
                  : 'VideoSDK disconnected before the host could stay in the room. ') +
                  'Start a NEW live stream (do not reuse an old room id). ' +
                  'Check camera/mic permissions and network (Wi‑Fi or cellular). ' +
                  `Token URL: ${VIDEOSDK_CONFIG.tokenServerUrl || 'missing'}.`
          );
          setPhase('error');
          return;
        }

        // Was in room — allow reconnect retries only after a successful join.
        logEvent('DISCONNECTED_AFTER_ESTABLISHED', {
          localParticipantId: localParticipantRef.current?.id || null,
        });
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
        webcamEnableAttemptedRef.current = false;
        pinAttemptedRef.current = false;
        if (enableWebcamTimerRef.current) {
          clearTimeout(enableWebcamTimerRef.current);
          enableWebcamTimerRef.current = null;
        }

        const nextAttempt = reconnectAttemptsRef.current + 1;
        if (nextAttempt <= 4) {
          reconnectAttemptsRef.current = nextAttempt;
          const waitMs = nextAttempt === 1 ? 400 : nextAttempt * 1000;
          logEvent('DISCONNECTED_RETRY_SCHEDULED', {
            attempt: nextAttempt,
            waitMs,
            connectedOnce: connectedOnceRef.current,
          });
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }
          reconnectTimerRef.current = setTimeout(() => {
            if (endedRef.current) return;
            (async () => {
              try {
                logEvent('DISCONNECTED_RETRY_LEAVE', { attempt: nextAttempt });
                leaveFnRef.current?.();
                await new Promise((r) => setTimeout(r, 800));
                await new Promise((resolve) =>
                  InteractionManager.runAfterInteractions(() => resolve(undefined))
                );
                await new Promise((r) => setTimeout(r, 500));
                if (endedRef.current) return;
                logEvent('DISCONNECTED_RETRY_JOIN', {
                  attempt: nextAttempt,
                  roomId: roomDebug || null,
                });
                joinFnRef.current?.();
              } catch (retryError) {
                logEvent('DISCONNECTED_RETRY_JOIN_ERROR', retryError);
              }
            })();
          }, waitMs);
        } else {
          logEvent('DISCONNECTED_RETRY_EXHAUSTED', {
            attempts: reconnectAttemptsRef.current,
            connectedOnce: connectedOnceRef.current,
            localParticipantId: localParticipantRef.current?.id || null,
          });
          videosdkTrace('S3_JOIN', 'RETRY_EXHAUSTED', { roomId: roomDebug || null });
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
      if (hlsStartTimerRef.current) {
        clearTimeout(hlsStartTimerRef.current);
        hlsStartTimerRef.current = null;
      }
      videosdkTrace('S3_JOIN', 'SDK_ERROR', {
        roomId: roomDebug || null,
        message: err?.message || err?.reason || err?.error || null,
        detail: err || null,
      });
      logEvent('SDK_ERROR', err);
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
  actionsRef.current.startScreenShare = startScreenShare;
  actionsRef.current.enableScreenShare = enableScreenShare;
  joinFnRef.current = join;
  leaveFnRef.current = leave;
  localParticipantRef.current = localParticipant || null;

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

  useEffect(() => {
    if (!localParticipant?.id) return;
    const ids =
      participants instanceof Map ? Array.from(participants.keys()) : [];
    videosdkTrace('S4_PARTICIPANTS', 'SNAPSHOT', {
      roomId: roomDebug || null,
      localId: localParticipant.id,
      localMode: localParticipant.mode || null,
      count: displayParticipantCount,
      ids,
      meetingJoined: meetingJoinedRef.current,
    });
    logEvent('LOCAL_PARTICIPANT_READY', {
      id: localParticipant.id,
      mode: localParticipant.mode || null,
      participantCount,
      joinRequested: joinRequestedRef.current,
      meetingJoined: meetingJoinedRef.current,
    });
  }, [
    localParticipant?.id,
    localParticipant?.mode,
    participantCount,
    displayParticipantCount,
    meetingJoined,
    participants,
    roomDebug,
    logEvent,
  ]);

  // Start HLS once the host is in-room and publishing audio/video (or screen+audio).
  useEffect(() => {
    if (endedRef.current) return undefined;
    if (!hostCanPublish) return undefined;
    if (hlsStartTriggeredRef.current) return undefined;

    const cameraVideoReady = Boolean(localWebcamOn && localWebcamStream);
    const cameraAudioOnlyReady =
      liveMode === 'camera' && Boolean(localMicOn) && !cameraVideoReady;
    const producerReady =
      liveMode === 'screen'
        ? Boolean(localMicOn)
        : cameraVideoReady || cameraAudioOnlyReady;

    if (!producerReady) {
      logEvent('HLS_TRIGGER_WAIT_PRODUCER', {
        liveMode,
        localWebcamOn: Boolean(localWebcamOn),
        hasStream: Boolean(localWebcamStream),
        localMicOn: Boolean(localMicOn),
      });
      return undefined;
    }

    if (cameraAudioOnlyReady) {
      logEvent('HLS_TRIGGER_AUDIO_ONLY', { roomId: roomDebug || null });
      videosdkTrace('S7_HLS', 'AUDIO_ONLY_PRODUCER', { roomId: roomDebug || null, streamId });
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
        logEvent('LOCAL_PARTICIPANT_PINNED_FALLBACK', { id: lp.id });
      }
    } catch (e) {
      logEvent('PIN_FALLBACK_ERROR', e);
    }

    // Tiny stabilization delay so the first RTP packet has been transmitted.
    hlsStartTimerRef.current = setTimeout(async () => {
      if (endedRef.current) return;
      try {
        if (liveMode === 'screen') {
          const startScreen =
            (typeof actionsRef.current.startScreenShare === 'function' &&
              actionsRef.current.startScreenShare) ||
            (typeof actionsRef.current.enableScreenShare === 'function' &&
              actionsRef.current.enableScreenShare);
          if (!startScreen) {
            throw new Error('Screen share is not available in this build');
          }
          await Promise.resolve(startScreen());
        }
        videosdkTrace('S7_HLS', 'START_REQUEST', {
          roomId: roomDebug || null,
          streamId,
          attempt,
        });
        logEvent('ACTION_START_HLS', {
          attempt,
          liveMode,
          localParticipantId: localParticipant?.id || null,
          sdkMeetingId: sdkMeetingId || null,
        });
        // Use GRID + SPEAKER to match the project's dashboard defaults (HLS Streaming
        // Settings -> Layout Style: Grid, Who to Prioritize: Active Speaker). This avoids
        // the SPOTLIGHT+PIN requirement that the local participant be pinned (which has
        // failed silently when the pin call doesn't apply in time), and matches the layout
        // the dashboard is provisioned for. `portrait` is kept for the mobile UX.
        actionsRef.current.startHls?.({
          layout: {
            type: 'GRID',
            priority: 'SPEAKER',
            gridSize: 4,
          },
          theme: 'DARK',
          mode: 'video-and-audio',
          quality: 'high',
          orientation: 'portrait',
        });
      } catch (err) {
        logEvent('HLS_START_ERROR', err);
        setErrorMessage(err?.message || 'HLS start error');
        setPhase('error');
        hlsStartTriggeredRef.current = false;
      }
    }, 600);

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
    localParticipant,
    sdkMeetingId,
    logEvent,
  ]);

  useEffect(() => {
    const cameraReady = Boolean(localWebcamOn && localWebcamStream);
    cameraReadyRef.current = cameraReady;
    if (liveMode !== 'screen') {
      logEvent('WEBCAM_STATE', {
        on: Boolean(localWebcamOn),
        hasStream: Boolean(localWebcamStream),
      });
    }
  }, [localWebcamOn, localWebcamStream, liveMode, logEvent]);

  // Join once after permissions — same pattern as VideoSDKCall (no leave() in this cleanup).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await ensureCallMediaPermissions(liveMode === 'screen' ? 'audio' : 'video');
      if (cancelled) return;
      if (!ok) {
        logEvent('PERMISSION_DENIED', { liveMode });
        Alert.alert(
          'Permissions required',
          liveMode === 'screen'
            ? 'Microphone permission is required for screen live streaming.'
            : 'Camera and microphone permissions are required for camera live streaming.'
        );
        setErrorMessage('Permissions denied');
        setPhase('error');
        return;
      }
      try {
        const joinFn = await waitForMeetingJoinFn(() => joinFnRef.current, {
          isCancelled: () => cancelled,
        });
        if (cancelled) return;
        if (!joinFn) {
          videosdkTrace('S3_JOIN', 'JOIN_FN_TIMEOUT', { roomId: roomDebug || null });
          throw new Error('VideoSDK join() was not ready');
        }

        videosdkTrace('S3_JOIN', 'JOIN_FN_READY', { roomId: roomDebug || null });
        if (Platform.OS === 'ios') {
          await new Promise((r) => setTimeout(r, 450));
          if (cancelled) return;
          videosdkTrace('S3_JOIN', 'IOS_STABILIZE_DELAY', { ms: 450 });
        }
        joinStartedAtRef.current = Date.now();
        joinRequestedRef.current = true;
        setJoinPending(true);
        videosdkTrace('S3_JOIN', 'START', { liveMode, roomId: roomDebug || null, streamId });
        logEvent('ACTION_JOIN_MEETING', { liveMode, roomId: roomDebug || null });
        await Promise.resolve(joinFn());
        videosdkTrace('S3_JOIN', 'REQUESTED', { roomId: roomDebug || null });
        logEvent('ACTION_JOIN_REQUESTED', { roomId: roomDebug || null });
      } catch (e) {
        if (!cancelled) {
          videosdkTrace('S3_JOIN', 'FAIL', {
            roomId: roomDebug || null,
            message: e?.message || String(e),
          });
          logEvent('JOIN_FAILED', e);
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
      if (enableWebcamTimerRef.current) {
        clearTimeout(enableWebcamTimerRef.current);
        enableWebcamTimerRef.current = null;
      }
    };
  }, [liveMode, roomDebug, logEvent]);

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
          logEvent('UNMOUNT_SKIP_LEAVE', { reason: 'never_joined' });
          return;
        }
        if (hlsStartedRef.current) actionsRef.current.stopHls?.();
        leaveFnRef.current?.();
        logEvent('UNMOUNT_LEAVE', { hadEstablishedSession: Boolean(connectedOnceRef.current) });
        videosdkTrace('S3_JOIN', 'UNMOUNT_LEAVE', {
          roomId: roomDebug || null,
          hadEstablishedSession: Boolean(connectedOnceRef.current),
        });
      } catch (_) {}
    };
  }, [logEvent]);

  useEffect(() => {
    if (phase !== 'joining' || meetingJoined) return undefined;
    const t = setTimeout(() => {
      if (endedRef.current || meetingJoinedRef.current) return;
      setErrorMessage(
        `Could not join the live room (SDK: ${lastSdkState}). Start a new stream and confirm camera/mic permissions.`
      );
      logEvent('TIMEOUT_JOINING', { lastSdkState, joinRequested: joinRequestedRef.current });
      setPhase((current) => (current === 'joining' ? 'error' : current));
    }, 45000);
    return () => clearTimeout(t);
  }, [phase, meetingJoined, lastSdkState, logEvent]);

  const handleEndPress = () => {
    finalizeEnd(true);
  };

  if (phase === 'error' && errorMessage) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>{errorMessage}</Text>
        {errorDetail ? <Text style={styles.sub}>{errorDetail}</Text> : null}
        <TouchableOpacity style={styles.endBtn} onPress={handleEndPress}>
          <Text style={styles.endBtnText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LocalPreview liveMode={liveMode} />
      {__DEV__ ? (
        <View style={styles.devPanel}>
          <Text style={styles.devPanelText}>phase: {phase}</Text>
          <Text style={styles.devPanelText}>sdk: {lastSdkState || 'n/a'}</Text>
          <Text style={styles.devPanelText}>mode: {liveMode}</Text>
          <Text style={styles.devPanelText}>{tokenDebug}</Text>
        </View>
      ) : null}
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
      {__DEV__ ? (
        <View style={styles.statePanel}>
          <Text style={styles.statePanelText}>phase: {phase}</Text>
          <Text style={styles.statePanelText}>sdk: {lastSdkState || 'n/a'}</Text>
          <Text style={styles.statePanelText}>joined: {meetingJoined ? 'yes' : 'no'}</Text>
          <Text style={styles.statePanelText}>room: {roomDebug || 'n/a'}</Text>
          <Text style={styles.statePanelText}>token: {tokenDebug || 'n/a'}</Text>
          <Text style={styles.statePanelText}>
            participants: {displayParticipantCount} local: {localParticipant?.id || 'none'}
          </Text>
          <Text style={styles.statePanelText}>
            meetingPid: {meetingParticipantId || '(omit)'} host: {hostUserId || 'n/a'}
          </Text>
          <Text style={styles.statePanelText}>session: {sessionIdRef.current}</Text>
          {debugLines.slice(0, 12).map((line, idx) => (
            <Text key={`${idx}-${line}`} style={styles.statePanelText}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
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
  const [tokenError, setTokenError] = useState(null);
  const [tokenDebug, setTokenDebug] = useState('token: n/a');
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
        videosdkTrace('S2_SDK', 'TOKEN_FAIL', {
          roomId: effectiveRoomId,
          error: validation.error,
        });
        setTokenError(validation.error);
        return false;
      }
      const claims = validation.claims || {};
      if (validation.participantId) {
        setTokenParticipantId(validation.participantId);
      }
      const perms = Array.isArray(claims.permissions) ? claims.permissions : [];
      setTokenDebug(
        `key:${claims?.apikey || 'n/a'} v2 perms:${perms.join('|')} room:${claims.roomId || effectiveRoomId}`
      );
      validatedTokenRef.current = meetingToken;
      setToken(meetingToken);
      videosdkTrace('S2_SDK', 'TOKEN_OK', {
        roomId: effectiveRoomId,
        participantId: validation.participantId || null,
      });
      return true;
    };

    (async () => {
      videosdkTrace('S2_SDK', 'TOKEN_FETCH_START', { roomId: effectiveRoomId, streamId });
      try {
        if (__DEV__) {
          try {
            const healthUrl = buildHealthUrl(VIDEOSDK_CONFIG.tokenServerUrl);
            if (healthUrl) {
              const response = await fetch(healthUrl, { method: 'GET', headers: { Accept: 'application/json' } });
              const raw = await response.text();
              let payload = null;
              try {
                payload = raw ? JSON.parse(raw) : null;
              } catch (_) {
                payload = raw;
              }
              console.log('[LiveBroadcast] token-backend health', {
                url: healthUrl,
                status: response.status,
                ok: response.ok,
                payload,
              });
            }
          } catch (healthError) {
            console.warn('[LiveBroadcast] token-backend health probe failed', healthError);
          }
        }

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

  const hostMicOn = true;
  const hostWebcamOn = liveMode === 'camera';

  useEffect(() => {
    if (!token || !effectiveRoomId) return;
    videosdkTrace('S2_SDK', 'MEETING_PROVIDER_MOUNT', {
      meetingId: effectiveRoomId,
      mode: 'SEND_AND_RECV',
      micEnabled: hostMicOn,
      webcamEnabled: hostWebcamOn,
      liveMode,
      hasToken: Boolean(token),
      streamId,
      buildNote: '1.0.78 unique host participantId per stream; no notification config',
    });
  }, [effectiveRoomId, token, streamId, liveMode, hostMicOn, hostWebcamOn]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#a77df8" style={{ flex: 1 }} />
      </View>
    );
  }

  if (tokenError) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>{tokenError}</Text>
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

  const meetingConfig = {
    meetingId: effectiveRoomId,
    mode: 'SEND_AND_RECV',
    micEnabled: hostMicOn,
    webcamEnabled: hostWebcamOn,
    name: hostDisplayName || hostUserId || 'Host',
    debugMode: __DEV__,
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
        tokenDebug={tokenDebug}
        tokenParticipantId={tokenParticipantId}
        hostUserId={hostUserId}
        meetingParticipantId={meetingParticipantId}
        roomDebug={effectiveRoomId}
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
  statePanel: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 96,
    zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderColor: 'rgba(255,255,255,0.2)',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  statePanelText: {
    color: '#b9f6ff',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  devPanel: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 30,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderColor: 'rgba(255,255,255,0.25)',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  devPanelText: {
    color: '#8df2ff',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  endStream: {
    position: 'absolute',
    alignSelf: 'center',
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
