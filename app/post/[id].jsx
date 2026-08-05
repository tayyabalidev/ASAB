import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { normalizeRouteParam } from '../../lib/notificationNavigation';

/**
 * Legacy /post/:id route — redirects to the Home-style vertical feed.
 * The old Post Details screen has been removed.
 */
export default function PostRedirect() {
  const { id: idParam } = useLocalSearchParams();
  const id = normalizeRouteParam(idParam);

  useEffect(() => {
    if (!id) {
      router.replace('/(tabs)/home');
      return;
    }
    router.replace({
      pathname: '/(tabs)/home',
      params: { postId: id },
    });
  }, [id]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator color="#fff" />
    </View>
  );
}
