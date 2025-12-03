import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { router } from "expo-router";
import { ResizeMode, Video, Audio } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as DocumentPicker from "expo-document-picker";
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
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from "react-i18next";
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';

import { icons, images } from "../../constants";
import { createVideoPost, createPhotoPost } from "../../lib/appwrite";
import { processVideo, processPhoto, checkProcessingServer } from "../../lib/videoProcessor";
import { exportEditedMedia } from "../../lib/mediaExporter";
import { CustomButton, FormField, MediaEditor } from "../../components";
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

const Create = () => {
  const { user, isRTL, theme, isDarkMode } = useGlobalContext();
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [postType, setPostType] = useState('video'); // 'video' or 'photo'
  const [form, setForm] = useState({
    title: "",
    video: null,
    thumbnail: null,
    prompt: "",
    music: null,
    filter: "none",
    link: "",
  });
  const [photoForm, setPhotoForm] = useState({
    title: "",
    photo: null,
    caption: "",
    filter: "none",
    link: "",
  });
  const [originalImage, setOriginalImage] = useState(null);
  const [editedImage, setEditedImage] = useState(null);
  const [edits, setEdits] = useState({});
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustments, setAdjustments] = useState({
    brightness: 0,
    contrast: 1,
    saturation: 1,
    hue: 0,
  });
  const [processingImage, setProcessingImage] = useState(false);
  const [showVideoFilterModal, setShowVideoFilterModal] = useState(false);
  const [showMusicModal, setShowMusicModal] = useState(false);
  const [videoFilterCSS, setVideoFilterCSS] = useState('none');
  const scrollViewRef = useRef(null);
  const linkInputRef = useRef(null);
  const [processingMedia, setProcessingMedia] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [useProcessing, setUseProcessing] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editingMedia, setEditingMedia] = useState(null);
  const [isMediaEdited, setIsMediaEdited] = useState(false); // Track if media was edited via MediaEditor

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

  // Check if processing server is available on mount
  useEffect(() => {
    const checkServer = async () => {
      try {
        const isAvailable = await checkProcessingServer();
        setUseProcessing(isAvailable);
        if (isAvailable) {
          console.log('✅ Processing server is available');
        } else {
          console.log('ℹ️ Processing server not available - using metadata only');
        }
      } catch (error) {
        console.log('Processing server check failed');
        setUseProcessing(false);
      }
    };
    checkServer();
  }, []);

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
        
        // For videos, copy the trimmed video to a permanent location
        // This ensures the trimmed video persists and is used when posting
        // The trimmed video from ImagePicker might be in a temporary location
        // that gets deleted, so we copy it to a permanent location
        let finalUri = selectedAsset.uri;
        if (selectType === "video") {
          try {
            // Create a permanent file path for the trimmed video
            const permanentPath = `${FileSystem.documentDirectory}trimmed_video_${Date.now()}.mp4`;
            
            // Copy the trimmed video from temporary location to permanent location
            // This ensures the trimmed video is preserved and used when uploading
            await FileSystem.copyAsync({
              from: selectedAsset.uri,
              to: permanentPath,
            });
            
            // Verify the file was copied successfully
            const fileInfo = await FileSystem.getInfoAsync(permanentPath);
            if (fileInfo.exists) {
              // Use the permanent path - this is the trimmed video
              finalUri = permanentPath;
            } else {
              console.warn('Trimmed video copy verification failed, using original URI');
              finalUri = selectedAsset.uri;
            }
          } catch (copyError) {
            console.error('Error copying trimmed video:', copyError);
            // If copy fails, use original URI (might still work on some platforms)
            // but the trimmed video might not persist
            finalUri = selectedAsset.uri;
          }
        }
        
        const file = {
          uri: finalUri,
          name: fileName,
          type: fileType,
          mimeType: fileType, // Add mimeType for iOS compatibility
          size: fileSize,
        };
        
        if (postType === 'video') {
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
            setIsMediaEdited(false); // Reset edit flag when new video is selected
          }
        } else {
          // Photo mode
          setOriginalImage(file);
          setEditedImage(file);
          setPhotoForm({ ...photoForm, photo: file });
          setIsMediaEdited(false); // Reset edit flag when new photo is selected
        }
      }
    } catch (error) {
      Alert.alert(t("common.error"), t("alerts.mediaSelectError"));
    }
  };

  const applyFilter = async (filterId) => {
    if (!originalImage || !originalImage.uri) {
      Alert.alert(t("common.error"), "No image selected");
      return;
    }

    setProcessingImage(true);
    try {
      let newEdits = { ...edits, filter: filterId };

      // expo-image-manipulator doesn't support color adjustments
      // So we'll store the filter info and apply it visually
      // The actual filter will be applied on the server or during display
      
      if (filterId === 'none') {
        // Reset to original
        setEditedImage(originalImage);
        setPhotoForm({ ...photoForm, photo: originalImage, filter: filterId });
        setEdits(newEdits);
      } else {
        // Store filter info with adjustments if any
        const editedFile = {
          ...originalImage,
          filter: filterId, // Store filter type
          adjustments: editedImage?.adjustments || adjustments, // Keep existing adjustments
        };

        setEditedImage(editedFile);
        setPhotoForm({ ...photoForm, photo: editedFile, filter: filterId });
        setEdits(newEdits);
      }
      setShowFilterModal(false);
    } catch (error) {
      console.error("Filter application error:", error);
      Alert.alert(
        t("common.error") || "Error", 
        error.message || "Failed to apply filter. Please try again."
      );
    } finally {
      setProcessingImage(false);
    }
  };

  const applyAdjustments = async () => {
    if (!originalImage || !originalImage.uri) {
      Alert.alert(t("common.error"), "No image selected");
      return;
    }

    setProcessingImage(true);
    try {
      // expo-image-manipulator doesn't support color adjustments
      // Store adjustment values - they'll be applied on server or during display
      const hasAdjustments = adjustments.brightness !== 0 || 
                            adjustments.contrast !== 1 || 
                            adjustments.saturation !== 1 || 
                            adjustments.hue !== 0;

      if (hasAdjustments) {
        // Store adjustments in the image object, keeping the filter if any
        const editedFile = {
          ...originalImage,
          filter: photoForm.filter || 'none', // Keep existing filter
          adjustments: { ...adjustments }, // Store adjustment values
        };

        setEditedImage(editedFile);
        setPhotoForm({ ...photoForm, photo: editedFile });
        setEdits({ ...edits, adjustments });
      } else {
        // If no adjustments, revert to filter state or original
        if (photoForm.filter && photoForm.filter !== 'none' && editedImage) {
          // Keep the filter applied
          setEditedImage(editedImage);
          setPhotoForm({ ...photoForm, photo: editedImage });
      } else {
        setEditedImage(originalImage);
        setPhotoForm({ ...photoForm, photo: originalImage });
        }
      }
      setShowAdjustModal(false);
    } catch (error) {
      console.error("Adjustments application error:", error);
      Alert.alert(
        t("common.error") || "Error", 
        error.message || "Failed to apply adjustments. Please try again."
      );
    } finally {
      setProcessingImage(false);
    }
  };

  const resetEdits = () => {
    if (!originalImage) return;
    setEditedImage(originalImage);
    setPhotoForm({ ...photoForm, photo: originalImage, filter: "none" });
    setEdits({});
    setAdjustments({ brightness: 0, contrast: 1, saturation: 1, hue: 0 });
  };

  // Music selection for videos
  const selectMusic = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedAsset = result.assets[0];
        const file = {
          uri: selectedAsset.uri,
          name: selectedAsset.name || `music_${Date.now()}.mp3`,
          type: selectedAsset.mimeType || 'audio/mpeg',
          size: selectedAsset.size,
        };
        setForm({ ...form, music: file });
        setShowMusicModal(false);
      }
    } catch (error) {
      console.error("Music selection error:", error);
      Alert.alert(t("common.error"), "Failed to select music file");
    }
  };

  // Apply video filter
  const applyVideoFilter = (filterId) => {
    const filterCSS = getFilterCSS(filterId, null);
    setVideoFilterCSS(filterCSS);
    setForm({ ...form, filter: filterId });
    setShowVideoFilterModal(false);
  };

  // Get CSS filter string based on filter type and adjustments
  const getFilterCSS = useCallback((filterId, adjustmentsData) => {
    let filterCSS = '';
    
    // Apply filter effects
    switch (filterId) {
      case 'vintage':
        filterCSS += 'brightness(1.1) contrast(0.9) saturate(0.8) sepia(0.2)';
        break;
      case 'blackwhite':
        filterCSS += 'grayscale(100%)';
        break;
      case 'sepia':
        filterCSS += 'sepia(1) brightness(1.1) contrast(0.9)';
        break;
      case 'cool':
        filterCSS += 'hue-rotate(30deg) saturate(0.9)';
        break;
      case 'warm':
        filterCSS += 'hue-rotate(-30deg) saturate(1.1)';
        break;
      case 'contrast':
        filterCSS += 'contrast(1.3)';
        break;
      case 'bright':
        filterCSS += 'brightness(1.2) contrast(1.1)';
        break;
      default:
        break;
    }
    
    // Apply manual adjustments
    if (adjustmentsData) {
      const parts = [];
      if (adjustmentsData.brightness !== 0) {
        parts.push(`brightness(${1 + (adjustmentsData.brightness / 100)})`);
      }
      if (adjustmentsData.contrast !== 1) {
        parts.push(`contrast(${adjustmentsData.contrast})`);
      }
      if (adjustmentsData.saturation !== 1) {
        parts.push(`saturate(${adjustmentsData.saturation})`);
      }
      if (adjustmentsData.hue !== 0) {
        parts.push(`hue-rotate(${adjustmentsData.hue}deg)`);
      }
      if (parts.length > 0) {
        filterCSS = filterCSS ? `${filterCSS} ${parts.join(' ')}` : parts.join(' ');
      }
    }
    
    return filterCSS || 'none';
  }, []);

  // Convert image URI to base64 for WebView
  const [imageBase64, setImageBase64] = useState(null);
  const lastConvertedUri = useRef(null);
  const isConvertingRef = useRef(false);
  
  useEffect(() => {
    const convertToBase64 = async () => {
      const currentUri = originalImage?.uri;
      
      // Clear state if no image
      if (!currentUri) {
        if (imageBase64 !== null) {
          setImageBase64(null);
          lastConvertedUri.current = null;
        }
        return;
      }

      // Skip if we've already converted this URI or are currently converting
      // Also check if the URI hasn't actually changed
      if (lastConvertedUri.current === currentUri || isConvertingRef.current) {
        return;
      }
      
      // Additional guard: if we're already converting the same URI, skip
      if (isConvertingRef.current && lastConvertedUri.current === currentUri) {
        return;
      }

      isConvertingRef.current = true;
      try {
        // Check if it's already a base64 or http/https URL
        if (currentUri.startsWith('data:') || currentUri.startsWith('http://') || currentUri.startsWith('https://')) {
          setImageBase64(currentUri);
          lastConvertedUri.current = currentUri;
          return;
        }
        
        // Handle file:// URIs
        let fileUri = currentUri;
        if (currentUri.startsWith('file://')) {
          fileUri = currentUri;
        } else if (currentUri.startsWith('content://') || currentUri.startsWith('ph://')) {
          // For content:// or ph:// URIs, try to read directly
          fileUri = currentUri;
        }
        
        // Read file and convert to base64
        const base64 = await FileSystem.readAsStringAsync(fileUri, {
          encoding: 'base64',
        });
        const base64Data = `data:image/jpeg;base64,${base64}`;
        setImageBase64(base64Data);
        lastConvertedUri.current = currentUri;
      } catch (error) {
        console.error('Error converting image to base64:', error);
        // Fallback: try using the URI directly (WebView might handle it)
        setImageBase64(currentUri);
        lastConvertedUri.current = currentUri;
      } finally {
        isConvertingRef.current = false;
      }
    };
    
    convertToBase64();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalImage?.uri]);

  const submit = async () => {
    if (postType === 'video') {
      if (!form.prompt || form.prompt.trim() === "") {
        return Alert.alert(t("common.error"), t("alerts.promptRequired"));
      }
      
      if (!form.title || form.title.trim() === "") {
        return Alert.alert(t("common.error"), t("alerts.titleRequired"));
      }
      
      if (!form.video) {
        return Alert.alert(t("common.error"), t("alerts.videoRequired"));
      }

      if (!user || !user.$id) {
        return Alert.alert(t("common.error"), t("alerts.loginToUpload"));
      }

      setUploading(true);
      try {
        let finalVideo = form.video;
        
        // Skip processing if media was already edited via MediaEditor (it already has all edits applied)
        // Process video if filter/music is selected AND media wasn't already edited
        // Note: Filter will be stored in metadata and applied via CSS on display if server processing fails
        if (!isMediaEdited && (form.filter !== 'none' || form.music)) {
          // Try server processing if available
          if (useProcessing) {
            try {
              setProcessingMedia(true);
              setProcessingProgress(10);
              
              console.log('Processing video with filter:', form.filter);
              
              // Process video with filter and music
              const processedResult = await processVideo({
                video: form.video,
                music: form.music || null,
                filter: form.filter,
                musicVolume: 0.5
              });
              
              setProcessingProgress(50);
              
              // Save processed video to file system
              if (processedResult && processedResult.base64) {
                const processedUri = `${FileSystem.documentDirectory}processed_video_${Date.now()}.mp4`;
                
                await FileSystem.writeAsStringAsync(processedUri, processedResult.base64, {
                  encoding: FileSystem.EncodingType.Base64,
                });
                
                // Update to use processed video
                finalVideo = {
                  uri: processedUri,
                  name: 'processed_video.mp4',
                  type: 'video/mp4',
                  size: form.video.size
                };
                
                console.log('✅ Video processed successfully');
              }
              
              setProcessingProgress(100);
              setProcessingMedia(false);
            } catch (processError) {
              console.log('⚠️ Server processing failed, filter will be applied on display:', processError);
              setProcessingMedia(false);
              // Continue with original video - filter metadata will be stored and applied via CSS
            }
          } else {
            // Server not available - filter will be stored in metadata and applied via CSS on display
            console.log('ℹ️ Processing server not available, filter will be applied on display');
          }
        }

        setProcessingProgress(0);
        
        await createVideoPost({
          ...form,
          video: finalVideo,
          userId: user.$id,
        });

        Alert.alert(t("common.success"), t("alerts.uploadSuccess"));
        router.push("/home");
      } catch (error) {
        // Check for network-related errors and show user-friendly messages
        const errorMessage = error.message || error.toString();
        let userMessage = errorMessage;

        if (errorMessage.includes('Network') || 
            errorMessage.includes('network') || 
            errorMessage.includes('timeout') || 
            errorMessage.includes('Network request failed') ||
            errorMessage.includes('503') ||
            errorMessage.includes('client read error') ||
            errorMessage.includes('Service Unavailable')) {
          userMessage = "Network Error!\n\nPlease check your internet connection and try again.";
        } else if (errorMessage.includes('too large') || errorMessage.includes('File is too large')) {
          userMessage = "File Too Large!\n\nPlease select a smaller file or compress it.";
        } else if (errorMessage.includes('Server is temporarily unavailable')) {
          userMessage = "Server Busy!\n\nPlease wait a moment and try again.";
        }

        Alert.alert(t("common.error"), userMessage);
      } finally {
        setForm({
          title: "",
          video: null,
          thumbnail: null,
          prompt: "",
          music: null,
          filter: "none",
          link: "",
        });
        setVideoFilterCSS('none');
        setIsMediaEdited(false); // Reset edit flag
        setUploading(false);
      }
    } else {
      // Photo submission
      if (!photoForm.title || photoForm.title.trim() === "") {
        return Alert.alert(t("common.error"), "Title is required");
      }

      if (!photoForm.photo) {
        return Alert.alert(t("common.error"), "Please select a photo");
      }

      if (!user || !user.$id) {
        return Alert.alert(t("common.error"), t("alerts.loginToUpload"));
      }

      setUploading(true);
      try {
        let finalPhoto = photoForm.photo;
        
        // Skip processing if media was already edited via MediaEditor (it already has all edits applied)
        // Process photo if filter/adjustments are applied AND media wasn't already edited
        if (!isMediaEdited && (photoForm.filter !== 'none' || Object.keys(edits).length > 0 || 
            adjustments.brightness !== 0 || adjustments.contrast !== 1 || 
            adjustments.saturation !== 1 || adjustments.hue !== 0)) {
          try {
            setProcessingMedia(true);
            setProcessingProgress(10);
            
            console.log('Processing photo with filter:', photoForm.filter, 'adjustments:', adjustments);
            
            let processedPhoto = null;
            
            // Try server processing first if available
            if (useProcessing) {
              try {
                const processedResult = await processPhoto({
                  photo: photoForm.photo,
                  filter: photoForm.filter,
                  brightness: adjustments.brightness,
                  contrast: adjustments.contrast,
                  saturation: adjustments.saturation
                });
                
                if (processedResult && processedResult.base64) {
                  const processedUri = `${FileSystem.documentDirectory}processed_photo_${Date.now()}.jpg`;
                  await FileSystem.writeAsStringAsync(processedUri, processedResult.base64, {
                    encoding: FileSystem.EncodingType.Base64,
                  });
                  processedPhoto = {
                    uri: processedUri,
                    name: 'processed_photo.jpg',
                    type: 'image/jpeg',
                    size: photoForm.photo.size
                  };
                  console.log('✅ Photo processed via server');
                }
              } catch (serverError) {
                console.log('⚠️ Server processing failed, trying client-side:', serverError);
              }
            }
            
            // Fallback to client-side processing using ImageManipulator
            if (!processedPhoto && photoForm.photo?.uri) {
              setProcessingProgress(30);
              
              try {
                let manipActions = [];
                
                // Apply adjustments using ImageManipulator
                if (adjustments.brightness !== 0 || adjustments.contrast !== 1 || adjustments.saturation !== 1) {
                  // ImageManipulator doesn't directly support brightness/contrast/saturation
                  // But we can use it for basic operations and apply CSS filters on display
                  // For now, we'll process what we can and store adjustments for CSS application
                  manipActions.push({ resize: { width: 2000 } }); // Maintain quality
                }
                
                // Apply basic manipulations if any
                if (manipActions.length > 0) {
                  const result = await ImageManipulator.manipulateAsync(
                    photoForm.photo.uri,
                    manipActions,
                    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
                  );
                  
                  if (result && result.uri) {
                    processedPhoto = {
                      uri: result.uri,
                      name: 'processed_photo.jpg',
                      type: 'image/jpeg',
                      size: photoForm.photo.size
                    };
                    console.log('✅ Photo processed via client-side');
                  }
                }
              } catch (clientError) {
                console.log('⚠️ Client-side processing failed:', clientError);
              }
            }
            
            setProcessingProgress(80);
            
            // Use processed photo if available, otherwise use original (filters will be applied via CSS on display)
            if (processedPhoto) {
              finalPhoto = processedPhoto;
              console.log('✅ Photo processed successfully');
            } else {
              console.log('ℹ️ Using original photo, filters will be applied on display');
            }
            
            setProcessingProgress(100);
            setProcessingMedia(false);
          } catch (processError) {
            console.log('⚠️ Processing failed, using original photo:', processError);
            setProcessingMedia(false);
            // Continue with original photo if processing fails (filters will be applied via CSS)
          }
        }

        setProcessingProgress(0);
        
        await createPhotoPost({
          ...photoForm,
          photo: finalPhoto,
          userId: user.$id,
          edits: edits,
        });

        Alert.alert(t("common.success"), "Photo uploaded successfully!");
        router.push("/profile");
      } catch (error) {
        // Check for network-related errors and show user-friendly messages
        const errorMessage = error.message || error.toString();
        let userMessage = errorMessage;

        if (errorMessage.includes('Network') || 
            errorMessage.includes('network') || 
            errorMessage.includes('timeout') || 
            errorMessage.includes('Network request failed') ||
            errorMessage.includes('503') ||
            errorMessage.includes('client read error') ||
            errorMessage.includes('Service Unavailable')) {
          userMessage = "Network Error!\n\nPlease check your internet connection and try again.";
        } else if (errorMessage.includes('too large') || errorMessage.includes('File is too large')) {
          userMessage = "File Too Large!\n\nPlease select a smaller file or compress it.";
        } else if (errorMessage.includes('Server is temporarily unavailable')) {
          userMessage = "Server Busy!\n\nPlease wait a moment and try again.";
        } else if (!userMessage.includes('Network') && !userMessage.includes('too large')) {
          userMessage = errorMessage || "Failed to upload photo";
        }

        Alert.alert(t("common.error"), userMessage);
      } finally {
        setPhotoForm({
          title: "",
          photo: null,
          caption: "",
          filter: "none",
          link: "",
        });
        setOriginalImage(null);
        setEditedImage(null);
        setEdits({});
        setIsMediaEdited(false); // Reset edit flag
        setUploading(false);
      }
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
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={{ flex: 1 }}
              keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
          >
            <ScrollView
                ref={scrollViewRef}
                contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 24, gap: 24, paddingBottom: 100 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={true}
            >
          <Text
            style={{
              color: theme.textPrimary,
              fontSize: 24,
              fontFamily: "Poppins-SemiBold",
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {t("create.screenTitle")}
          </Text>

          {/* Post Type Selection */}
          <View
            style={{
              flexDirection: 'row',
              borderRadius: 14,
              padding: 4,
              backgroundColor: themedColor('rgba(15,23,42,0.6)', theme.surface),
              borderWidth: 1,
              borderColor: theme.border,
              marginBottom: 16,
            }}
          >
            <TouchableOpacity
              style={{
                flex: 1,
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: 10,
                backgroundColor: postType === 'video' ? theme.accentSoft : 'transparent',
              }}
              onPress={() => setPostType('video')}
            >
              <Text
                style={{
                  textAlign: 'center',
                  fontFamily: 'Poppins-Medium',
                  color: postType === 'video' ? theme.textPrimary : theme.textSecondary,
                }}
              >
                Video
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flex: 1,
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: 10,
                backgroundColor: postType === 'photo' ? theme.accentSoft : 'transparent',
              }}
              onPress={() => setPostType('photo')}
            >
              <Text
                style={{
                  textAlign: 'center',
                  fontFamily: 'Poppins-Medium',
                  color: postType === 'photo' ? theme.textPrimary : theme.textSecondary,
                }}
              >
                Photo
              </Text>
            </TouchableOpacity>
          </View>

          {postType === 'video' ? (
            <>
              <FormField
                title={t("create.videoTitleLabel")}
                value={form.title}
                placeholder={t("create.videoTitlePlaceholder")}
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
                  {t("create.uploadVideoLabel")}
                </Text>

                <View style={{ position: 'relative' }}>
                  <TouchableOpacity onPress={() => openPicker("video")}>
                    {form.video ? (
                      <View style={{ width: "100%", height: 256, borderRadius: 16, overflow: "hidden" }}>
                      <Video
                        source={{ uri: form.video.uri }}
                          style={{ width: "100%", height: "100%" }}
                        useNativeControls
                        resizeMode={ResizeMode.COVER}
                        isLooping
                      />
                        {form.filter !== 'none' && (
                          <View style={{
                            position: 'absolute',
                            top: 10,
                            left: 10,
                            backgroundColor: 'rgba(0,0,0,0.7)',
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 8,
                          }}>
                            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
                              Filter: {FILTERS.find(f => f.id === form.filter)?.name || form.filter}
                            </Text>
                          </View>
                        )}
                        {form.music && (
                          <View style={{
                            position: 'absolute',
                            top: 10,
                            right: 50,
                            backgroundColor: 'rgba(0,0,0,0.7)',
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 8,
                          }}>
                            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
                              🎵 Music
                            </Text>
                          </View>
                        )}
                        {/* Edit Button for Video */}
                        <TouchableOpacity
                          onPress={() => {
                            if (form.video) {
                              setEditingMedia({ ...form.video, mediaType: 'video' });
                              setShowEditor(true);
                            }
                          }}
                          style={{
                            position: 'absolute',
                            bottom: 10,
                            right: 10,
                            backgroundColor: 'rgba(0,0,0,0.7)',
                            padding: 12,
                            borderRadius: 8,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>
                            ✏️ Edit
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                    <View
                      style={{
                        width: "100%",
                        height: 180,
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
                    </View>
                  )}
                  </TouchableOpacity>
                  {form.video && (
                    <TouchableOpacity
                      onPress={() => setForm({ ...form, video: null })}
                      style={{
                        position: 'absolute',
                        top: 10,
                        right: 10,
                        backgroundColor: 'rgba(255, 59, 48, 0.9)',
                        borderRadius: 20,
                        width: 36,
                        height: 36,
                        justifyContent: 'center',
                        alignItems: 'center',
                        zIndex: 10,
                      }}
                    >
                      <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>×</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <FormField
                title={t("create.aiPromptLabel")}
                value={form.prompt}
                placeholder={t("create.aiPromptPlaceholder")}
                handleChangeText={(e) => setForm({ ...form, prompt: e })}
              />

              {/* Video Editing Options */}
              {form.video && (
                <View style={{ gap: 12 }}>
                  <Text
                    style={{
                      color: theme.textPrimary,
                      fontSize: 16,
                      fontFamily: "Poppins-Medium",
                      textAlign: isRTL ? "right" : "left",
                    }}
                  >
                    Video Editing Options
                  </Text>
                  
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <TouchableOpacity
                      onPress={() => setShowMusicModal(true)}
                      style={{
                        flex: 1,
                        padding: 12,
                        borderRadius: 12,
                        backgroundColor: themedColor("rgba(15,23,42,0.6)", theme.surface),
                        borderWidth: 1,
                        borderColor: theme.border,
                        alignItems: 'center',
                        flexDirection: 'row',
                        justifyContent: 'center',
                        gap: 8,
                      }}
                    >
                      <Text style={{ color: theme.textPrimary, fontSize: 14, fontFamily: 'Poppins-Medium' }}>
                        {form.music ? '✓ Music' : '🎵 Add Music'}
                      </Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      onPress={() => setShowVideoFilterModal(true)}
                      style={{
                        flex: 1,
                        padding: 12,
                        borderRadius: 12,
                        backgroundColor: themedColor("rgba(15,23,42,0.6)", theme.surface),
                        borderWidth: 1,
                        borderColor: theme.border,
                        alignItems: 'center',
                        flexDirection: 'row',
                        justifyContent: 'center',
                        gap: 8,
                      }}
                    >
                      <Text style={{ color: theme.textPrimary, fontSize: 14, fontFamily: 'Poppins-Medium' }}>
                        {form.filter !== 'none' ? `✓ ${FILTERS.find(f => f.id === form.filter)?.name}` : '🎨 Filters'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {form.music && (
                    <TouchableOpacity
                      onPress={() => setForm({ ...form, music: null })}
                      style={{
                        padding: 8,
                        borderRadius: 8,
                        backgroundColor: 'rgba(255, 59, 48, 0.1)',
                        borderWidth: 1,
                        borderColor: 'rgba(255, 59, 48, 0.3)',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Text style={{ color: theme.textPrimary, fontSize: 12, flex: 1 }}>
                        Music: {form.music.name}
                      </Text>
                      <Text style={{ color: '#ff3b30', fontSize: 16, marginLeft: 8 }}>×</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Link Field for Videos */}
              <View
                onLayout={(event) => {
                  linkInputRef.current = event.nativeEvent.layout;
                }}
              >
                <FormField
                  title="Link (Optional)"
                  value={form.link}
                  placeholder="Add a link to your video (e.g., https://example.com)"
                  handleChangeText={(e) => setForm({ ...form, link: e })}
                  onFocus={() => {
                    setTimeout(() => {
                      scrollViewRef.current?.scrollToEnd({ animated: true });
                    }, 100);
                  }}
                />
              </View>
            </>
          ) : (
            <>
              <FormField
                title="Title"
                value={photoForm.title}
                placeholder="Enter photo title"
                handleChangeText={(e) => setPhotoForm({ ...photoForm, title: e })}
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

                <TouchableOpacity onPress={() => openPicker("image")}>
                  {editedImage ? (
                    <View style={{ position: 'relative', width: "100%", height: 400, borderRadius: 16, overflow: "hidden" }}>
                      {imageBase64 ? (
                        <WebView
                          key={`${photoForm.filter}-${JSON.stringify(editedImage.adjustments || adjustments)}`}
                          source={{
                            html: `
                              <!DOCTYPE html>
                              <html>
                                <head>
                                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                  <style>
                                    * {
                                      margin: 0;
                                      padding: 0;
                                      box-sizing: border-box;
                                    }
                                    body {
                                      width: 100%;
                                      height: 100%;
                                      overflow: hidden;
                                    }
                                    img {
                                      width: 100%;
                                      height: 100%;
                                      object-fit: cover;
                                      filter: ${getFilterCSS(photoForm.filter, editedImage.adjustments || adjustments)};
                                    }
                                  </style>
                                </head>
                                <body>
                                  <img src="${imageBase64}" alt="Filtered Image" />
                                </body>
                              </html>
                            `
                          }}
                          style={{ 
                            width: "100%", 
                            height: 400, 
                            backgroundColor: 'transparent',
                          }}
                          scrollEnabled={false}
                          showsVerticalScrollIndicator={false}
                          showsHorizontalScrollIndicator={false}
                        />
                      ) : (
                        <View style={{ width: "100%", height: 400, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.surface }}>
                          <ActivityIndicator size="large" color={theme.accent} />
                        </View>
                      )}
                      {/* Filter Indicator */}
                      {photoForm.filter && photoForm.filter !== 'none' && (
                        <View style={{
                          position: 'absolute',
                          top: 10,
                          left: 10,
                          backgroundColor: 'rgba(0,0,0,0.7)',
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 8,
                        }}>
                          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
                            Filter: {FILTERS.find(f => f.id === photoForm.filter)?.name || photoForm.filter}
                          </Text>
                        </View>
                      )}
                      {/* Delete/Remove Button */}
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          setEditedImage(null);
                          setOriginalImage(null);
                          setPhotoForm({ ...photoForm, photo: null });
                          setEdits({});
                        }}
                        style={{
                          position: 'absolute',
                          top: 10,
                          right: 10,
                          backgroundColor: 'rgba(255, 59, 48, 0.9)',
                          borderRadius: 20,
                          width: 36,
                          height: 36,
                          justifyContent: 'center',
                          alignItems: 'center',
                          zIndex: 10,
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>×</Text>
                      </TouchableOpacity>
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
                        {/* Edit Button */}
                        <TouchableOpacity
                          onPress={() => {
                            setEditingMedia({ ...photoForm.photo, mediaType: 'photo' });
                            setShowEditor(true);
                          }}
                          style={{
                            backgroundColor: 'rgba(0,0,0,0.7)',
                            padding: 12,
                            borderRadius: 8,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <Text style={{ color: '#fff', fontSize: 12 }}>✏️ Edit</Text>
                        </TouchableOpacity>
                      </View>
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
                value={photoForm.caption}
                placeholder="Add a caption..."
                handleChangeText={(e) => setPhotoForm({ ...photoForm, caption: e })}
                multiline
                numberOfLines={3}
              />

              {/* Link Field for Photos */}
              <View
                onLayout={(event) => {
                  linkInputRef.current = event.nativeEvent.layout;
                }}
              >
                <FormField
                  title="Link (Optional)"
                  value={photoForm.link}
                  placeholder="Add a link to your photo (e.g., https://example.com)"
                  handleChangeText={(e) => setPhotoForm({ ...photoForm, link: e })}
                  onFocus={() => {
                    setTimeout(() => {
                      scrollViewRef.current?.scrollToEnd({ animated: true });
                    }, 100);
                  }}
                />
              </View>
            </>
          )}

          <CustomButton
            title={
              processingMedia 
                ? `Processing... ${processingProgress}%` 
                : uploading 
                  ? "Uploading..." 
                  : (postType === 'video' ? t("create.submitButton") : "Post Photo")
            }
            handlePress={submit}
            containerStyles="mt-6"
            isLoading={uploading || processingMedia}
            disabled={uploading || processingMedia}
          />
          
          {/* Processing Progress Indicator */}
          {processingMedia && (
            <View style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 8,
              backgroundColor: themedColor("rgba(15,23,42,0.6)", theme.surface),
              borderWidth: 1,
              borderColor: theme.border,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <ActivityIndicator size="small" color={theme.accent} />
                <Text style={{ color: theme.textPrimary, fontSize: 14, flex: 1 }}>
                  Processing {postType === 'video' ? 'video' : 'photo'} with filter and effects...
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                  {processingProgress}%
                </Text>
              </View>
              <View style={{
                marginTop: 8,
                height: 4,
                backgroundColor: theme.border,
                borderRadius: 2,
                overflow: 'hidden',
              }}>
                <View style={{
                  height: '100%',
                  width: `${processingProgress}%`,
                  backgroundColor: theme.accent,
                  borderRadius: 2,
                }} />
              </View>
            </View>
          )}
          
          {/* Processing Server Status Indicator */}
          {!useProcessing && (
            <View style={{
              marginTop: 12,
              padding: 8,
              borderRadius: 8,
              backgroundColor: themedColor("rgba(255,193,7,0.1)", "rgba(255,193,7,0.1)"),
              borderWidth: 1,
              borderColor: themedColor("rgba(255,193,7,0.3)", "rgba(255,193,7,0.3)"),
            }}>
              <Text style={{ color: theme.textSecondary, fontSize: 12, textAlign: 'center' }}>
                ℹ️ Processing server not available. Filters will be applied as metadata only.
              </Text>
            </View>
          )}
        </ScrollView>
            </KeyboardAvoidingView>

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
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <Text style={{
                    color: theme.textPrimary,
                    fontSize: 20,
                    fontWeight: 'bold',
                  }}>
                    Filters
                  </Text>
                    {processingImage && (
                      <ActivityIndicator size="small" color={theme.accent} />
                    )}
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      {FILTERS.map((filter) => (
                        <TouchableOpacity
                          key={filter.id}
                          onPress={() => !processingImage && applyFilter(filter.id)}
                          disabled={processingImage}
                          style={{
                            alignItems: 'center',
                            padding: 10,
                            backgroundColor: photoForm.filter === filter.id ? theme.accentSoft : theme.cardSoft,
                            borderRadius: 10,
                            minWidth: 80,
                            opacity: processingImage ? 0.5 : 1,
                          }}
                        >
                          <Text style={{
                            color: theme.textPrimary,
                            fontSize: 14,
                            fontWeight: photoForm.filter === filter.id ? 'bold' : 'normal',
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
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <Text style={{
                    color: theme.textPrimary,
                    fontSize: 20,
                    fontWeight: 'bold',
                  }}>
                    Adjustments
                  </Text>
                    {processingImage && (
                      <ActivityIndicator size="small" color={theme.accent} />
                    )}
                  </View>
                  
                  <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
                    <View style={{ gap: 24 }}>
                      {/* Brightness */}
                    <View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <Text style={{ color: theme.textPrimary, fontSize: 16, fontWeight: '600' }}>
                            Brightness
                      </Text>
                          <Text style={{ color: theme.textSecondary, fontSize: 14 }}>
                            {adjustments.brightness}
                          </Text>
                        </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          <TouchableOpacity
                            onPress={() => setAdjustments({ ...adjustments, brightness: Math.max(-100, adjustments.brightness - 5) })}
                            style={{ 
                              padding: 10, 
                              backgroundColor: theme.cardSoft, 
                              borderRadius: 8,
                              minWidth: 44,
                              alignItems: 'center',
                            }}
                          >
                            <Text style={{ color: theme.textPrimary, fontSize: 18, fontWeight: 'bold' }}>−</Text>
                          </TouchableOpacity>
                          <View style={{ flex: 1, height: 40, justifyContent: 'center' }}>
                          <View style={{
                              height: 8,
                            backgroundColor: theme.border,
                              borderRadius: 4,
                              position: 'relative',
                            }}>
                              <View style={{
                                position: 'absolute',
                                left: `${((adjustments.brightness + 100) / 200) * 100}%`,
                                top: -6,
                                width: 20,
                                height: 20,
                                borderRadius: 10,
                                backgroundColor: theme.accent,
                                borderWidth: 2,
                                borderColor: '#fff',
                          }} />
                        </View>
                      </View>
                        <TouchableOpacity
                            onPress={() => setAdjustments({ ...adjustments, brightness: Math.min(100, adjustments.brightness + 5) })}
                            style={{ 
                              padding: 10, 
                              backgroundColor: theme.cardSoft, 
                              borderRadius: 8,
                              minWidth: 44,
                              alignItems: 'center',
                            }}
                          >
                            <Text style={{ color: theme.textPrimary, fontSize: 18, fontWeight: 'bold' }}>+</Text>
                        </TouchableOpacity>
                      </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>-100</Text>
                          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>0</Text>
                          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>100</Text>
                      </View>
                    </View>

                      {/* Contrast */}
                    <View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <Text style={{ color: theme.textPrimary, fontSize: 16, fontWeight: '600' }}>
                            Contrast
                      </Text>
                          <Text style={{ color: theme.textSecondary, fontSize: 14 }}>
                            {adjustments.contrast.toFixed(1)}
                          </Text>
                        </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          <TouchableOpacity
                            onPress={() => setAdjustments({ ...adjustments, contrast: Math.max(0, adjustments.contrast - 0.1) })}
                            style={{ 
                              padding: 10, 
                              backgroundColor: theme.cardSoft, 
                              borderRadius: 8,
                              minWidth: 44,
                              alignItems: 'center',
                            }}
                          >
                            <Text style={{ color: theme.textPrimary, fontSize: 18, fontWeight: 'bold' }}>−</Text>
                          </TouchableOpacity>
                          <View style={{ flex: 1, height: 40, justifyContent: 'center' }}>
                          <View style={{
                              height: 8,
                            backgroundColor: theme.border,
                              borderRadius: 4,
                              position: 'relative',
                            }}>
                              <View style={{
                                position: 'absolute',
                                left: `${(adjustments.contrast / 2) * 100}%`,
                                top: -6,
                                width: 20,
                                height: 20,
                                borderRadius: 10,
                                backgroundColor: theme.accent,
                                borderWidth: 2,
                                borderColor: '#fff',
                          }} />
                        </View>
                      </View>
                        <TouchableOpacity
                          onPress={() => setAdjustments({ ...adjustments, contrast: Math.min(2, adjustments.contrast + 0.1) })}
                            style={{ 
                              padding: 10, 
                              backgroundColor: theme.cardSoft, 
                              borderRadius: 8,
                              minWidth: 44,
                              alignItems: 'center',
                            }}
                          >
                            <Text style={{ color: theme.textPrimary, fontSize: 18, fontWeight: 'bold' }}>+</Text>
                        </TouchableOpacity>
                      </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>0</Text>
                          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>1</Text>
                          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>2</Text>
                      </View>
                    </View>

                      {/* Saturation */}
                    <View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <Text style={{ color: theme.textPrimary, fontSize: 16, fontWeight: '600' }}>
                            Saturation
                      </Text>
                          <Text style={{ color: theme.textSecondary, fontSize: 14 }}>
                            {adjustments.saturation.toFixed(1)}
                          </Text>
                        </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          <TouchableOpacity
                            onPress={() => setAdjustments({ ...adjustments, saturation: Math.max(0, adjustments.saturation - 0.1) })}
                            style={{ 
                              padding: 10, 
                              backgroundColor: theme.cardSoft, 
                              borderRadius: 8,
                              minWidth: 44,
                              alignItems: 'center',
                            }}
                          >
                            <Text style={{ color: theme.textPrimary, fontSize: 18, fontWeight: 'bold' }}>−</Text>
                          </TouchableOpacity>
                          <View style={{ flex: 1, height: 40, justifyContent: 'center' }}>
                          <View style={{
                              height: 8,
                            backgroundColor: theme.border,
                              borderRadius: 4,
                              position: 'relative',
                            }}>
                              <View style={{
                                position: 'absolute',
                                left: `${(adjustments.saturation / 2) * 100}%`,
                                top: -6,
                                width: 20,
                                height: 20,
                                borderRadius: 10,
                                backgroundColor: theme.accent,
                                borderWidth: 2,
                                borderColor: '#fff',
                          }} />
                        </View>
                      </View>
                        <TouchableOpacity
                          onPress={() => setAdjustments({ ...adjustments, saturation: Math.min(2, adjustments.saturation + 0.1) })}
                            style={{ 
                              padding: 10, 
                              backgroundColor: theme.cardSoft, 
                              borderRadius: 8,
                              minWidth: 44,
                              alignItems: 'center',
                            }}
                          >
                            <Text style={{ color: theme.textPrimary, fontSize: 18, fontWeight: 'bold' }}>+</Text>
                        </TouchableOpacity>
                      </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>0</Text>
                          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>1</Text>
                          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>2</Text>
                    </View>
                  </View>
                    </View>
                  </ScrollView>

                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
                    <TouchableOpacity
                      onPress={applyAdjustments}
                      disabled={processingImage}
                      style={{
                        flex: 1,
                        backgroundColor: processingImage ? theme.border : theme.accent,
                        padding: 15,
                        borderRadius: 10,
                        alignItems: 'center',
                        opacity: processingImage ? 0.6 : 1,
                      }}
                    >
                      {processingImage ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Apply</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setAdjustments({ brightness: 0, contrast: 1, saturation: 1, hue: 0 });
                        resetEdits();
                        setShowAdjustModal(false);
                      }}
                      style={{
                        flex: 1,
                        backgroundColor: theme.cardSoft,
                        padding: 15,
                        borderRadius: 10,
                        alignItems: 'center',
                        borderWidth: 1,
                        borderColor: theme.border,
                      }}
                    >
                      <Text style={{ color: theme.textPrimary, fontWeight: 'bold', fontSize: 16 }}>Reset</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setShowAdjustModal(false)}
                      style={{
                        flex: 1,
                        backgroundColor: theme.cardSoft,
                        padding: 15,
                        borderRadius: 10,
                        alignItems: 'center',
                        borderWidth: 1,
                        borderColor: theme.border,
                      }}
                    >
                      <Text style={{ color: theme.textPrimary, fontWeight: 'bold', fontSize: 16 }}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>

            {/* Music Selection Modal */}
            <Modal
              visible={showMusicModal}
              transparent={true}
              animationType="slide"
              onRequestClose={() => setShowMusicModal(false)}
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
                  maxHeight: '50%',
                }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <Text style={{
                      color: theme.textPrimary,
                      fontSize: 20,
                      fontWeight: 'bold',
                    }}>
                      Add Music
                    </Text>
                  </View>
                  
                  <Text style={{ color: theme.textSecondary, marginBottom: 20, fontSize: 14 }}>
                    Select an audio file to add as background music to your video. The music will be mixed with the video's original audio.
                  </Text>

                  <TouchableOpacity
                    onPress={selectMusic}
                    style={{
                      backgroundColor: theme.accent,
                      padding: 15,
                      borderRadius: 10,
                      alignItems: 'center',
                      marginBottom: 12,
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Select Music File</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setShowMusicModal(false)}
                    style={{
                      backgroundColor: theme.cardSoft,
                      padding: 15,
                      borderRadius: 10,
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: theme.border,
                    }}
                  >
                    <Text style={{ color: theme.textPrimary, fontWeight: 'bold', fontSize: 16 }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>

            {/* Video Filter Modal */}
            <Modal
              visible={showVideoFilterModal}
              transparent={true}
              animationType="slide"
              onRequestClose={() => setShowVideoFilterModal(false)}
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
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <Text style={{
                      color: theme.textPrimary,
                      fontSize: 20,
                      fontWeight: 'bold',
                    }}>
                      Video Filters
                    </Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      {FILTERS.map((filter) => (
                        <TouchableOpacity
                          key={filter.id}
                          onPress={() => applyVideoFilter(filter.id)}
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
                  <Text style={{ color: theme.textSecondary, marginTop: 16, fontSize: 12, textAlign: 'center' }}>
                    Note: Filters are applied as preview. Actual video processing may be done on the server.
                  </Text>
                  <TouchableOpacity
                    onPress={() => setShowVideoFilterModal(false)}
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

            {/* Media Editor Modal */}
            {editingMedia && (
              <MediaEditor
                visible={showEditor}
                onClose={() => {
                  setShowEditor(false);
                  setEditingMedia(null);
                }}
                media={editingMedia}
                mediaType={editingMedia.mediaType || 'photo'}
              onSave={async (editedData, captureRef) => {
                try {
                  // Export edited media with capture function for photos
                  const exportedMedia = await exportEditedMedia(editedData, captureRef);
                  
                  // Mark media as edited so we don't process it again during upload
                  setIsMediaEdited(true);
                  
                  // Update form with exported media
                  if (editedData.mediaType === 'video') {
                    setForm({
                      ...form,
                      video: exportedMedia,
                      filter: editedData.filter || form.filter,
                      music: editedData.music || form.music,
                    });
                  } else {
                    setPhotoForm({
                      ...photoForm,
                      photo: exportedMedia,
                      filter: editedData.filter || photoForm.filter,
                    });
                    setEditedImage(exportedMedia);
                    // Only update originalImage if URI changed to avoid triggering unnecessary useEffect
                    if (originalImage?.uri !== exportedMedia?.uri) {
                      setOriginalImage(exportedMedia);
                    }
                  }
                  
                  setShowEditor(false);
                  setEditingMedia(null);
                  Alert.alert('Success', 'Media edited and saved!');
                } catch (error) {
                  Alert.alert('Error', 'Failed to export edited media: ' + error.message);
                }
              }}
              onExport={async (editedData, captureRef) => {
                try {
                  // Export edited media with capture function for photos
                  const exportedMedia = await exportEditedMedia(editedData, captureRef);
                  
                  // Mark media as edited so we don't process it again during upload
                  setIsMediaEdited(true);
                  
                  // Update form with exported media
                  if (editedData.mediaType === 'video') {
                    setForm({
                      ...form,
                      video: exportedMedia,
                      filter: editedData.filter || form.filter,
                      music: editedData.music || form.music,
                    });
                  } else {
                    setPhotoForm({
                      ...photoForm,
                      photo: exportedMedia,
                      filter: editedData.filter || photoForm.filter,
                    });
                    setEditedImage(exportedMedia);
                    // Only update originalImage if URI changed to avoid triggering unnecessary useEffect
                    if (originalImage?.uri !== exportedMedia?.uri) {
                      setOriginalImage(exportedMedia);
                    }
                  }
                  
                  setShowEditor(false);
                  setEditingMedia(null);
                } catch (error) {
                  Alert.alert('Error', 'Failed to export edited media: ' + error.message);
                }
              }}
              />
            )}
          </ImageBackground>
        </LinearGradient>
      </View>
    </SafeAreaView>
  );
};

export default Create;
