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
import {
  decodePubSubMessage,
  encodePubSubPayload,
  publishStageCommand,
  STAGE_CONTROL_TOPIC,
} from '../lib/livePubSubPayload';

/**
 * Always-mounted CHANGE_MODE_{id} publisher (VideoSDK invite-guest docs).
 * Must stay subscribed — remounting one-shot publishers race and drop invites
 * (especially raise-hand → "Invite to stage" while the guests sheet is closed).
 */
function PersistentChangeModePublisher({ participantId, command, onPublished }) {
  const { publish } = usePubSub(`CHANGE_MODE_${participantId}`, {});
  const publishRef = useRef(publish);
  publishRef.current = publish;
  const onPublishedRef = useRef(onPublished);
  onPublishedRef.current = onPublished;
  const lastTokenRef = useRef('');

  useEffect(() => {
    if (!command?.token || !command?.mode) return undefined;
    if (String(command.participantId) !== String(participantId)) return undefined;
    if (lastTokenRef.current === command.token) return undefined;
    lastTokenRef.current = command.token;

    let cancelled = false;
    (async () => {
      try {
        // Docs shape: publish({ mode: "SEND_AND_RECV" })
        await Promise.resolve(
          publishRef.current({ mode: command.mode }, { persist: false })
        );
      } catch (_) {
        try {
          await Promise.resolve(
            publishRef.current(
              encodePubSubPayload({
                mode: command.mode,
                targetParticipantId: participantId,
              }),
              { persist: false }
            )
          );
        } catch (__) {
          /* best-effort */
        }
      } finally {
        if (!cancelled) onPublishedRef.current?.(command.token);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [command?.token, command?.participantId, command?.mode, participantId]);

  return null;
}

/** STAGE_CONTROL bus for invite backup + mute/unmute/remove actions. */
function StableStageControlBus({ command, onDone }) {
  const { publish: publishStage } = usePubSub(STAGE_CONTROL_TOPIC, {});
  const publishStageRef = useRef(publishStage);
  publishStageRef.current = publishStage;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const lastTokenRef = useRef('');

  useEffect(() => {
    if (!command?.participantId || !command?.token) return undefined;
    if (lastTokenRef.current === command.token) return undefined;
    lastTokenRef.current = command.token;

    let cancelled = false;
    const pid = String(command.participantId);

    (async () => {
      try {
        if (command.mode) {
          await publishStageCommand(publishStageRef.current, {
            mode: command.mode,
            targetParticipantId: pid,
            participantId: pid,
          });
        }
        if (command.action) {
          await publishStageCommand(publishStageRef.current, {
            action: command.action,
            targetParticipantId: pid,
            participantId: pid,
          });
        }
      } catch (_) {
        /* best-effort */
      } finally {
        if (!cancelled) onDoneRef.current?.(command.token);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [command?.token, command?.participantId, command?.mode, command?.action]);

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
  // Docs pattern: each row owns CHANGE_MODE_{id} publish (most reliable when sheet open).
  const { publish: publishChangeMode } = usePubSub(`CHANGE_MODE_${participantId}`, {});

  if (isLocal) return null;
  if (isHostParticipantId(participantId)) return null;

  const name = displayName || participantId?.slice(0, 8) || 'Guest';

  const inviteDirect = async () => {
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
    try {
      // Official invite-guest guide: publish({ mode: "SEND_AND_RECV" })
      await Promise.resolve(publishChangeMode({ mode: 'SEND_AND_RECV' }, { persist: false }));
    } catch (_) {
      /* fall through to bus */
    }
    onInvite?.(participantId);
  };

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
            onPress={inviteDirect}
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
      const senderName = payload.senderName || data?.senderName || 'Viewer';
      // Prefer VideoSDK envelope senderId (real meeting participant id).
      const pid =
        payload.participantId ||
        data?.senderId ||
        payload.senderId ||
        null;
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
  const [pendingCommand, setPendingCommand] = useState(null);
  const doneTokensRef = useRef(new Set());

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

  // Keep CHANGE_MODE publishers subscribed for every remote + pending target.
  const publisherIds = useMemo(() => {
    const set = new Set(remoteIds.map(String));
    if (pendingCommand?.participantId) set.add(String(pendingCommand.participantId));
    return [...set];
  }, [remoteIds, pendingCommand?.participantId]);

  const clearPendingIfDone = useCallback((token) => {
    if (!token) return;
    doneTokensRef.current.add(token);
    // Clear after both CHANGE_MODE + STAGE_CONTROL paths have had a chance;
    // either path alone is enough to deliver the invite.
    setPendingCommand((prev) => (prev?.token === token ? null : prev));
  }, []);

  const invite = useCallback(
    (pid) => {
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
      setPendingCommand({
        participantId: String(pid),
        mode: 'SEND_AND_RECV',
        token: `${pid}:SEND_AND_RECV:${Date.now()}`,
      });
    },
    [stageFull, t]
  );

  const remove = useCallback((pid) => {
    // Demote via STAGE_CONTROL action only — do not publish SIGNALLING_ONLY on
    // CHANGE_MODE_{id} (that topic is reserved for SEND_AND_RECV invites per docs Step 3).
    setPendingCommand({
      participantId: String(pid),
      action: 'remove',
      token: `${pid}:remove:${Date.now()}`,
    });
  }, []);

  const mute = useCallback((pid) => {
    setPendingCommand({
      participantId: String(pid),
      action: 'mute',
      token: `${pid}:mute:${Date.now()}`,
    });
  }, []);

  const unmute = useCallback((pid) => {
    setPendingCommand({
      participantId: String(pid),
      action: 'unmute',
      token: `${pid}:unmute:${Date.now()}`,
    });
  }, []);

  return (
    <>
      <HostRaiseHandListener onInvite={invite} stageFull={stageFull} />
      {/* Always mounted — works even when guests sheet is closed (raise-hand invite). */}
      {publisherIds.map((id) => (
        <PersistentChangeModePublisher
          key={`cm-${id}`}
          participantId={id}
          command={pendingCommand}
          onPublished={clearPendingIfDone}
        />
      ))}
      <StableStageControlBus command={pendingCommand} onDone={clearPendingIfDone} />
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
                      onMute={mute}
                      onUnmute={unmute}
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
