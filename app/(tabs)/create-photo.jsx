import { useState, useMemo, useCallback } from "react";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  Alert,
  Image,
  ImageBackground,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from "react-i18next";

import { icons, images } from "../../constants";
import { createPhotoPost } from "../../lib/appwrite";
import { CustomButton, FormField } from "../../components";
import { useGlobalContext } from "../../context/GlobalProvider";

const FILTERS = [
  { id: 'none', name: 'Original' },
  { id: 'vintage', name: 'Vintage' },
  { id: 'blackwhite', name: 'B&W' },
  { id: 'sepia', name: 'Sepia' },
  { id: 'cool', name: 'Cool' },
  { id: 'warm', name: 'Warm' },
  { id: 'contrast', name: 'Contrast' },
  { id: 'bright', name: 'Bright' },
];

const CreatePhoto = () => {
  const { user, isRTL, theme, isDarkMode } = useGlobalContext();
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [originalImage, setOriginalImage] = useState(null);
  const [editedImage, setEditedImage] = useState(null);
  const [edits, setEdits] = useState({});
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const form = useState({
    title: "",
    photo: null,
    caption: "",
    filter: "none",
  })[0];
  const setForm = useState({
    title: "",
    photo: null,
    caption: "",
    filter: "none",
  })[1];

  // Adjustments state
  const [adjustments, setAdjustments] = useState({
    brightness: 0,
    contrast: 1,
    saturation: 1,
    hue: 0,
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

  const openPicker = async () => {
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
        exif: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedAsset = result.assets[0];
        const fileName = selectedAsset.fileName || selectedAsset.name || selectedAsset.uri.split('/').pop() || `photo_${Date.now()}.jpg`;
        const baseName = fileName.split('.')[0];
        const file = {
          uri: selectedAsset.uri,
          name: `${baseName}.jpg`,
          type: 'image/jpeg',
          mimeType: 'image/jpeg',
          size: selectedAsset.fileSize || selectedAsset.size,
        };

        setOriginalImage(file);
        setEditedImage(file);
        setForm({ ...form, photo: file });
        setEditing(true);
      }
    } catch (error) {
      Alert.alert(t("common.error"), t("alerts.mediaSelectError"));
    }
  };

  const applyFilter = async (filterId) => {
    if (!originalImage) return;

    try {
      let actions = [];
      let newEdits = { ...edits, filter: filterId };

      switch (filterId) {
        case 'vintage':
          actions.push({ brightness: 0.1 }, { contrast: 0.9 }, { saturation: 0.8 });
          break;
        case 'blackwhite':
          actions.push({ saturation: 0 });
          break;
        case 'sepia':
          actions.push({ saturate: 1.2, brightness: 0.1 });
          break;
        case 'cool':
          actions.push({ hue: 0.3 }, { saturation: 0.9 });
          break;
        case 'warm':
          actions.push({ hue: -0.3 }, { saturation: 1.1 });
          break;
        case 'contrast':
          actions.push({ contrast: 1.3 });
          break;
        case 'bright':
          actions.push({ brightness: 0.2 }, { contrast: 1.1 });
          break;
        default:
          actions = [];
      }

      if (actions.length > 0) {
        const manipResult = await ImageManipulator.manipulateAsync(
          originalImage.uri,
          actions,
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
        );

        const editedFile = {
          ...originalImage,
          uri: manipResult.uri,
        };

        setEditedImage(editedFile);
        setForm({ ...form, photo: editedFile, filter: filterId });
        setEdits(newEdits);
      } else {
        setEditedImage(originalImage);
        setForm({ ...form, photo: originalImage, filter: filterId });
        setEdits(newEdits);
      }
    } catch (error) {
      Alert.alert(t("common.error"), "Failed to apply filter");
    }
  };

  const applyAdjustments = async () => {
    if (!originalImage) return;

    try {
      const actions = [];
      
      if (adjustments.brightness !== 0) {
        actions.push({ brightness: adjustments.brightness / 100 });
      }
      if (adjustments.contrast !== 1) {
        actions.push({ contrast: adjustments.contrast });
      }
      if (adjustments.saturation !== 1) {
        actions.push({ saturation: adjustments.saturation });
      }
      if (adjustments.hue !== 0) {
        actions.push({ hue: adjustments.hue / 360 });
      }

      if (actions.length > 0) {
        const manipResult = await ImageManipulator.manipulateAsync(
          originalImage.uri,
          actions,
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
        );

        const editedFile = {
          ...originalImage,
          uri: manipResult.uri,
        };

        setEditedImage(editedFile);
        setForm({ ...form, photo: editedFile });
        setEdits({ ...edits, adjustments });
      } else {
        // If no adjustments, keep original
        setEditedImage(originalImage);
        setForm({ ...form, photo: originalImage });
      }
      setShowAdjustModal(false);
    } catch (error) {
      Alert.alert(t("common.error"), "Failed to apply adjustments");
    }
  };

  const cropImage = async () => {
    if (!originalImage) return;

    try {
      const manipResult = await ImageManipulator.manipulateAsync(
        originalImage.uri,
        [{ resize: { width: 1080 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );

      const editedFile = {
        ...originalImage,
        uri: manipResult.uri,
      };

      setEditedImage(editedFile);
      setForm({ ...form, photo: editedFile });
      Alert.alert(t("common.success"), "Image cropped");
    } catch (error) {
      Alert.alert(t("common.error"), "Failed to crop image");
    }
  };

  const resetEdits = () => {
    setEditedImage(originalImage);
    setForm({ ...form, photo: originalImage, filter: "none" });
    setEdits({});
    setAdjustments({ brightness: 0, contrast: 1, saturation: 1, hue: 0 });
  };

  const submit = async () => {
    if (!form.title || form.title.trim() === "") {
      return Alert.alert(t("common.error"), "Title is required");
    }

    if (!form.photo) {
      return Alert.alert(t("common.error"), "Please select a photo");
    }

    if (!user || !user.$id) {
      return Alert.alert(t("common.error"), t("alerts.loginToUpload"));
    }

    setUploading(true);
    try {
      await createPhotoPost({
        ...form,
        userId: user.$id,
        edits: edits,
      });

      Alert.alert(t("common.success"), "Photo uploaded successfully!");
      router.push("/profile");
    } catch (error) {
      Alert.alert(t("common.error"), error.message || "Failed to upload photo");
    } finally {
      setForm({
        title: "",
        photo: null,
        caption: "",
        filter: "none",
      });
      setOriginalImage(null);
      setEditedImage(null);
      setEditing(false);
      setEdits({});
      setUploading(false);
    }
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
            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 24, gap: 24 }}
            >
              <Text
                style={{
                  color: theme.textPrimary,
                  fontSize: 24,
                  fontFamily: "Poppins-SemiBold",
                  textAlign: isRTL ? "right" : "left",
                }}
              >
                Create Photo Post
              </Text>

              <FormField
                title="Title"
                value={form.title}
                placeholder="Enter photo title"
                handleChangeText={(e) => setForm({ ...form, title: e })}
                otherStyles="mt-4"
              />

              <View style={{ gap: 12 }}>
                <Text
                  style={{
                    color: theme.textPrimary,
                    fontSize: 16,
                    fontFamily: "Poppins-Medium",
                    textAlign: isRTL ? "right" : "left",
                  }}
                >
                  Select Photo
                </Text>

                <TouchableOpacity onPress={openPicker}>
                  {editedImage ? (
                    <View style={{ position: 'relative' }}>
                      <Image
                        source={{ uri: editedImage.uri }}
                        style={{ width: "100%", height: 400, borderRadius: 16, overflow: "hidden" }}
                        resizeMode="cover"
                      />
                      {editing && (
                        <View style={{
                          position: 'absolute',
                          bottom: 10,
                          right: 10,
                          flexDirection: 'row',
                          gap: 8,
                        }}>
                          <TouchableOpacity
                            onPress={() => setShowFilterModal(true)}
                            style={{
                              backgroundColor: 'rgba(0,0,0,0.7)',
                              padding: 12,
                              borderRadius: 8,
                            }}
                          >
                            <Text style={{ color: '#fff', fontSize: 12 }}>Filters</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => setShowAdjustModal(true)}
                            style={{
                              backgroundColor: 'rgba(0,0,0,0.7)',
                              padding: 12,
                              borderRadius: 8,
                            }}
                          >
                            <Text style={{ color: '#fff', fontSize: 12 }}>Adjust</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={resetEdits}
                            style={{
                              backgroundColor: 'rgba(0,0,0,0.7)',
                              padding: 12,
                              borderRadius: 8,
                            }}
                          >
                            <Text style={{ color: '#fff', fontSize: 12 }}>Reset</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  ) : (
                    <View
                      style={{
                        width: "100%",
                        height: 300,
                        paddingHorizontal: 16,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: theme.border,
                        backgroundColor: themedColor("rgba(15,23,42,0.6)", theme.surface),
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <View
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderStyle: "dashed",
                          borderColor: theme.accent,
                          justifyContent: "center",
                          alignItems: "center",
                        }}
                      >
                        <Image
                          source={icons.upload}
                          resizeMode="contain"
                          style={{ width: 28, height: 28, tintColor: theme.accent }}
                        />
                      </View>
                      <Text style={{ color: theme.textSecondary, marginTop: 12 }}>
                        Tap to select photo
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              <FormField
                title="Caption (Optional)"
                value={form.caption}
                placeholder="Add a caption..."
                handleChangeText={(e) => setForm({ ...form, caption: e })}
                multiline
                numberOfLines={3}
              />

              <CustomButton
                title={uploading ? "Uploading..." : "Post Photo"}
                handlePress={submit}
                containerStyles="mt-6"
                isLoading={uploading}
              />
            </ScrollView>

            {/* Filter Modal */}
            <Modal
              visible={showFilterModal}
              transparent={true}
              animationType="slide"
              onRequestClose={() => setShowFilterModal(false)}
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
                  maxHeight: '60%',
                }}>
                  <Text style={{
                    color: theme.textPrimary,
                    fontSize: 20,
                    fontWeight: 'bold',
                    marginBottom: 20,
                  }}>
                    Filters
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      {FILTERS.map((filter) => (
                        <TouchableOpacity
                          key={filter.id}
                          onPress={() => {
                            applyFilter(filter.id);
                            setShowFilterModal(false);
                          }}
                          style={{
                            alignItems: 'center',
                            padding: 10,
                            backgroundColor: form.filter === filter.id ? theme.accentSoft : theme.cardSoft,
                            borderRadius: 10,
                            minWidth: 80,
                          }}
                        >
                          <Text style={{
                            color: theme.textPrimary,
                            fontSize: 14,
                            fontWeight: form.filter === filter.id ? 'bold' : 'normal',
                          }}>
                            {filter.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                  <TouchableOpacity
                    onPress={() => setShowFilterModal(false)}
                    style={{
                      marginTop: 20,
                      backgroundColor: theme.accent,
                      padding: 15,
                      borderRadius: 10,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>

            {/* Adjustments Modal */}
            <Modal
              visible={showAdjustModal}
              transparent={true}
              animationType="slide"
              onRequestClose={() => setShowAdjustModal(false)}
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
                  maxHeight: '70%',
                }}>
                  <Text style={{
                    color: theme.textPrimary,
                    fontSize: 20,
                    fontWeight: 'bold',
                    marginBottom: 20,
                  }}>
                    Adjustments
                  </Text>
                  
                  <View style={{ gap: 20 }}>
                    <View>
                      <Text style={{ color: theme.textPrimary, marginBottom: 8 }}>
                        Brightness: {adjustments.brightness}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <Text style={{ color: theme.textSecondary, width: 50 }}>-100</Text>
                        <View style={{ flex: 1 }}>
                          <View style={{
                            height: 6,
                            backgroundColor: theme.border,
                            borderRadius: 3,
                            position: 'relative',
                          }}>
                            <View style={{
                              position: 'absolute',
                              left: `${((adjustments.brightness + 100) / 200) * 100}%`,
                              top: -3,
                              width: 12,
                              height: 12,
                              borderRadius: 6,
                              backgroundColor: theme.accent,
                              borderWidth: 2,
                              borderColor: '#fff',
                            }} />
                          </View>
                        </View>
                        <Text style={{ color: theme.textSecondary, width: 50, textAlign: 'right' }}>100</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => setAdjustments({ ...adjustments, brightness: Math.max(-100, adjustments.brightness - 10) })}
                        style={{ position: 'absolute', left: 50 }}
                      >
                        <Text>-</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setAdjustments({ ...adjustments, brightness: Math.min(100, adjustments.brightness + 10) })}
                        style={{ position: 'absolute', right: 50 }}
                      >
                        <Text>+</Text>
                      </TouchableOpacity>
                    </View>

                    <View>
                      <Text style={{ color: theme.textPrimary, marginBottom: 8 }}>
                        Contrast: {adjustments.contrast.toFixed(1)}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <Text style={{ color: theme.textSecondary, width: 50 }}>0</Text>
                        <View style={{ flex: 1 }}>
                          <View style={{
                            height: 6,
                            backgroundColor: theme.border,
                            borderRadius: 3,
                          }} />
                        </View>
                        <Text style={{ color: theme.textSecondary, width: 50, textAlign: 'right' }}>2</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                        <TouchableOpacity
                          onPress={() => setAdjustments({ ...adjustments, contrast: Math.max(0, adjustments.contrast - 0.1) })}
                          style={{ padding: 8, backgroundColor: theme.cardSoft, borderRadius: 8 }}
                        >
                          <Text style={{ color: theme.textPrimary }}>-</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setAdjustments({ ...adjustments, contrast: Math.min(2, adjustments.contrast + 0.1) })}
                          style={{ padding: 8, backgroundColor: theme.cardSoft, borderRadius: 8 }}
                        >
                          <Text style={{ color: theme.textPrimary }}>+</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View>
                      <Text style={{ color: theme.textPrimary, marginBottom: 8 }}>
                        Saturation: {adjustments.saturation.toFixed(1)}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <Text style={{ color: theme.textSecondary, width: 50 }}>0</Text>
                        <View style={{ flex: 1 }}>
                          <View style={{
                            height: 6,
                            backgroundColor: theme.border,
                            borderRadius: 3,
                          }} />
                        </View>
                        <Text style={{ color: theme.textSecondary, width: 50, textAlign: 'right' }}>2</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                        <TouchableOpacity
                          onPress={() => setAdjustments({ ...adjustments, saturation: Math.max(0, adjustments.saturation - 0.1) })}
                          style={{ padding: 8, backgroundColor: theme.cardSoft, borderRadius: 8 }}
                        >
                          <Text style={{ color: theme.textPrimary }}>-</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setAdjustments({ ...adjustments, saturation: Math.min(2, adjustments.saturation + 0.1) })}
                          style={{ padding: 8, backgroundColor: theme.cardSoft, borderRadius: 8 }}
                        >
                          <Text style={{ color: theme.textPrimary }}>+</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
                    <TouchableOpacity
                      onPress={applyAdjustments}
                      style={{
                        flex: 1,
                        backgroundColor: theme.accent,
                        padding: 15,
                        borderRadius: 10,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: 'bold' }}>Apply</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setAdjustments({ brightness: 0, contrast: 1, saturation: 1, hue: 0 });
                        setShowAdjustModal(false);
                      }}
                      style={{
                        flex: 1,
                        backgroundColor: theme.cardSoft,
                        padding: 15,
                        borderRadius: 10,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: theme.textPrimary, fontWeight: 'bold' }}>Reset</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setShowAdjustModal(false)}
                      style={{
                        flex: 1,
                        backgroundColor: theme.cardSoft,
                        padding: 15,
                        borderRadius: 10,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: theme.textPrimary, fontWeight: 'bold' }}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>
          </ImageBackground>
        </LinearGradient>
      </View>
    </SafeAreaView>
  );
};

export default CreatePhoto;

