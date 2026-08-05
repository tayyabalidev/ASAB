import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useGlobalContext } from '../../context/GlobalProvider';
import { images } from '../../constants';
import {
  searchUsersAndVideos,
  getRecentSearches,
  addRecentSearch,
  removeRecentSearch,
  clearRecentSearches,
} from '../../lib/searchService';
import { safeRouterBack } from '../../lib/routerHelpers';
import { navigateToHomePost } from '../../lib/notificationNavigation';

const DEBOUNCE_MS = 280;

function ResultRow({ item, onPress, theme }) {
  const isUser = item.type === 'user';
  const imageUri = isUser ? item.avatar : item.thumbnail;
  const title = isUser ? item.username : item.title;
  const subtitle = isUser ? item.fullName : item.creatorName;

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onPress(item)}
      activeOpacity={0.75}
    >
      <Image
        source={imageUri ? { uri: imageUri } : images.profile}
        style={[styles.thumb, isUser ? styles.avatar : styles.videoThumb]}
      />
      <View style={styles.rowText}>
        <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]} numberOfLines={1}>
          {isUser ? subtitle : `Video · ${subtitle}`}
        </Text>
      </View>
      <View style={[styles.badge, { backgroundColor: theme.surfaceMuted || 'rgba(127,127,127,0.15)' }]}>
        <Text style={[styles.badgeText, { color: theme.textMuted || theme.textSecondary }]}>
          {isUser ? 'User' : 'Video'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function RecentRow({ item, onPress, onRemove, theme }) {
  const isUser = item.type === 'user';
  return (
    <TouchableOpacity style={styles.row} onPress={() => onPress(item)} activeOpacity={0.75}>
      <Image
        source={item.image ? { uri: item.image } : images.profile}
        style={[styles.thumb, isUser ? styles.avatar : styles.videoThumb]}
      />
      <View style={styles.rowText}>
        <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>
          {item.label}
        </Text>
        {item.subtitle ? (
          <Text style={[styles.subtitle, { color: theme.textSecondary }]} numberOfLines={1}>
            {item.subtitle}
          </Text>
        ) : null}
      </View>
      <TouchableOpacity
        onPress={() => onRemove(item)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={styles.removeBtn}
      >
        <Feather name="x" size={18} color={theme.textMuted || theme.textSecondary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

export default function SearchScreen() {
  const { t } = useTranslation();
  const { theme, isRTL } = useGlobalContext();
  const params = useLocalSearchParams();
  const initial = Array.isArray(params.q) ? params.q[0] : params.q || '';

  const [query, setQuery] = useState(String(initial || ''));
  const [results, setResults] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const requestIdRef = useRef(0);

  const loadRecent = useCallback(async () => {
    const list = await getRecentSearches();
    setRecent(list);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRecent();
      const tFocus = setTimeout(() => inputRef.current?.focus(), 200);
      return () => clearTimeout(tFocus);
    }, [loadRecent])
  );

  useEffect(() => {
    if (initial) {
      setQuery(String(initial));
    }
  }, [initial]);

  const runSearch = useCallback(async (q) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      setSearched(false);
      return;
    }
    const reqId = ++requestIdRef.current;
    setLoading(true);
    setSearched(true);
    try {
      const mixed = await searchUsersAndVideos(trimmed);
      if (reqId !== requestIdRef.current) return;
      setResults(mixed);
    } catch (_) {
      if (reqId !== requestIdRef.current) return;
      setResults([]);
    } finally {
      if (reqId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      setSearched(false);
      return undefined;
    }
    debounceRef.current = setTimeout(() => {
      runSearch(query);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  const openItem = useCallback(
    async (item) => {
      Keyboard.dismiss();
      const isUser = item.type === 'user';
      await addRecentSearch({
        type: item.type,
        id: item.id,
        label: isUser ? item.username || item.label : item.title || item.label,
        subtitle: isUser ? item.fullName || item.subtitle : item.creatorName || item.subtitle,
        image: isUser ? item.avatar || item.image : item.thumbnail || item.image,
      });
      await loadRecent();

      if (isUser) {
        router.push(`/(tabs)/profile/${item.id}`);
      } else {
        navigateToHomePost(router, item.id);
      }
    },
    [loadRecent]
  );

  const showRecent = !query.trim();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background || '#000' }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => safeRouterBack('/(tabs)/home')}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name={isRTL ? 'arrow-right' : 'arrow-left'} size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <View
          style={[
            styles.searchBox,
            {
              backgroundColor: theme.surface || 'rgba(255,255,255,0.08)',
              borderColor: theme.border || 'rgba(255,255,255,0.12)',
            },
          ]}
        >
          <Feather name="search" size={18} color={theme.textSecondary} style={{ marginRight: 8 }} />
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: theme.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}
            placeholder={t('search.placeholder', { defaultValue: 'Search users and videos' })}
            placeholderTextColor={theme.textMuted || theme.textSecondary}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="never"
          />
          {query.length > 0 ? (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x-circle" size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {showRecent ? (
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
            {t('search.recent', { defaultValue: 'Recent' })}
          </Text>
          {recent.length > 0 ? (
            <TouchableOpacity
              onPress={async () => {
                await clearRecentSearches();
                setRecent([]);
              }}
            >
              <Text style={[styles.clearAll, { color: theme.tabActive || '#a77df8' }]}>
                {t('search.clearAll', { defaultValue: 'Clear all' })}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
            {t('search.results', { defaultValue: 'Results' })}
          </Text>
          {loading ? <ActivityIndicator size="small" color={theme.tabActive || '#a77df8'} /> : null}
        </View>
      )}

      <FlatList
        data={showRecent ? recent : results}
        keyExtractor={(item) => `${item.type}:${item.id}`}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            {loading ? (
              <ActivityIndicator color={theme.tabActive || '#a77df8'} />
            ) : (
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                {showRecent
                  ? t('search.noRecent', { defaultValue: 'No recent searches' })
                  : searched
                    ? t('search.emptySubtitle', { query, defaultValue: `No results for "${query}"` })
                    : null}
              </Text>
            )}
          </View>
        )}
        renderItem={({ item }) =>
          showRecent ? (
            <RecentRow
              item={item}
              theme={theme}
              onPress={openItem}
              onRemove={async (r) => {
                const next = await removeRecentSearch(r.type, r.id);
                setRecent(next);
              }}
            />
          ) : (
            <ResultRow item={item} theme={theme} onPress={openItem} />
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: Platform.OS === 'android' ? 4 : 0,
    gap: 8,
  },
  backBtn: {
    padding: 4,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  clearAll: {
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 40,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  thumb: {
    backgroundColor: 'rgba(127,127,127,0.2)',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  videoThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  removeBtn: {
    padding: 4,
  },
  empty: {
    paddingTop: 48,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
  },
});
