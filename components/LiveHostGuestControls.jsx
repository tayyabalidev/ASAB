import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { useMeeting, useParticipant, usePubSub } from '@videosdk.live/react-native-sdk';
import { useTranslation } from 'react-i18next';
import {
  MAX_STAGE_GUESTS,
  isHostParticipantId,
  listOnStageGuestIds,
} from '../lib/liveStageLayout';
import { decodePubSubMessage, encodePubSubPayload, publishStageCommand, STAGE_CONTROL_TOPIC } from '../lib/livePubSubPayload';

function StageCommandPublisher({ command, onDone }) {
  const targetId = command?.participantId ? String(command.participantId) : '';
  const perTargetTopic = targetId ? `CHANGE_MODE_${targetId}` : 'CHANGE_MODE_PENDING';
  const controlTopic = targetId ? `GUEST_CONTROL_${targetId}` : 'GUEST_CONTROL_PENDING';

  const { publish: publishStage } = usePubSub(STAGE_CONTROL_TOPIC, {});
  const { publish: publishMode } = usePubSub(perTargetTopic, {});
  const { publish: publishControl } = usePubSub(controlTopic, {});

  useEffect(() => {
    if (!command?.participantId) return undefined;
    let cancelled = false;

    (async () => {
      const pid = String(command.participantId);
      const sendOnly = [pid];

      try {
        if (command.mode) {
          const modePayload = {
            mode: command.mode,
            targetParticipantId: pid,
            participantId: pid,
          };
          // Shared topic (always subscribed on guest) + per-participant topic (docs pattern).
          await publishStageCommand(publishStage, modePayload, { sendOnly });
          await publishStageCommand(publishMode, modePayload, { sendOnly });
        }
        if (command.action) {
          const actionPayload = {
            action: command.action,
            targetParticipantId: pid,
            participantId: pid,
          };
          await publishStageCommand(publishStage, actionPayload, { sendOnly });
          await publishStageCommand(publishControl, actionPayload, { sendOnly });
        }
      } catch (_) {
        /* best-effort */
      } finally {
        if (!cancelled) onDone?.();
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per command token
  }, [command?.token]);

  return null;
}

function GuestRow({
  participantId,
  onStage,
  stageFull,
  onInvite,
  onRemove,
  onMute,
  onUnmute,
}) {
  const { t } = useTranslation();
  const { displayName, micOn, webcamOn, isLocal } = useParticipant(participantId);

  if (isLocal) return null;
  if (isHostParticipantId(participantId)) return null;

  const name = displayName || participantId?.slice(0, 8) || 'Guest';

  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <Text style={styles.rowName}>{name}</Text>
        <Text style={styles.rowMeta}>
          {onStage
            ? t('liveBroadcast.groupStage.onStage', { defaultValue: 'On stage' })
            : t('liveBroadcast.groupStage.watching', { defaultValue: 'Watching' })}
          {' · '}
          {micOn
            ? t('liveBroadcast.groupStage.micOn', { defaultValue: 'mic' })
            : t('liveBroadcast.groupStage.micOff', { defaultValue: 'muted' })}
          {' · '}
          {webcamOn
            ? t('liveBroadcast.groupStage.camOn', { defaultValue: 'cam' })
            : t('liveBroadcast.groupStage.camOff', { defaultValue: 'no cam' })}
        </Text>
      </View>
      <View style={styles.rowActions}>
        {onStage ? (
          <>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => (micOn ? onMute?.(participantId) : onUnmute?.(participantId))}
            >
              <Text style={styles.secondaryText}>
                {micOn
                  ? t('liveBroadcast.groupStage.mute', { defaultValue: 'Mute' })
                  : t('liveBroadcast.groupStage.unmute', { defaultValue: 'Unmute' })}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.denyBtn}
              onPress={() => onRemove?.(participantId)}
            >
              <Text style={styles.denyText}>
                {t('liveBroadcast.groupStage.remove', { defaultValue: 'Remove' })}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={[styles.allowBtn, stageFull && styles.btnDisabled]}
            disabled={stageFull}
            onPress={() => {
              if (stageFull) {
                Alert.alert(
                  t('liveBroadcast.groupStage.stageFullTitle', { defaultValue: 'Stage full' }),
                  t('liveBroadcast.groupStage.stageFullBody', {
                    defaultValue: 'Remove a guest before inviting another (max {{count}}).',
                    count: MAX_STAGE_GUESTS,
                  })
                );
                return;
              }
              onInvite?.(participantId);
            }}
          >
            <Text style={styles.allowText}>
              {t('liveBroadcast.groupStage.invite', { defaultValue: 'Invite' })}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function HostRaiseHandListener({ onInvite, stageFull }) {
  const { t } = useTranslation();
  const seenRef = useRef(new Set());
  const lastIndexRef = useRef(0);
  const onInviteRef = useRef(onInvite);
  const stageFullRef = useRef(stageFull);
  onInviteRef.current = onInvite;
  stageFullRef.current = stageFull;

  const handleRaiseHandMessage = useCallback(
    (data) => {
      const payload = decodePubSubMessage(data);
      const senderName = payload.senderName || 'Viewer';
      const pid = payload.participantId || payload.senderId;
      if (!pid) return;
      const key = String(pid);
      if (seenRef.current.has(key)) return;
      seenRef.current.add(key);

      Alert.alert(
        t('liveBroadcast.groupStage.raiseHandTitle', { defaultValue: 'Raise hand' }),
        t('liveBroadcast.groupStage.raiseHandBody', {
          defaultValue: '{{name}} wants to speak.',
          name: senderName,
        }),
        [
          {
            text: t('common.cancel', { defaultValue: 'Dismiss' }),
            style: 'cancel',
            onPress: () => seenRef.current.delete(key),
          },
          {
            text: t('liveBroadcast.groupStage.inviteToStage', {
              defaultValue: 'Invite to stage',
            }),
            onPress: () => {
              seenRef.current.delete(key);
              if (stageFullRef.current) {
                Alert.alert(
                  t('liveBroadcast.groupStage.stageFullTitle', { defaultValue: 'Stage full' }),
                  t('liveBroadcast.groupStage.stageFullBody', {
                    defaultValue: 'Remove a guest before inviting another (max {{count}}).',
                    count: MAX_STAGE_GUESTS,
                  })
                );
                return;
              }
              onInviteRef.current?.(pid);
            },
          },
        ]
      );
    },
    [t]
  );

  const { messages } = usePubSub('RAISE_HAND', {
    onMessageReceived: handleRaiseHandMessage,
  });

  // Same pattern as live hearts/chat — messages[] is more reliable than onMessageReceived alone.
  useEffect(() => {
    const msgs = messages || [];
    for (let i = lastIndexRef.current; i < msgs.length; i += 1) {
      handleRaiseHandMessage(msgs[i]);
    }
    lastIndexRef.current = msgs.length;
  }, [messages, handleRaiseHandMessage]);

  return null;
}

/**
 * Host: raise-hand alerts + guest list to invite/mute/remove. Inside MeetingProvider.
 */
export default function LiveHostGuestControls({ visible, onClose }) {
  const { t } = useTranslation();
  const { participants, localParticipant } = useMeeting();
  const [modePublish, setModePublish] = useState(null);
  const [controlPublish, setControlPublish] = useState(null);

  const remoteIds = useMemo(() => {
    const localId = localParticipant?.id;
    if (!(participants instanceof Map)) return [];
    return [...participants.keys()].filter(
      (id) => id && id !== localId && !isHostParticipantId(id)
    );
  }, [participants, localParticipant?.id]);

  const onStageIds = useMemo(() => {
    return listOnStageGuestIds(participants, {
      localId: localParticipant?.id,
      max: MAX_STAGE_GUESTS,
    });
  }, [participants, localParticipant?.id]);

  const onStageSet = useMemo(() => new Set(onStageIds.map(String)), [onStageIds]);
  const watchingIds = useMemo(
    () => remoteIds.filter((id) => !onStageSet.has(String(id))),
    [remoteIds, onStageSet]
  );
  const stageFull = onStageIds.length >= MAX_STAGE_GUESTS;

  const invite = (pid) => {
    if (stageFull) {
      Alert.alert(
        t('liveBroadcast.groupStage.stageFullTitle', { defaultValue: 'Stage full' }),
        t('liveBroadcast.groupStage.stageFullBody', {
          defaultValue: 'Remove a guest before inviting another (max {{count}}).',
          count: MAX_STAGE_GUESTS,
        })
      );
      return;
    }
    setModePublish({
      participantId: pid,
      mode: 'SEND_AND_RECV',
      token: `${pid}:SEND_AND_RECV:${Date.now()}`,
    });
    Alert.alert(
      t('liveBroadcast.groupStage.inviteSentTitle', { defaultValue: 'Invite sent' }),
      t('liveBroadcast.groupStage.inviteSentBody', {
        defaultValue: 'Waiting for the viewer to accept and join the stage.',
      })
    );
  };

  const remove = (pid) => {
    const ts = Date.now();
    setModePublish({
      participantId: pid,
      mode: 'RECV_ONLY',
      token: `${pid}:RECV_ONLY:${ts}`,
    });
    setControlPublish({
      participantId: pid,
      action: 'remove',
      token: `${pid}:remove:${ts}`,
    });
  };

  return (
    <>
      <HostRaiseHandListener onInvite={invite} stageFull={stageFull} />
      {modePublish ? (
        <StageCommandPublisher
          command={modePublish}
          onDone={() => setModePublish(null)}
        />
      ) : null}
      {controlPublish ? (
        <StageCommandPublisher
          command={controlPublish}
          onDone={() => setControlPublish(null)}
        />
      ) : null}
      {!visible ? null : (
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {t('liveBroadcast.groupStage.panelTitle', {
                defaultValue: 'Guests ({{onStage}}/{{max}} on stage)',
                onStage: onStageIds.length,
                max: MAX_STAGE_GUESTS,
              })}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.list}>
            {remoteIds.length === 0 ? (
              <Text style={styles.empty}>
                {t('liveBroadcast.groupStage.noViewers', {
                  defaultValue: 'No viewers in the room yet.',
                })}
              </Text>
            ) : (
              <>
                <Text style={styles.section}>
                  {t('liveBroadcast.groupStage.onStage', { defaultValue: 'On stage' })} (
                  {onStageIds.length})
                </Text>
                {onStageIds.length === 0 ? (
                  <Text style={styles.emptySection}>
                    {t('liveBroadcast.groupStage.noOnStage', {
                      defaultValue: 'No guests on stage.',
                    })}
                  </Text>
                ) : (
                  onStageIds.map((id) => (
                    <GuestRow
                      key={id}
                      participantId={id}
                      onStage
                      stageFull={stageFull}
                      onInvite={invite}
                      onRemove={remove}
                      onMute={(pid) =>
                        setControlPublish({
                          participantId: pid,
                          action: 'mute',
                          token: `${pid}:mute:${Date.now()}`,
                        })
                      }
                      onUnmute={(pid) =>
                        setControlPublish({
                          participantId: pid,
                          action: 'unmute',
                          token: `${pid}:unmute:${Date.now()}`,
                        })
                      }
                    />
                  ))
                )}
                <Text style={[styles.section, styles.sectionSpaced]}>
                  {t('liveBroadcast.groupStage.watching', { defaultValue: 'Watching' })} (
                  {watchingIds.length})
                </Text>
                {watchingIds.length === 0 ? (
                  <Text style={styles.emptySection}>
                    {t('liveBroadcast.groupStage.noWatching', {
                      defaultValue: 'No viewers waiting.',
                    })}
                  </Text>
                ) : (
                  watchingIds.map((id) => (
                    <GuestRow
                      key={id}
                      participantId={id}
                      onStage={false}
                      stageFull={stageFull}
                      onInvite={invite}
                      onRemove={remove}
                    />
                  ))
                )}
              </>
            )}
          </ScrollView>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '55%',
    backgroundColor: 'rgba(10,10,10,0.96)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    zIndex: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginRight: 12,
  },
  close: {
    color: '#fff',
    fontSize: 22,
  },
  list: {
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
  section: {
    color: '#a77df8',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sectionSpaced: {
    marginTop: 18,
  },
  empty: {
    color: '#888',
    textAlign: 'center',
    marginTop: 20,
    fontSize: 14,
  },
  emptySection: {
    color: '#666',
    fontSize: 13,
    marginTop: 6,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  rowInfo: {
    flex: 1,
    marginRight: 10,
  },
  rowName: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  rowMeta: {
    color: '#999',
    fontSize: 12,
    marginTop: 4,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  allowBtn: {
    backgroundColor: '#a77df8',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  allowText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  secondaryBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  secondaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  denyBtn: {
    backgroundColor: 'rgba(255,71,87,0.85)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  denyText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
});
