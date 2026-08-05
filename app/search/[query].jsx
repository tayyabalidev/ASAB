import { useEffect } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';

/** Legacy `/search/:query` → Instagram-style search screen with live results. */
export default function SearchQueryRedirect() {
  const { query } = useLocalSearchParams();
  const q = Array.isArray(query) ? query[0] : query;

  useEffect(() => {
    router.replace({
      pathname: '/search',
      params: q ? { q: String(q) } : undefined,
    });
  }, [q]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
      <ActivityIndicator color="#a77df8" />
    </View>
  );
}
