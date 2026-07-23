import React, { useMemo } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import {
  useMeeting,
  useParticipant,
  RTCView,
  MediaStream,
} from '@videosdk.live/react-native-sdk';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import images from '../constants/images';
import { getPhotoUrl } from '../lib/appwrite';
import {
  MAX_STAGE_GUESTS,
  STAGE_SLOT_COUNT,
  isPublisherMode,
  isHostParticipantId,
  listOnStageGuestIds,
  findHostParticipantId,
  buildGuestSlots,
  splitSlotsLeftRight,
} from '../lib/liveStageLayout';

function resolveAvatarUri(metaData, fallbackUri) {
  const raw =
    metaData?.avatar ||
    metaData?.avatarUrl ||
    metaData?.profileImage ||
    '';
  if (raw) {
    const url = getPhotoUrl(raw);
    if (url) return url;
    if (String(raw).startsWith('http')) return String(raw);
  }
  return fallbackUri || null;
}

function resolveStreamUrl(webcamOn, webcamStream) {
  try {
    if (webcamOn && webcamStream?.track) {
      return new MediaStream([webcamStream.track]).toURL();
    }
    if (webcamStream && typeof webcamStream.toURL === 'function') {
      return webcamStream.toURL();
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

function HostRemoteCell({ participantId, label }) {
  const { webcamOn, webcamStream, displayName, metaData, isActiveSpeaker } =
    useParticipant(participantId);
  const streamURL = resolveStreamUrl(webcamOn, webcamStream);
  const avatarUri = resolveAvatarUri(metaData);
  const name = displayName || label || 'Host';
  const showVideo = Boolean(webcamOn && streamURL);

  return (
    <View style={[styles.hostCell, isActiveSpeaker && styles.activeBorder]}>
      <View style={styles.hostBadge}>
        <Text style={styles.hostBadgeText}>{label || 'Host'}</Text>
      </View>
      {showVideo ? (
        <RTCView
          streamURL={streamURL}
          style={styles.fill}
          objectFit="cover"
          mirror={false}
          zOrder={Platform.OS === 'android' ? 0 : 0}
        />
      ) : (
        <View style={styles.avatarFill}>
          <Image
            source={avatarUri ? { uri: avatarUri } : images.profile}
            style={styles.hostAvatar}
          />
        </View>
      )}
      <Text style={styles.nameOverlay} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

function GuestSlotOccupied({ participantId, mirror }) {
  const {
    webcamOn,
    webcamStream,
    displayName,
    micOn,
    metaData,
    isActiveSpeaker,
    isLocal,
  } = useParticipant(participantId);
  const streamURL = resolveStreamUrl(webcamOn, webcamStream);
  const avatarUri = resolveAvatarUri(metaData);
  const name = displayName || 'Guest';
  const showVideo = Boolean(webcamOn && streamURL);

  return (
    <View style={[styles.slot, isActiveSpeaker && styles.activeBorder]}>
      {showVideo ? (
        <RTCView
          streamURL={streamURL}
          style={styles.fill}
          objectFit="cover"
          mirror={Boolean(mirror && isLocal)}
          zOrder={Platform.OS === 'android' ? 1 : 0}
        />
      ) : (
        <View style={styles.avatarFill}>
          <Image
            source={avatarUri ? { uri: avatarUri } : images.profile}
            style={styles.guestAvatar}
          />
        </View>
      )}
      {!micOn ? (
        <View style={styles.micOffBadge}>
          <Feather name="mic-off" size={10} color="#fff" />
        </View>
      ) : null}
      <Text style={styles.slotName} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

function GuestSlotEmpty({ canRequest, onPress, requestLabel, inviteLabel, showLabel }) {
  const content = (
    <View style={styles.slotEmptyInner}>
      <Feather name="plus" size={22} color="rgba(255,255,255,0.85)" />
      {showLabel ? (
        <Text style={styles.slotEmptyText}>
          {canRequest ? requestLabel : inviteLabel}
        </Text>
      ) : null}
    </View>
  );

  if (!onPress) {
    return <View style={styles.slotEmpty}>{content}</View>;
  }

  return (
    <TouchableOpacity style={styles.slotEmpty} onPress={onPress} activeOpacity={0.85}>
      {content}
    </TouchableOpacity>
  );
}

function SlotColumn({
  slots,
  canRequest,
  onEmptyPress,
  requestLabel,
  inviteLabel,
  showEmptyLabel,
}) {
  return (
    <View style={styles.column}>
      {slots.map((id, index) =>
        id ? (
          <GuestSlotOccupied key={id} participantId={id} mirror />
        ) : (
          <GuestSlotEmpty
            key={`empty-${index}`}
            canRequest={canRequest}
            onPress={onEmptyPress}
            requestLabel={requestLabel}
            inviteLabel={inviteLabel}
            showLabel={showEmptyLabel}
          />
        )
      )}
    </View>
  );
}

/**
 * TikTok-style group live stage: center host + 6 side guest slots.
 * Mount inside MeetingProvider. For host, pass renderHost for local camera cell.
 */
export default function LiveGroupStage({
  role = 'host',
  renderHost = null,
  hostParticipantId: preferredHostId = null,
  onEmptySlotPress = null,
  hostLabel = 'Host',
}) {
  const { t } = useTranslation();
  const { participants, localParticipant, activeSpeakerId } = useMeeting();
  const localId = localParticipant?.id;

  const hostId = useMemo(
    () => findHostParticipantId(participants, preferredHostId || (role === 'host' ? localId : null)),
    [participants, preferredHostId, role, localId]
  );

  const guestIds = useMemo(() => {
    const ids = listOnStageGuestIds(participants, {
      excludeIds: [hostId].filter(Boolean),
      max: MAX_STAGE_GUESTS,
    });
    // Ensure local guest appears in a slot when on stage.
    if (
      role === 'guest' &&
      localId &&
      !isHostParticipantId(localId) &&
      isPublisherMode(localParticipant?.mode) &&
      !ids.includes(localId)
    ) {
      return [localId, ...ids].slice(0, MAX_STAGE_GUESTS);
    }
    return ids;
  }, [participants, hostId, role, localId, localParticipant?.mode]);

  const { left, right } = useMemo(() => {
    const slots = buildGuestSlots(guestIds, STAGE_SLOT_COUNT);
    return splitSlotsLeftRight(slots);
  }, [guestIds]);

  const canRequest = role === 'viewer';
  const showEmptyLabel = role === 'host' || role === 'viewer';
  const emptyPress =
    typeof onEmptySlotPress === 'function' ? onEmptySlotPress : null;
  const requestLabel = t('liveBroadcast.groupStage.request', { defaultValue: 'Request' });
  const inviteLabel = t('liveBroadcast.groupStage.inviteSlot', { defaultValue: 'Invite' });

  return (
    <View style={styles.root} pointerEvents="box-none">
      <SlotColumn
        slots={left}
        canRequest={canRequest}
        onEmptyPress={emptyPress}
        requestLabel={requestLabel}
        inviteLabel={inviteLabel}
        showEmptyLabel={showEmptyLabel}
      />
      <View style={styles.centerColumn}>
        {role === 'host' && renderHost ? (
          <View
            style={[
              styles.hostCell,
              activeSpeakerId && hostId && activeSpeakerId === hostId
                ? styles.activeBorder
                : null,
            ]}
          >
            <View style={styles.hostBadge}>
              <Text style={styles.hostBadgeText}>
                {t('liveBroadcast.groupStage.hostLabel', { defaultValue: hostLabel })}
              </Text>
            </View>
            <View style={styles.hostPreviewWrap}>{renderHost()}</View>
            <Text style={styles.nameOverlay} numberOfLines={1}>
              {localParticipant?.displayName || hostLabel}
            </Text>
          </View>
        ) : hostId ? (
          <HostRemoteCell
            participantId={hostId}
            label={t('liveBroadcast.groupStage.hostLabel', { defaultValue: hostLabel })}
          />
        ) : (
          <View style={styles.hostCell}>
            <Text style={styles.waitingHost}>
              {t('liveBroadcast.groupStage.waitingHost', { defaultValue: 'Waiting for host…' })}
            </Text>
          </View>
        )}
      </View>
      <SlotColumn
        slots={right}
        canRequest={canRequest}
        onEmptyPress={emptyPress}
        requestLabel={requestLabel}
        inviteLabel={inviteLabel}
        showEmptyLabel={showEmptyLabel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    backgroundColor: '#000',
    paddingHorizontal: 4,
    paddingTop: 52,
    paddingBottom: 8,
    zIndex: 2,
  },
  column: {
    width: '22%',
    justifyContent: 'space-evenly',
    gap: 6,
  },
  centerColumn: {
    flex: 1,
    paddingHorizontal: 4,
    justifyContent: 'center',
  },
  hostCell: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  hostPreviewWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  hostBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 3,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  hostBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  waitingHost: {
    color: '#888',
    textAlign: 'center',
    marginTop: 40,
  },
  slot: {
    flex: 1,
    minHeight: 72,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1c1c1c',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  slotEmpty: {
    flex: 1,
    minHeight: 72,
    borderRadius: 8,
    backgroundColor: '#1c1c1c',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  slotEmptyInner: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  slotEmptyText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  avatarFill: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#222',
  },
  hostAvatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  guestAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  nameOverlay: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    right: 8,
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textShadowColor: '#000',
    textShadowRadius: 4,
  },
  slotName: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    right: 4,
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    textShadowColor: '#000',
    textShadowRadius: 3,
  },
  micOffBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 10,
    padding: 3,
  },
  activeBorder: {
    borderWidth: 2,
    borderColor: '#7dd3fc',
  },
});
