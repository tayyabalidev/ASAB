/**
 * Floating VideoSDK log viewer for TestFlight / devices without Xcode.
 * Copy via Share sheet (paste into Notes, email, etc.).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Share,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  clearVideosdkTraceLogs,
  getVideosdkTraceLogText,
  getVideosdkTraceLogs,
  isVideosdkDebugUiEnabled,
  subscribeVideosdkTraceLogs,
  videosdkTrace,
} from '../lib/videosdkTrace';

export default function VideosdkDebugPanel() {
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const [lines, setLines] = useState([]);
  const scrollRef = useRef(null);

  const refresh = useCallback(() => {
    setLines(getVideosdkTraceLogs());
  }, []);

  useEffect(() => {
    refresh();
    videosdkTrace('S2_SDK', 'DEBUG_PANEL_READY', {
      platform: Platform.OS,
    });
    return subscribeVideosdkTraceLogs(refresh);
  }, [refresh]);

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
    const text = getVideosdkTraceLogText();
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

  if (!expanded) {
    return (
      <TouchableOpacity
        style={[styles.fab, { bottom: Math.max(insets.bottom, 12) + 72 }]}
        onPress={() => setExpanded(true)}
        activeOpacity={0.85}
        accessibilityLabel="Open VideoSDK debug logs"
      >
        <Text style={styles.fabText}>SDK</Text>
        {lines.length > 0 ? (
          <View style={styles.fabBadge}>
            <Text style={styles.fabBadgeText}>{lines.length > 99 ? '99+' : lines.length}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.toolbar}>
        <Text style={styles.title}>VideoSDK logs ({lines.length})</Text>
        <View style={styles.toolbarActions}>
          <TouchableOpacity style={styles.toolBtn} onPress={handleCopy}>
            <Text style={styles.toolBtnText}>Share / Copy</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn} onPress={handleClear}>
            <Text style={styles.toolBtnText}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn} onPress={() => setExpanded(false)}>
            <Text style={styles.toolBtnText}>Hide</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.hint}>
        Share to Notes or Messages — filter: S1_ROOM, S2_SDK, S3_JOIN, MEETING_JOINED, HLS_STARTED
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
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    left: 12,
    zIndex: 99999,
    elevation: 99999,
    backgroundColor: 'rgba(20, 24, 36, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.55)',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: {
    color: '#34d399',
    fontWeight: '800',
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
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
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 99998,
    elevation: 99998,
    maxHeight: '42%',
    backgroundColor: 'rgba(8, 10, 18, 0.96)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(52, 211, 153, 0.35)',
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
    flex: 1,
    maxHeight: 280,
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
