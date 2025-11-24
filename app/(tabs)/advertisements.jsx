import { useState, useEffect, useMemo, useCallback } from "react";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  Alert,
  Image,
  ImageBackground,
  TouchableOpacity,
  ScrollView,
  Modal,
  ActivityIndicator,
  Linking,
} from "react-native";
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from "react-i18next";

import { icons, images } from "../../constants";
import { 
  createAdvertisement, 
  getAdvertiserAds, 
  updateAdvertisement, 
  deleteAdvertisement,
  uploadFile 
} from "../../lib/appwrite";
import { CustomButton, FormField } from "../../components";
import { useGlobalContext } from "../../context/GlobalProvider";

const SUBSCRIPTION_PLANS = [
  { id: 'daily', name: 'Daily', price: '$10', duration: '1 day' },
  { id: 'weekly', name: 'Weekly', price: '$50', duration: '7 days' },
  { id: 'monthly', name: 'Monthly', price: '$150', duration: '30 days' },
];

const Advertisements = () => {
  const { user, isRTL, theme, isDarkMode } = useGlobalContext();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [ads, setAds] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAd, setEditingAd] = useState(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    image: null,
    linkUrl: "",
    subscriptionPlan: "daily",
  });

  const themedColor = useCallback(
    (darkValue, lightValue) => (isDarkMode ? darkValue : lightValue),
    [isDarkMode]
  );

  const gradientColors = useMemo(
    () =>
      isDarkMode
        ? ["#0f172a", "#020617", "#000000"]
        : ["#FFFFFF", "#F5F3FF", theme.background],
    [isDarkMode, theme.background]
  );

  const screenBackgroundImage = useMemo(
    () => (isDarkMode ? images.textBackgroundDark : images.usersPage),
    [isDarkMode]
  );

  const panelBackgroundImage = useMemo(
    () => (isDarkMode ? images.textBackgroundDark : images.textBackgroundLight),
    [isDarkMode]
  );

  const overlayColor = useMemo(
    () => (isDarkMode ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.9)"),
    [isDarkMode]
  );

  useEffect(() => {
    if (user?.$id) {
      loadAds();
    }
  }, [user]);

  const loadAds = async () => {
    if (!user?.$id) {
      console.log("No user ID available, skipping ad load");
      return;
    }
    
    // Validate user ID before making the request
    if (typeof user.$id !== 'string' || user.$id.trim() === '') {
      console.error("Invalid user ID:", user.$id);
      Alert.alert(t("common.error"), "Invalid user information. Please login again.");
      return;
    }
    
    setLoading(true);
    try {
      console.log("Loading ads for user:", user.$id);
      const advertiserAds = await getAdvertiserAds(user.$id);
      console.log("Loaded ads count:", advertiserAds.length);
      setAds(advertiserAds);
    } catch (error) {
      console.error("Error in loadAds:", error);
      Alert.alert(t("common.error"), error.message || "Failed to load advertisements");
    } finally {
      setLoading(false);
    }
  };

  const openImagePicker = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('alerts.permissionRequiredTitle'), t('alerts.permissionRequiredMessage'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
        aspect: [16, 9],
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedAsset = result.assets[0];
        let fileName = selectedAsset.fileName || selectedAsset.name || selectedAsset.uri.split('/').pop() || `ad_${Date.now()}`;
        const baseName = fileName.split('.')[0];
        fileName = `${baseName}.jpg`;

        const file = {
          uri: selectedAsset.uri,
          name: fileName,
          type: 'image/jpeg',
          mimeType: 'image/jpeg',
          size: selectedAsset.fileSize || selectedAsset.size,
        };

        setForm({ ...form, image: file });
      }
    } catch (error) {
      Alert.alert(t("common.error"), t("alerts.mediaSelectError"));
    }
  };

  const handleCreate = async () => {
    if (!form.title.trim()) {
      return Alert.alert(t("common.error"), "Title is required");
    }

    if (!form.image) {
      return Alert.alert(t("common.error"), "Please select an image for your advertisement");
    }

    if (!user?.$id) {
      return Alert.alert(t("common.error"), "Please login to create advertisements");
    }

    setLoading(true);
    try {
      await createAdvertisement({
        ...form,
        advertiserId: user.$id,
        advertiserName: user.username || user.email || "Advertiser",
      });

      Alert.alert(t("common.success"), "Advertisement created successfully!");
      setForm({
        title: "",
        description: "",
        image: null,
        linkUrl: "",
        subscriptionPlan: "daily",
      });
      setShowCreateModal(false);
      loadAds();
    } catch (error) {
      Alert.alert(t("common.error"), error.message || "Failed to create advertisement");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (ad) => {
    setEditingAd(ad);
    setForm({
      title: ad.title || "",
      description: ad.description || "",
      image: null, // Don't preload image
      linkUrl: ad.linkUrl || "",
      subscriptionPlan: ad.subscriptionPlan || "daily",
    });
    setShowEditModal(true);
  };

  const handleUpdate = async () => {
    if (!form.title.trim()) {
      return Alert.alert(t("common.error"), "Title is required");
    }

    if (!editingAd) return;

    // Security check: Verify user owns this advertisement
    if (editingAd.advertiserId !== user?.$id) {
      return Alert.alert(t("common.error"), "You can only update your own advertisements");
    }

    setLoading(true);
    try {
      const updates = {
        title: form.title,
        description: form.description,
        linkUrl: form.linkUrl,
        subscriptionPlan: form.subscriptionPlan,
      };

      // Only update image if a new one was selected
      if (form.image) {
        const imageUrl = await uploadFile(form.image, "image");
        if (imageUrl) {
          updates.image = imageUrl;
        }
      }

      await updateAdvertisement(editingAd.$id, updates);

      Alert.alert(t("common.success"), "Advertisement updated successfully!");
      setShowEditModal(false);
      setEditingAd(null);
      loadAds();
    } catch (error) {
      Alert.alert(t("common.error"), error.message || "Failed to update advertisement");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (ad) => {
    // Security check: Verify user owns this advertisement
    if (ad.advertiserId !== user?.$id) {
      return Alert.alert(t("common.error"), "You can only delete your own advertisements");
    }

    Alert.alert(
      "Delete Advertisement",
      "Are you sure you want to delete this advertisement?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              await deleteAdvertisement(ad.$id);
              Alert.alert(t("common.success"), "Advertisement deleted successfully!");
              loadAds();
            } catch (error) {
              Alert.alert(t("common.error"), error.message || "Failed to delete advertisement");
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  const getPlanInfo = (planId) => {
    return SUBSCRIPTION_PLANS.find(p => p.id === planId) || SUBSCRIPTION_PLANS[0];
  };

  return (
    <SafeAreaView style={{ backgroundColor: theme.background, flex: 1 }}>
      <View style={{ flex: 1, position: "relative" }}>
        <Image
          source={screenBackgroundImage || images.backgroundImage}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: "100%",
            height: "100%",
            resizeMode: "cover",
          }}
        />
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: overlayColor,
          }}
        />
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ flex: 1 }}
        >
          <ImageBackground
            source={panelBackgroundImage || images.backgroundImage}
            style={{ flex: 1 }}
            imageStyle={{ opacity: isDarkMode ? 0.45 : 0.85 }}
          >
            {/* Header */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderBottomColor: theme.border,
            }}>
              <TouchableOpacity onPress={() => router.back()}>
                <Image
                  source={icons.left}
                  resizeMode="contain"
                  style={{ width: 24, height: 24, tintColor: theme.textPrimary }}
                />
              </TouchableOpacity>
              <Text style={{
                color: theme.textPrimary,
                fontSize: 20,
                fontFamily: "Poppins-SemiBold",
              }}>
                Advertisements
              </Text>
              <TouchableOpacity
                onPress={() => setShowCreateModal(true)}
                style={{
                  backgroundColor: theme.accent,
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 8,
                }}
              >
                <Text style={{ color: '#fff', fontFamily: 'Poppins-Medium' }}>Create</Text>
              </TouchableOpacity>
            </View>

            {loading && !ads.length ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={theme.accent} />
              </View>
            ) : (
              <ScrollView
                contentContainerStyle={{ padding: 16, gap: 16 }}
                showsVerticalScrollIndicator={false}
              >
                {ads.length === 0 ? (
                  <View style={{
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingVertical: 60,
                  }}>
                    <Text style={{
                      color: theme.textSecondary,
                      fontSize: 16,
                      fontFamily: 'Poppins-Medium',
                      marginBottom: 8,
                    }}>
                      No advertisements yet
                    </Text>
                    <Text style={{
                      color: theme.textSecondary,
                      fontSize: 14,
                      textAlign: 'center',
                    }}>
                      Create your first advertisement to reach users across the platform
                    </Text>
                  </View>
                ) : (
                  ads.map((ad) => {
                    const planInfo = getPlanInfo(ad.subscriptionPlan);
                    const isActive = ad.isActive && new Date(ad.endDate) > new Date();
                    
                    return (
                      <View
                        key={ad.$id}
                        style={{
                          backgroundColor: themedColor('rgba(15,23,42,0.6)', theme.surface),
                          borderRadius: 16,
                          padding: 16,
                          borderWidth: 1,
                          borderColor: theme.border,
                        }}
                      >
                        {ad.image && (
                          <Image
                            source={{ uri: ad.image }}
                            style={{
                              width: '100%',
                              height: 200,
                              borderRadius: 12,
                              marginBottom: 12,
                            }}
                            resizeMode="cover"
                          />
                        )}
                        <View style={{ gap: 8 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <Text style={{
                              color: theme.textPrimary,
                              fontSize: 18,
                              fontFamily: 'Poppins-SemiBold',
                              flex: 1,
                            }}>
                              {ad.title}
                            </Text>
                            <View style={{
                              backgroundColor: isActive ? '#10b981' : '#ef4444',
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              borderRadius: 6,
                            }}>
                              <Text style={{ color: '#fff', fontSize: 10, fontFamily: 'Poppins-Medium' }}>
                                {isActive ? 'Active' : 'Expired'}
                              </Text>
                            </View>
                          </View>
                          {ad.description && (
                            <Text style={{
                              color: theme.textSecondary,
                              fontSize: 14,
                              fontFamily: 'Poppins-Regular',
                            }}>
                              {ad.description}
                            </Text>
                          )}
                          <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
                            <View style={{
                              backgroundColor: theme.accentSoft,
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                              borderRadius: 8,
                            }}>
                              <Text style={{ color: theme.accent, fontSize: 12, fontFamily: 'Poppins-Medium' }}>
                                {planInfo.name} Plan
                              </Text>
                            </View>
                            <Text style={{ color: theme.textSecondary, fontSize: 12, alignSelf: 'center' }}>
                              Views: {ad.viewCount || 0} • Clicks: {ad.clickCount || 0}
                            </Text>
                          </View>
                          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                            Expires: {formatDate(ad.endDate)}
                          </Text>
                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                            <TouchableOpacity
                              onPress={() => handleEdit(ad)}
                              style={{
                                flex: 1,
                                backgroundColor: theme.accentSoft,
                                paddingVertical: 10,
                                borderRadius: 8,
                                alignItems: 'center',
                              }}
                            >
                              <Text style={{ color: theme.accent, fontFamily: 'Poppins-Medium' }}>Edit</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleDelete(ad)}
                              style={{
                                flex: 1,
                                backgroundColor: '#fee2e2',
                                paddingVertical: 10,
                                borderRadius: 8,
                                alignItems: 'center',
                              }}
                            >
                              <Text style={{ color: '#dc2626', fontFamily: 'Poppins-Medium' }}>Delete</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            )}
          </ImageBackground>
        </LinearGradient>
      </View>

      {/* Create Modal */}
      <Modal
        visible={showCreateModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.8)',
          justifyContent: 'flex-end',
        }}>
          <View style={{
            backgroundColor: theme.surface,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: 20,
            maxHeight: '90%',
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{
                color: theme.textPrimary,
                fontSize: 20,
                fontFamily: 'Poppins-SemiBold',
              }}>
                Create Advertisement
              </Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Text style={{ color: theme.textSecondary, fontSize: 24 }}>×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ gap: 16 }}>
                <FormField
                  title="Title *"
                  value={form.title}
                  placeholder="Enter advertisement title"
                  handleChangeText={(e) => setForm({ ...form, title: e })}
                />

                <FormField
                  title="Description"
                  value={form.description}
                  placeholder="Enter advertisement description"
                  handleChangeText={(e) => setForm({ ...form, description: e })}
                  multiline
                  numberOfLines={3}
                />

                <FormField
                  title="Link URL"
                  value={form.linkUrl}
                  placeholder="https://example.com"
                  handleChangeText={(e) => setForm({ ...form, linkUrl: e })}
                />

                <View>
                  <Text style={{
                    color: theme.textPrimary,
                    fontSize: 16,
                    fontFamily: 'Poppins-Medium',
                    marginBottom: 8,
                  }}>
                    Subscription Plan *
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {SUBSCRIPTION_PLANS.map((plan) => (
                      <TouchableOpacity
                        key={plan.id}
                        onPress={() => setForm({ ...form, subscriptionPlan: plan.id })}
                        style={{
                          flex: 1,
                          padding: 12,
                          borderRadius: 12,
                          borderWidth: 2,
                          borderColor: form.subscriptionPlan === plan.id ? theme.accent : theme.border,
                          backgroundColor: form.subscriptionPlan === plan.id ? theme.accentSoft : 'transparent',
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{
                          color: form.subscriptionPlan === plan.id ? theme.accent : theme.textPrimary,
                          fontFamily: 'Poppins-SemiBold',
                          fontSize: 14,
                        }}>
                          {plan.name}
                        </Text>
                        <Text style={{
                          color: form.subscriptionPlan === plan.id ? theme.accent : theme.textSecondary,
                          fontFamily: 'Poppins-Medium',
                          fontSize: 12,
                          marginTop: 4,
                        }}>
                          {plan.price}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View>
                  <Text style={{
                    color: theme.textPrimary,
                    fontSize: 16,
                    fontFamily: 'Poppins-Medium',
                    marginBottom: 8,
                  }}>
                    Advertisement Image *
                  </Text>
                  <TouchableOpacity onPress={openImagePicker}>
                    {form.image ? (
                      <Image
                        source={{ uri: form.image.uri }}
                        style={{
                          width: '100%',
                          height: 200,
                          borderRadius: 12,
                        }}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={{
                        width: '100%',
                        height: 200,
                        borderRadius: 12,
                        borderWidth: 2,
                        borderStyle: 'dashed',
                        borderColor: theme.border,
                        backgroundColor: theme.surface,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}>
                        <Image
                          source={icons.upload}
                          resizeMode="contain"
                          style={{ width: 48, height: 48, tintColor: theme.accent }}
                        />
                        <Text style={{
                          color: theme.textSecondary,
                          marginTop: 8,
                          fontFamily: 'Poppins-Medium',
                        }}>
                          Tap to select image
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>

                <CustomButton
                  title={loading ? "Creating..." : "Create Advertisement"}
                  handlePress={handleCreate}
                  containerStyles="mt-4"
                  isLoading={loading}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Edit Modal */}
      <Modal
        visible={showEditModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowEditModal(false);
          setEditingAd(null);
        }}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.8)',
          justifyContent: 'flex-end',
        }}>
          <View style={{
            backgroundColor: theme.surface,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: 20,
            maxHeight: '90%',
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{
                color: theme.textPrimary,
                fontSize: 20,
                fontFamily: 'Poppins-SemiBold',
              }}>
                Edit Advertisement
              </Text>
              <TouchableOpacity onPress={() => {
                setShowEditModal(false);
                setEditingAd(null);
              }}>
                <Text style={{ color: theme.textSecondary, fontSize: 24 }}>×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ gap: 16 }}>
                <FormField
                  title="Title *"
                  value={form.title}
                  placeholder="Enter advertisement title"
                  handleChangeText={(e) => setForm({ ...form, title: e })}
                />

                <FormField
                  title="Description"
                  value={form.description}
                  placeholder="Enter advertisement description"
                  handleChangeText={(e) => setForm({ ...form, description: e })}
                  multiline
                  numberOfLines={3}
                />

                <FormField
                  title="Link URL"
                  value={form.linkUrl}
                  placeholder="https://example.com"
                  handleChangeText={(e) => setForm({ ...form, linkUrl: e })}
                />

                <View>
                  <Text style={{
                    color: theme.textPrimary,
                    fontSize: 16,
                    fontFamily: 'Poppins-Medium',
                    marginBottom: 8,
                  }}>
                    Subscription Plan *
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {SUBSCRIPTION_PLANS.map((plan) => (
                      <TouchableOpacity
                        key={plan.id}
                        onPress={() => setForm({ ...form, subscriptionPlan: plan.id })}
                        style={{
                          flex: 1,
                          padding: 12,
                          borderRadius: 12,
                          borderWidth: 2,
                          borderColor: form.subscriptionPlan === plan.id ? theme.accent : theme.border,
                          backgroundColor: form.subscriptionPlan === plan.id ? theme.accentSoft : 'transparent',
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{
                          color: form.subscriptionPlan === plan.id ? theme.accent : theme.textPrimary,
                          fontFamily: 'Poppins-SemiBold',
                          fontSize: 14,
                        }}>
                          {plan.name}
                        </Text>
                        <Text style={{
                          color: form.subscriptionPlan === plan.id ? theme.accent : theme.textSecondary,
                          fontFamily: 'Poppins-Medium',
                          fontSize: 12,
                          marginTop: 4,
                        }}>
                          {plan.price}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View>
                  <Text style={{
                    color: theme.textPrimary,
                    fontSize: 16,
                    fontFamily: 'Poppins-Medium',
                    marginBottom: 8,
                  }}>
                    Advertisement Image {form.image ? '(New)' : '(Current)'}
                  </Text>
                  <TouchableOpacity onPress={openImagePicker}>
                    {form.image ? (
                      <Image
                        source={{ uri: form.image.uri }}
                        style={{
                          width: '100%',
                          height: 200,
                          borderRadius: 12,
                        }}
                        resizeMode="cover"
                      />
                    ) : editingAd?.image ? (
                      <Image
                        source={{ uri: editingAd.image }}
                        style={{
                          width: '100%',
                          height: 200,
                          borderRadius: 12,
                        }}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={{
                        width: '100%',
                        height: 200,
                        borderRadius: 12,
                        borderWidth: 2,
                        borderStyle: 'dashed',
                        borderColor: theme.border,
                        backgroundColor: theme.surface,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}>
                        <Image
                          source={icons.upload}
                          resizeMode="contain"
                          style={{ width: 48, height: 48, tintColor: theme.accent }}
                        />
                        <Text style={{
                          color: theme.textSecondary,
                          marginTop: 8,
                          fontFamily: 'Poppins-Medium',
                        }}>
                          Tap to change image
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>

                <CustomButton
                  title={loading ? "Updating..." : "Update Advertisement"}
                  handlePress={handleUpdate}
                  containerStyles="mt-4"
                  isLoading={loading}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default Advertisements;

