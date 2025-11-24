import { useState, useEffect } from "react";
import { View, Text, Image, TouchableOpacity, Linking, StyleSheet } from "react-native";
import { useGlobalContext } from "../context/GlobalProvider";
import { incrementAdViewCount, incrementAdClickCount } from "../lib/appwrite";

const AdvertisementCard = ({ advertisement, style }) => {
  const { theme, isDarkMode } = useGlobalContext();
  const [viewTracked, setViewTracked] = useState(false);

  useEffect(() => {
    // Track view when component mounts
    // Use originalAdId if available (from home page), otherwise use $id
    const adId = advertisement?.originalAdId || advertisement?.$id;
    
    if (adId && !viewTracked) {
      // Only track if it's a real ad ID (not the modified one from home page)
      if (!adId.startsWith('ad_')) {
        incrementAdViewCount(adId);
        setViewTracked(true);
      } else if (advertisement?.originalAdId) {
        // If we have originalAdId, use that
        incrementAdViewCount(advertisement.originalAdId);
        setViewTracked(true);
      }
    }
  }, [advertisement?.$id, advertisement?.originalAdId, viewTracked]);

  const handlePress = async () => {
    if (!advertisement) return;

    // Track click - use originalAdId if available, otherwise use $id
    const adId = advertisement?.originalAdId || advertisement?.$id;
    if (adId && !adId.startsWith('ad_')) {
      incrementAdClickCount(adId);
    } else if (advertisement?.originalAdId) {
      incrementAdClickCount(advertisement.originalAdId);
    }

    // Open link if available
    if (advertisement.linkUrl) {
      try {
        const canOpen = await Linking.canOpenURL(advertisement.linkUrl);
        if (canOpen) {
          await Linking.openURL(advertisement.linkUrl);
        }
      } catch (error) {
        console.error("Error opening ad link:", error);
      }
    }
  };

  if (!advertisement) return null;

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.8}
      style={[
        styles.container,
        {
          backgroundColor: isDarkMode ? 'rgba(15,23,42,0.6)' : theme.surface,
          borderColor: theme.border,
        },
        style,
      ]}
    >
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Ad</Text>
      </View>
      
      {advertisement.image && (
        <Image
          source={{ uri: advertisement.image }}
          style={styles.image}
          resizeMode="cover"
        />
      )}
      
      <View style={styles.content}>
        {advertisement.title && (
          <Text
            style={[styles.title, { color: theme.textPrimary }]}
            numberOfLines={2}
          >
            {advertisement.title}
          </Text>
        )}
        {advertisement.description && (
          <Text
            style={[styles.description, { color: theme.textSecondary }]}
            numberOfLines={2}
          >
            {advertisement.description}
          </Text>
        )}
        {advertisement.linkUrl && (
          <Text style={[styles.link, { color: theme.accent }]}>
            Learn more →
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    marginVertical: 8,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    zIndex: 10,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: 'Poppins-Medium',
  },
  image: {
    width: '100%',
    height: 200,
  },
  content: {
    padding: 16,
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
  },
  description: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
  },
  link: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    marginTop: 4,
  },
});

export default AdvertisementCard;

