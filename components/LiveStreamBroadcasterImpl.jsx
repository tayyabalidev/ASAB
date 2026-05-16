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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MeetingProvider, useMeeting, RTCView } from '@videosdk.live/react-native-sdk';
import { VIDEOSDK_CONFIG, VIDEOSDK_TOKEN_SETUP_MESSAGE } from '../lib/config';
import { ensureCallMediaPermissions } from '../lib/videosdkMediaPermissions';
import { endLiveStream } from '../lib/livestream';
import { decodeJwtPayload } from '../lib/videosdkHelper';

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

  const {
    join,
    leave,
    startHls,
    stopHls,
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
      logEvent('MEETING_JOINED', {
        sdkMeetingId: sdkMeetingId || null,
        expected: roomDebug || null,
        localParticipantId: localParticipantRef.current?.id || null,
        localParticipantMode: localParticipantRef.current?.mode || null,
      });
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
    onMeetingLeft: () => {
      logEvent('MEETING_LEFT');
    },
    onConnectionOpen: () => logEvent('CONNECTION_OPEN'),
    onConnectionClose: (e) => logEvent('CONNECTION_CLOSE', e),
    onParticipantJoined: (p) => {
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
      const stateText =
        typeof state === 'string'
          ? state
          : state?.status || state?.state;
      const stateReason =
        (typeof state === 'object' &&
          (state?.message || state?.reason || state?.error || state?.errorMessage)) ||
        null;
      logEvent('MEETING_STATE', state);
      setLastSdkState(stateText);

      if (stateText === 'CONNECTED') {
        connectedOnceRef.current = true;
        reconnectAttemptsRef.current = 0;
        // HLS trigger lives in its own effect — keep this callback minimal.
      }

      if (stateText === 'DISCONNECTED' && !endedRef.current) {
        // Never reached CONNECTED — bad token/room config. Retrying leave+join here only spins
        // CONNECTING → DISCONNECTED and the dashboard stays at 0 participants.
        if (!connectedOnceRef.current) {
          logEvent('DISCONNECTED_BEFORE_CONNECTED', {
            localParticipantId: localParticipantRef.current?.id || null,
          });
          setErrorMessage('Could not join the live room');
          setErrorDetail(
            `VideoSDK disconnected before CONNECTED (sdk=${stateText || 'DISCONNECTED'}). ` +
              'Redeploy videosdk-token (JWT: version 2 + roomId, no roles), start a NEW stream, ' +
              `and confirm token URL matches your function: ${VIDEOSDK_CONFIG.tokenServerUrl || 'missing'}. ` +
              'Decode the host JWT at jwt.io — must have roomId matching this room and must NOT include roles.'
          );
          setPhase('error');
          return;
        }

        // Allow HLS, webcam, and pin to be re-attempted after a clean reconnect.
        hlsStartTriggeredRef.current = false;
        webcamEnableAttemptedRef.current = false;
        pinAttemptedRef.current = false;
        if (enableWebcamTimerRef.current) {
          clearTimeout(enableWebcamTimerRef.current);
          enableWebcamTimerRef.current = null;
        }
        const nextAttempt = reconnectAttemptsRef.current + 1;
        if (nextAttempt <= 3) {
          reconnectAttemptsRef.current = nextAttempt;
          const waitMs = nextAttempt * 1200;
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
                actionsRef.current.leave?.();
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
                actionsRef.current.join?.();
              } catch (retryError) {
                logEvent('DISCONNECTED_RETRY_JOIN_ERROR', retryError);
              }
            })();
          }, waitMs);
        } else {
          logEvent('DISCONNECTED_RETRY_EXHAUSTED', {
            attempts: reconnectAttemptsRef.current,
            connectedOnce: connectedOnceRef.current,
          });
          setErrorMessage('Connection dropped before live started');
          setErrorDetail(
            'Meeting disconnected repeatedly while joining. Please check network stability and VideoSDK iOS release logs.'
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
      logEvent('SDK_ERROR', err);
      const sdkMessage =
        err?.message || err?.reason || err?.error || err?.errorMessage || 'Meeting error';
      setErrorMessage(sdkMessage);
      setErrorDetail(JSON.stringify(err || {}));
      setPhase('error');
    },
  });

  actionsRef.current.stopHls = stopHls;
  actionsRef.current.leave = leave;
  actionsRef.current.join = join;
  actionsRef.current.startHls = startHls;
  actionsRef.current.enableWebcam = enableWebcam;
  actionsRef.current.startScreenShare = startScreenShare;
  actionsRef.current.enableScreenShare = enableScreenShare;
  localParticipantRef.current = localParticipant || null;

  const participantCount =
    participants instanceof Map ? participants.size : localParticipant?.id ? 1 : 0;

  useEffect(() => {
    if (!localParticipant?.id) return;
    logEvent('LOCAL_PARTICIPANT_READY', {
      id: localParticipant.id,
      mode: localParticipant.mode || null,
      participantCount,
    });
  }, [localParticipant?.id, localParticipant?.mode, participantCount, logEvent]);

  // After CONNECTED, turn the webcam on explicitly. Doing this at join time (webcamEnabled: true)
  // makes the SDK race the camera-acquisition during the signaling handshake and on iOS this often
  // ends in CONNECTING -> DISCONNECTED before CONNECTED ever fires. Enabling here is reliable.
  useEffect(() => {
    if (endedRef.current) return undefined;
    if (lastSdkState !== 'CONNECTED') return undefined;
    if (liveMode === 'screen') return undefined;
    if (webcamEnableAttemptedRef.current) return undefined;
    if (localWebcamOn) {
      webcamEnableAttemptedRef.current = true;
      return undefined;
    }

    webcamEnableAttemptedRef.current = true;
    // Tiny stabilization wait so the WebRTC PC is fully wired up before we add a video track.
    enableWebcamTimerRef.current = setTimeout(() => {
      if (endedRef.current) return;
      try {
        logEvent('ACTION_ENABLE_WEBCAM');
        actionsRef.current.enableWebcam?.();
      } catch (e) {
        logEvent('ENABLE_WEBCAM_ERROR', e);
        webcamEnableAttemptedRef.current = false;
      }
    }, 500);

    return () => {
      if (enableWebcamTimerRef.current) {
        clearTimeout(enableWebcamTimerRef.current);
        enableWebcamTimerRef.current = null;
      }
    };
  }, [lastSdkState, liveMode, localWebcamOn, logEvent]);

  // If CONNECTED but the camera track never appears, retry enableWebcam once.
  useEffect(() => {
    if (endedRef.current || liveMode === 'screen') return undefined;
    if (lastSdkState !== 'CONNECTED' || localWebcamOn) return undefined;
    const t = setTimeout(() => {
      if (endedRef.current || localWebcamOn) return;
      logEvent('ENABLE_WEBCAM_RETRY');
      webcamEnableAttemptedRef.current = false;
      try {
        actionsRef.current.enableWebcam?.();
      } catch (e) {
        logEvent('ENABLE_WEBCAM_RETRY_ERROR', e);
      }
    }, 3500);
    return () => clearTimeout(t);
  }, [lastSdkState, liveMode, localWebcamOn, logEvent]);

  // Dedicated HLS trigger: runs only when SDK is CONNECTED *and* a real producer is ready.
  // Decoupling from onMeetingStateChanged eliminates the captured-stale-closure race that
  // previously called startHls() against a half-torn meeting.
  useEffect(() => {
    if (endedRef.current) return undefined;
    if (lastSdkState !== 'CONNECTED') return undefined;
    if (hlsStartTriggeredRef.current) return undefined;

    const producerReady =
      liveMode === 'screen'
        ? Boolean(localMicOn)
        : Boolean(localWebcamOn && localWebcamStream);

    if (!producerReady) {
      logEvent('HLS_TRIGGER_WAIT_PRODUCER', {
        liveMode,
        localWebcamOn: Boolean(localWebcamOn),
        hasStream: Boolean(localWebcamStream),
        localMicOn: Boolean(localMicOn),
      });
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
    lastSdkState,
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

  // Join exactly once after permissions + interactions settle. Deps intentionally empty:
  // re-running this effect (and therefore its cleanup) on every SDK render would call
  // leave() mid-join and tear down the meeting (root cause of "closes shortly after join").
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        await new Promise((resolve) =>
          InteractionManager.runAfterInteractions(() => resolve(undefined))
        );
        await new Promise((r) => setTimeout(r, 400));
        if (cancelled) return;

        // Wait until useMeeting() exposes join (avoids silent no-op on first paint).
        const joinReadyDeadline = Date.now() + 8000;
        while (!cancelled && Date.now() < joinReadyDeadline) {
          if (typeof actionsRef.current.join === 'function') break;
          await new Promise((r) => setTimeout(r, 80));
        }
        if (cancelled) return;
        if (typeof actionsRef.current.join !== 'function') {
          throw new Error('VideoSDK join() was not ready');
        }

        logEvent('ACTION_JOIN_MEETING', { liveMode, roomId: roomDebug || null });
        await Promise.resolve(actionsRef.current.join());
      } catch (e) {
        if (!cancelled) {
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
      if (enableWebcamTimerRef.current) {
        clearTimeout(enableWebcamTimerRef.current);
        enableWebcamTimerRef.current = null;
      }
      try {
        if (hlsStartedRef.current) actionsRef.current.stopHls?.();
        actionsRef.current.leave?.();
        logEvent('CLEANUP_LEAVE');
      } catch (_) {}
    };
  }, []);

  useEffect(() => {
    if (phase !== 'joining') return undefined;
    const t = setTimeout(() => {
      if (endedRef.current) return;
      setErrorMessage(
        `Stream is taking too long (SDK state: ${lastSdkState}). Confirm VideoSDK interactive HLS is enabled, your JWT token URL works, and the device has a stable connection.`
      );
      logEvent('TIMEOUT_JOINING', { lastSdkState });
      setPhase((current) => (current === 'joining' ? 'error' : current));
    }, 75000);
    return () => clearTimeout(t);
  }, [phase, lastSdkState, logEvent]);

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
        <View style={[styles.livePill, phase !== 'live' && styles.connectingPill]}>
          <View style={styles.dot} />
          <Text style={styles.liveText}>{phase === 'live' ? 'LIVE' : 'CONNECTING'}</Text>
        </View>
      </View>
      {phase === 'joining' && (
        <View style={styles.banner}>
          <ActivityIndicator color="#fff" size="small" />
          <Text style={styles.bannerText}> Starting stream…</Text>
        </View>
      )}
      <View style={styles.statePanel}>
        <Text style={styles.statePanelText}>phase: {phase}</Text>
        <Text style={styles.statePanelText}>sdk: {lastSdkState || 'n/a'}</Text>
        <Text style={styles.statePanelText}>room: {roomDebug || 'n/a'}</Text>
        <Text style={styles.statePanelText}>token: {tokenDebug || 'n/a'}</Text>
        <Text style={styles.statePanelText}>
          participants: {participantCount} local: {localParticipant?.id || 'none'}
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
  // Host must always join using the real VideoSDK room id (not Appwrite stream id).
  const effectiveRoomId = typeof roomId === 'string' ? roomId.trim() : '';

  useEffect(() => {
    let cancelled = false;
    setTokenError(null);
    setTokenParticipantId(null);
    setLoading(true);
    (async () => {
      try {
        // Non-blocking backend health probe for TestFlight diagnostics.
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
            if (payload && typeof payload === 'object') {
              const keysPresent =
                payload.videoSdkKeysPresent === true ||
                payload.keysPresent === true ||
                payload.ok === true;
              setTokenDebug((prev) => `${prev} health:${response.status} keys:${keysPresent ? 'yes' : 'no'}`);
            } else {
              setTokenDebug((prev) => `${prev} health:${response.status}`);
            }
          }
        } catch (healthError) {
          console.warn('[LiveBroadcast] token-backend health probe failed', healthError);
          setTokenDebug((prev) => `${prev} health:probe-failed`);
        }

        if (!effectiveRoomId) {
          throw new Error(
            `Missing videosdkRoomId for host broadcast. streamId=${streamId || 'n/a'}, roomId=${
              roomId || 'n/a'
            }.`
          );
        }
        const t = typeof initialToken === 'string' ? initialToken.trim() : '';
        if (!t) {
          throw new Error(
            'Missing host token from create-room-and-token response. Ensure backend returns both meetingId and token in one call.'
          );
        }
        if (cancelled) return;
        if (t) {
          try {
            const claims = decodeJwtPayload(t);
            if (claims) {
              console.log('TOKEN ROOM:', claims?.roomId);
              console.log('MEETING ROOM:', effectiveRoomId);
              console.log('TOKEN PARTICIPANT:', claims?.participantId);
              console.log('TOKEN ROOM ID:', claims?.roomId);
              console.log('JOINING ROOM ID:', effectiveRoomId);
              if (claims?.participantId) {
                setTokenParticipantId(String(claims.participantId));
              }
              const perms = Array.isArray(claims?.permissions) ? claims.permissions : [];
              const tokenRoomId = claims?.roomId ? String(claims.roomId) : '';
              const expectedRoomId = String(effectiveRoomId || '');

              if (!tokenRoomId) {
                setTokenError(
                  'VideoSDK host token is missing roomId. Redeploy the videosdk-token Appwrite function, then start a new live stream.'
                );
                setLoading(false);
                return;
              }
              if (tokenRoomId && expectedRoomId && tokenRoomId !== expectedRoomId) {
                setTokenError(
                  `VideoSDK token room mismatch: token=${tokenRoomId}, expected=${expectedRoomId}.`
                );
                setLoading(false);
                return;
              }
              if (!perms.includes('allow_join')) {
                setTokenError('VideoSDK token missing allow_join permission.');
                setLoading(false);
                return;
              }
              if (!perms.includes('allow_mod')) {
                setTokenError(
                  'VideoSDK host token missing allow_mod permission. Live (HLS) start requires allow_mod.'
                );
                setLoading(false);
                return;
              }
              if (claims.version !== 2) {
                setTokenError(
                  'VideoSDK token missing version:2. Redeploy the latest videosdk-token function, then start a new live stream.'
                );
                setLoading(false);
                return;
              }
              const roles = Array.isArray(claims.roles) ? claims.roles : [];
              if (roles.includes('rtc') || roles.includes('crawler')) {
                setTokenError(
                  'VideoSDK token must not include roles (rtc/crawler) for mobile join. Redeploy videosdk-token and start a new stream.'
                );
                setLoading(false);
                return;
              }

              setTokenDebug(
                `key:${claims?.apikey || 'n/a'} v2 perms:${perms.join('|')} room:${tokenRoomId}`
              );
              if (__DEV__) {
                console.log('[LiveBroadcast] token-room check', {
                  streamId: streamId || null,
                  routeRoomId: roomId || null,
                  meetingId: effectiveRoomId || null,
                  tokenRoomId: tokenRoomId || null,
                  apikey: claims?.apikey || null,
                  permissions: perms,
                });
              }
            }
            if (__DEV__ && claims) {
              console.log('[LiveBroadcast] token claims', {
                apikey: claims?.apikey || null,
                roomId: claims?.roomId || null,
                participantId: claims?.participantId || null,
                permissions: claims?.permissions || null,
                roles: claims?.roles || null,
              });
            }
          } catch (decodeError) {
            if (__DEV__) {
              console.warn('[LiveBroadcast] token decode failed', decodeError);
            }
          }
          setToken(t);
          return;
        }
        setTokenError(VIDEOSDK_TOKEN_SETUP_MESSAGE);
        return;
      } catch (e) {
        if (!cancelled) setTokenError(e?.message || 'Token error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveRoomId, initialToken, hostUserId, streamId, roomId]);

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

  // Join with audio-only; enable webcam after CONNECTED (see BroadcasterMeetingInner).
  // Pass participantId only when the JWT includes the same claim (Node /get-token). Omitting
  // it when the JWT has no participantId lets VideoSDK auto-generate a stable local id.
  // participantId must match JWT when present (host Appwrite user id from POST ?participantId=).
  const meetingConfig = {
    meetingId: effectiveRoomId,
    mode: 'SEND_AND_RECV',
    micEnabled: true,
    webcamEnabled: false,
    name: hostDisplayName || hostUserId || 'Host',
    defaultCamera: 'front',
    debugMode: __DEV__,
    notification: {
      title: 'ASAB Live',
      message: 'You are broadcasting',
    },
    ...(meetingParticipantId ? { participantId: meetingParticipantId } : {}),
  };

  return (
    <MeetingProvider config={meetingConfig} token={authToken}>
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
