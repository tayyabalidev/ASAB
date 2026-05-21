/**
 * Floating VideoSDK log viewer for TestFlight / devices without Xcode.
 * Collapsed: small FAB only (does not block the app). Expanded: Modal sheet for logs.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ScrollView,
  StyleSheet,
  Share,
  Alert,
  Platform,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import {
  clearVideosdkTraceLogs,
  getVideosdkTraceLogText,
  getVideosdkTraceLogs,
  getVideosdkDebugBuildLabel,
  isVideosdkDebugUiEnabled,
  subscribeVideosdkTraceLogs,
  registerVideosdkDebugPanelOpen,
  requestOpenVideosdkDebugPanel,
  videosdkTrace,
} from '../lib/videosdkTrace';

export function VideosdkLogsOpenerButton({ style, label = 'VideoSDK logs' }) {
  if (!isVideosdkDebugUiEnabled()) return null;
  return (
    <TouchableOpacity
      style={[openerStyles.btn, style]}
      onPress={() => requestOpenVideosdkDebugPanel()}
      activeOpacity={0.85}
    >
      <Text style={openerStyles.btnText}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function VideosdkDebugPanel() {
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const [lines, setLines] = useState([]);
  const scrollRef = useRef(null);
  const buildLabel = getVideosdkDebugBuildLabel();

  const refresh = useCallback(() => {
    setLines(getVideosdkTraceLogs());
  }, []);

  useEffect(() => registerVideosdkDebugPanelOpen(() => setExpanded(true)), []);

  useEffect(() => {
    refresh();
    videosdkTrace('S2_SDK', 'DEBUG_PANEL_READY', {
      platform: Platform.OS,
      build: buildLabel,
      executionEnvironment: Constants.executionEnvironment,
    });
    return subscribeVideosdkTraceLogs(refresh);
  }, [refresh, buildLabel]);

  useEffect(() => {
    if (!expanded || lines.length === 0) return;
    const t = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(t);
  }, [expanded, lines.length]);

  if (!isVideosdkDebugUiEnabled()) {
    return null;
  }

  const handleCopy = async () => {
    const header = `ASAB VideoSDK logs — v${buildLabel} — ${Platform.OS}\n\n`;
    const text = header + getVideosdkTraceLogText();
    if (!text.trim()) {
      Alert.alert('VideoSDK logs', 'No logs captured yet. Start a call or go live first.');
      return;
    }
    try {
      await Share.share({
        message: text,
        title: 'ASAB VideoSDK debug logs',
      });
    } catch (e) {
      Alert.alert('Share failed', e?.message || 'Could not open share sheet.');
    }
  };

  const handleClear = () => {
    clearVideosdkTraceLogs();
    videosdkTrace('S2_SDK', 'DEBUG_PANEL_CLEARED', null);
    refresh();
  };

  const handleHide = () => {
    setExpanded(false);
  };

  const fabTop = Math.max(insets.top, 12) + 8;

  // Collapsed: no Modal — parent _layout overlay uses pointerEvents="box-none" so only the FAB receives taps.
  if (!expanded) {
    return (
      <View style={styles.fabHost} pointerEvents="box-none">
        <TouchableOpacity
          style={[styles.fab, { top: fabTop }]}
          onPress={() => setExpanded(true)}
          activeOpacity={0.85}
          accessibilityLabel="Open VideoSDK debug logs"
        >
          <Text style={styles.fabText}>LOG</Text>
          <Text style={styles.fabSub}>v{buildLabel}</Text>
          {lines.length > 0 ? (
            <View style={styles.fabBadge}>
              <Text style={styles.fabBadgeText}>{lines.length > 99 ? '99+' : lines.length}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>
    );
  }

  // Expanded: Modal only while viewing logs. Tap dimmed area or Hide to close.
  return (
    <Modal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={handleHide}
    >
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={handleHide} accessibilityLabel="Close logs" />
        <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <View style={styles.toolbar}>
            <Text style={styles.title}>
              VideoSDK logs ({lines.length}) · v{buildLabel}
            </Text>
            <View style={styles.toolbarActions}>
              <TouchableOpacity style={styles.toolBtn} onPress={handleCopy}>
                <Text style={styles.toolBtnText}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.toolBtn} onPress={handleClear}>
                <Text style={styles.toolBtnText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.toolBtn} onPress={handleHide}>
                <Text style={styles.toolBtnText}>Hide</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.hint}>
            Tap outside the panel or Hide to use the app again. Share logs to Notes after Go Live.
          </Text>
          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            nestedScrollEnabled
          >
            {lines.length === 0 ? (
              <Text style={styles.empty}>Waiting for VideoSDK events…</Text>
            ) : (
              lines.map((line, idx) => (
                <Text key={`${idx}-${line.slice(0, 24)}`} style={styles.line}>
                  {line}
                </Text>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const openerStyles = StyleSheet.create({
  btn: {
    backgroundColor: 'rgba(234, 88, 12, 0.92)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  btnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
});

const styles = StyleSheet.create({
  fabHost: {
    ...StyleSheet.absoluteFillObject,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  fab: {
    position: 'absolute',
    right: 12,
    backgroundColor: 'rgba(234, 88, 12, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  fabSub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 9,
    fontWeight: '600',
    marginTop: 2,
  },
  fabBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  fabBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  panel: {
    maxHeight: '52%',
    backgroundColor: 'rgba(8, 10, 18, 0.98)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(234, 88, 12, 0.5)',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 10,
    flexWrap: 'wrap',
    gap: 8,
  },
  title: {
    color: '#e2e8f0',
    fontWeight: '700',
    fontSize: 14,
  },
  toolbarActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  toolBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  toolBtnText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  hint: {
    color: '#64748b',
    fontSize: 10,
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  scroll: {
    maxHeight: 320,
  },
  scrollContent: {
    paddingHorizontal: 10,
    paddingBottom: 12,
  },
  line: {
    color: '#cbd5e1',
    fontSize: 10,
    lineHeight: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 2,
  },
  empty: {
    color: '#64748b',
    fontSize: 12,
    fontStyle: 'italic',
    padding: 8,
  },
});
