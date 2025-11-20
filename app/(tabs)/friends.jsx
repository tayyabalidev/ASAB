import { useState, useEffect, useCallback, useMemo } from "react";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { View, Text, FlatList, TouchableOpacity, Image, TextInput, ImageBackground } from "react-native";
import { Query } from 'react-native-appwrite';
import { LinearGradient } from 'expo-linear-gradient';

import { icons, images } from "../../constants";
import { databases, appwriteConfig, getCurrentUser } from "../../lib/appwrite";
import { useGlobalContext } from "../../context/GlobalProvider";
import { useTranslation } from "react-i18next";

const Friends = () => {
  const { user: currentUser, isRTL, theme, isDarkMode } = useGlobalContext();
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const themedColor = useCallback(
    (darkColor, lightColor) => (isDarkMode ? darkColor : lightColor),
    [isDarkMode]
  );

  const screenBackgroundImage = useMemo(
    () => (isDarkMode ? images.textBackgroundDark : images.usersPage),
    [isDarkMode]
  );

  const panelBackgroundImage = useMemo(
    () => (isDarkMode ? images.textBackgroundDark : images.textBackgroundLight),
    [isDarkMode]
  );

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        const userResponse = await databases.listDocuments(
          appwriteConfig.databaseId,
          appwriteConfig.userCollectionId
        );
        
        // Filter out the current user
        const otherUsers = userResponse.documents.filter(user => user.$id !== currentUser?.$id);
        setUsers(otherUsers);
      } catch (error) {

      } finally {
        setLoading(false);
      }
    };

    if (currentUser) {
      fetchUsers();
    }
  }, [currentUser]);

  const filteredUsers = users.filter(user =>
    user.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleUserPress = useCallback((userId) => {
    router.push(`/profile/${userId}`);
  }, []);

  const renderUser = useCallback(({ item }) => (
    <TouchableOpacity
      onPress={() => handleUserPress(item.$id)}
      activeOpacity={0.7}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: theme.surface,
        borderRadius: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: theme.border,
        shadowColor: themedColor('rgba(0,0,0,0.4)', 'rgba(15,23,42,0.08)'),
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 4,
      }}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: theme.border,
          justifyContent: 'center',
          alignItems: 'center',
          marginRight: 16,
          overflow: 'hidden',
          backgroundColor: theme.surfaceMuted,
        }}
      >
        <Image
          source={item.avatar && typeof item.avatar === 'string' && item.avatar.trim() !== '' ? { uri: item.avatar } : images.profile}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
          onError={() => {
            // Fallback handled by default source
          }}
        />
      </View>

      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: theme.textPrimary,
            fontFamily: 'Poppins-SemiBold',
            fontSize: 18,
            marginBottom: 4,
            textAlign: isRTL ? 'right' : 'left',
          }}
        >
          {item.username}
        </Text>
        <Text
          style={{
            color: theme.textSecondary,
            fontSize: 14,
            textAlign: isRTL ? 'right' : 'left',
          }}
        >
          {item.isPrivate ? t("community.privateProfile") : t("community.publicProfile")}
        </Text>
      </View>

      <Image
        source={icons.rightArrow}
        style={{ width: 20, height: 20, tintColor: theme.textSecondary }}
        resizeMode="contain"
      />
    </TouchableOpacity>
  ), [theme, isRTL, isDarkMode, themedColor, t, handleUserPress, images, icons]);

  return (
    <SafeAreaView style={{ backgroundColor: theme.background, flex: 1 }}>
      <View style={{ flex: 1, position: 'relative' }}>
        <Image
          source={screenBackgroundImage || images.backgroundImage}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100%',
            height: '100%',
            resizeMode: 'cover',
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: themedColor('rgba(0,0,0,0.55)', 'rgba(255,255,255,0.9)'),
          }}
        />
        <LinearGradient
          colors={
            isDarkMode
              ? ['rgba(15,23,42,0.85)', 'rgba(2,6,23,0.85)', theme.background]
              : ['rgba(248,250,252,0.9)', 'rgba(241,245,249,0.9)', theme.background]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ flex: 1 }}
        >
          <ImageBackground
            source={panelBackgroundImage || images.backgroundImage}
            style={{ flex: 1 }}
            imageStyle={{ opacity: isDarkMode ? 0.45 : 0.85 }}
          >
            <View style={{ paddingHorizontal: 20, paddingVertical: 24, flex: 1 }}>
              <Text
                style={{
                  fontSize: 24,
                  fontFamily: 'Poppins-SemiBold',
                  color: theme.textPrimary,
                  marginBottom: 24,
                  textAlign: isRTL ? 'right' : 'left',
                }}
              >
                {t("community.discoverTitle")}
              </Text>
              
              {/* Search Input */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: themedColor('rgba(15,23,42,0.6)', 'rgba(255,255,255,0.8)'),
                  borderRadius: 16,
                  paddingHorizontal: 18,
                  paddingVertical: 12,
                  marginBottom: 24,
                  borderWidth: 1,
                  borderColor: themedColor('rgba(255,255,255,0.15)', theme.border),
                }}
              >
                <Image
                  source={icons.search}
                  style={{ width: 20, height: 20, marginRight: 12, tintColor: theme.textSecondary }}
                  resizeMode="contain"
                />
                <TextInput
                  placeholder={t("community.searchPlaceholder")}
                  placeholderTextColor={theme.textSecondary}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  style={{
                    flex: 1,
                    color: theme.textPrimary,
                    fontSize: 16,
                    textAlign: isRTL ? 'right' : 'left',
                  }}
                />
              </View>

              {loading ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ color: theme.textPrimary, fontSize: 18 }}>{t("community.loading")}</Text>
                </View>
              ) : (
                <FlatList
                  data={filteredUsers}
                  keyExtractor={(item) => item.$id}
                  renderItem={renderUser}
                  showsVerticalScrollIndicator={false}
                  removeClippedSubviews={true}
                  maxToRenderPerBatch={10}
                  updateCellsBatchingPeriod={50}
                  initialNumToRender={10}
                  windowSize={10}
                  ListEmptyComponent={() => (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 48 }}>
                      <Text style={{ color: theme.textSecondary, fontSize: 16, textAlign: 'center', lineHeight: 24 }}>
                        {searchQuery
                          ? t("community.emptySearch")
                          : t("community.emptyAll")}
                      </Text>
                    </View>
                  )}
                />
              )}
            </View>
          </ImageBackground>
        </LinearGradient>
      </View>
    </SafeAreaView>
  );
};

export default Friends; 