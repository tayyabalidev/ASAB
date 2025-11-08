import { useState } from "react";
import { router } from "expo-router";
import { ResizeMode, Video } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  Alert,
  Image,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from "react-i18next";

import { icons } from "../../constants";
import { createVideoPost } from "../../lib/appwrite";
import { CustomButton, FormField } from "../../components";
import { useGlobalContext } from "../../context/GlobalProvider";

const Create = () => {
  const { user, isRTL } = useGlobalContext();
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    video: null,
    thumbnail: null,
    prompt: "",
  });

  const openPicker = async (selectType) => {
    try {
      // Request permissions
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('alerts.permissionRequiredTitle'), t('alerts.permissionRequiredMessage'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: selectType === "image" 
          ? ImagePicker.MediaTypeOptions.Images 
          : ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: true,
        quality: 0.7,
        aspect: [16, 9],
        videoMaxDuration: 60, // Limit to 60 seconds
        exif: false, // Don't include EXIF data
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedAsset = result.assets[0];
        let fileName = selectedAsset.fileName || selectedAsset.name || selectedAsset.uri.split('/').pop() || `file_${Date.now()}`;
        
        // Ensure proper file extension for Appwrite compatibility
        if (selectType === "video") {
          // Force .mp4 extension for videos to ensure Appwrite compatibility
          const baseName = fileName.split('.')[0];
          fileName = `${baseName}.mp4`;
        } else if (selectType === "image") {
          // Force .jpg extension for images
          const baseName = fileName.split('.')[0];
          fileName = `${baseName}.jpg`;
        }
        
        const fileType = selectedAsset.type === 'image' ? 'image/jpeg' : selectedAsset.type === 'video' ? 'video/mp4' : selectedAsset.type;
        const fileSize = selectedAsset.fileSize || selectedAsset.size;
        const file = {
          uri: selectedAsset.uri,
          name: fileName,
          type: fileType,
          mimeType: fileType, // Add mimeType for iOS compatibility
          size: fileSize,
        };
        if (selectType === "image") {
          setForm({
            ...form,
            thumbnail: file,
          });
        }

        if (selectType === "video") {
          setForm({
            ...form,
            video: file,
          });
        }
      }
    } catch (error) {
      Alert.alert(t("common.error"), t("alerts.mediaSelectError"));
    }
  };

  const submit = async () => {
    
    
    if (!form.prompt || form.prompt.trim() === "") {
      return Alert.alert(t("common.error"), t("alerts.promptRequired"));
    }
    
    if (!form.title || form.title.trim() === "") {
      return Alert.alert(t("common.error"), t("alerts.titleRequired"));
    }
    
    // Removed thumbnail validation since we're hiding it
    // if (!form.thumbnail) {
    //   return Alert.alert("Error", "Please select a thumbnail image");
    // }
    
    if (!form.video) {
      return Alert.alert(t("common.error"), t("alerts.videoRequired"));
    }

    if (!user || !user.$id) {
      return Alert.alert(t("common.error"), t("alerts.loginToUpload"));
    }

    setUploading(true);
    try {
      
      
      await createVideoPost({
        ...form,
        userId: user.$id,
      });

      Alert.alert(t("common.success"), t("alerts.uploadSuccess"));
      router.push("/home");
    } catch (error) {
      
      Alert.alert(t("common.error"), error.message || t("alerts.uploadFailed"));
    } finally {
      setForm({
        title: "",
        video: null,
        thumbnail: null,
        prompt: "",
      });

      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={{ backgroundColor: '#032727', flex: 1 }}>
      <LinearGradient
        colors={['#032727', '#000']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ flex: 1 }}
      >
        <ScrollView className="px-4 my-6">
        <Text
          className="text-2xl text-white font-psemibold"
          style={{ textAlign: isRTL ? 'right' : 'left' }}
        >
          {t("create.screenTitle")}
        </Text>

        <FormField
          title={t("create.videoTitleLabel")}
          value={form.title}
          placeholder={t("create.videoTitlePlaceholder")}
          handleChangeText={(e) => setForm({ ...form, title: e })}
          otherStyles="mt-10"
        />

        <View className="mt-7 space-y-2">
          <Text
            className="text-base text-gray-100 font-pmedium"
            style={{ textAlign: isRTL ? 'right' : 'left' }}
          >
            {t("create.uploadVideoLabel")}
          </Text>

          <TouchableOpacity onPress={() => openPicker("video")}>
            {form.video ? (
              <Video
                source={{ uri: form.video.uri }}
                className="w-full h-64 rounded-2xl"
                useNativeControls
                resizeMode={ResizeMode.COVER}
                isLooping
              />
            ) : (
              <View className="w-full h-40 px-4 bg-black-100 rounded-2xl border border-black-200 flex justify-center items-center">
                <View className="w-14 h-14 border border-dashed border-secondary-100 flex justify-center items-center">
                  <Image
                    source={icons.upload}
                    resizeMode="contain"
                    alt="upload"
                    className="w-1/2 h-1/2"
                  />
                </View>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Thumbnail section hidden for now */}
        {/* <View className="mt-7 space-y-2">
          <Text className="text-base text-gray-100 font-pmedium">
            Thumbnail Image
          </Text>

          <TouchableOpacity onPress={() => openPicker("image")}>
            {form.thumbnail ? (
              <Image
                source={{ uri: form.thumbnail.uri }}
                resizeMode="cover"
                className="w-full h-64 rounded-2xl"
              />
            ) : (
              <View className="w-full h-16 px-4 bg-black-100 rounded-2xl border-2 border-black-200 flex justify-center items-center flex-row space-x-2">
                <Image
                  source={icons.upload}
                  resizeMode="contain"
                  alt="upload"
                  className="w-5 h-5"
                />
                <Text className="text-sm text-gray-100 font-pmedium">
                  Choose a file
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View> */}

        <FormField
          title={t("create.aiPromptLabel")}
          value={form.prompt}
          placeholder={t("create.aiPromptPlaceholder")}
          handleChangeText={(e) => setForm({ ...form, prompt: e })}
          otherStyles="mt-7"
        />

        <CustomButton
          title={t("create.submitButton")}
          handlePress={submit}
          containerStyles="mt-7"
          isLoading={uploading}
        />
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
};

export default Create;
