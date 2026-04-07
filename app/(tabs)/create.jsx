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
  Animated,
  PanResponder,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { WebView } from "react-native-webview";
import * as FileSystem from "expo-file-system/legacy";
import Slider from "@react-native-community/slider";
import { captureRef } from "react-native-view-shot";

import { icons, images } from "../../constants";
import { createVideoPost, createPhotoPost } from "../../lib/appwrite";
import { isMuxUploadEnabled } from "../../lib/muxConfig";
import { publishVideoWithMux } from "../../lib/muxClient";
import {
  processVideo,
  processPhoto,
  checkProcessingServer,
  checkAppwriteFunctions,
  processVideoAuto,
  processVideoWithAppwrite,
} from "../../lib/videoProcessor";
import { exportEditedMedia } from "../../lib/mediaExporter";
import {
  CustomButton,
  FormField,
  MediaEditor,
  PhotoEditor,
} from "../../components";
import { Feather } from "@expo/vector-icons";
import { useGlobalContext } from "../../context/GlobalProvider";

const BASE64_ENCODING = FileSystem?.EncodingType?.Base64 || "base64";

const FILTERS = [
  { id: "none", name: "Original" },
  { id: "wavy", name: "Wavy" },
  { id: "paris", name: "Paris" },
  { id: "losangeles", name: "Los Angeles" },
  { id: "oslo", name: "Oslo" },
  { id: "tokyo", name: "Tokyo" },
  { id: "london", name: "London" },
  { id: "moscow", name: "Moscow" },
  { id: "berlin", name: "Berlin" },
  { id: "rome", name: "Rome" },
  { id: "madrid", name: "Madrid" },
  { id: "amsterdam", name: "Amsterdam" },
  { id: "vintage", name: "Vintage" },
  { id: "blackwhite", name: "B&W" },
  { id: "sepia", name: "Sepia" },
  { id: "cool", name: "Cool" },
  { id: "warm", name: "Warm" },
  { id: "contrast", name: "Contrast" },
  { id: "bright", name: "Bright" },
  { id: "dramatic", name: "Dramatic" },
  { id: "portrait", name: "Portrait" },
  { id: "cinema", name: "Cinema" },
  { id: "noir", name: "Noir" },
  { id: "vivid", name: "Vivid" },
  { id: "fade", name: "Fade" },
  { id: "chrome", name: "Chrome" },
  { id: "process", name: "Process" },
];

const Create = () => {
  const { user, isRTL, theme, isDarkMode } = useGlobalContext();
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [postType, setPostType] = useState("video"); // 'video' or 'photo'
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
  const [imageUpdateKey, setImageUpdateKey] = useState(0); // Force WebView re-render when image changes
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustments, setAdjustments] = useState({
    brightness: 0,
    contrast: 1,
    saturation: 1,
    hue: 0,
  });
  // Video adjustments state (Instagram-style)
  const [videoAdjustments, setVideoAdjustments] = useState({
    brightness: 0,
    contrast: 0,
    saturation: 0,
    warmth: 0,
    lux: 0,
    fade: 0,
    highlights: 0,
    shadows: 0,
    structure: 0,
  });
  const [showVideoAdjustModal, setShowVideoAdjustModal] = useState(false);
  const [selectedVideoTool, setSelectedVideoTool] = useState(null);
  const [processingImage, setProcessingImage] = useState(false);
  const [showVideoFilterModal, setShowVideoFilterModal] = useState(false);
  const [showMusicModal, setShowMusicModal] = useState(false);
  const [videoFilterCSS, setVideoFilterCSS] = useState("none");
  const [videoThumbnailBase64, setVideoThumbnailBase64] = useState(null); // Base64 image for filter thumbnails
  const videoThumbnailWebViewRef = useRef(null); // Ref for WebView that extracts video frame
  const [processedVideoUri, setProcessedVideoUri] = useState(null); // URI of server-processed video

  // Video editing features state
  const [showTrimModal, setShowTrimModal] = useState(false);
  const [videoTrimStart, setVideoTrimStart] = useState(0); // in seconds
  const [videoTrimEnd, setVideoTrimEnd] = useState(0); // in seconds
  const [videoDuration, setVideoDuration] = useState(0); // total video duration

  const [showSpeedModal, setShowSpeedModal] = useState(false);
  const [videoSpeed, setVideoSpeed] = useState(1.0); // 0.3, 0.5, 1, 2, 3

  const [showCoverModal, setShowCoverModal] = useState(false);
  const [videoCoverTime, setVideoCoverTime] = useState(0); // time in seconds for cover frame

  const [showVolumeModal, setShowVolumeModal] = useState(false);
  const [videoVolume, setVideoVolume] = useState(1.0); // 0.0 to 1.0

  const [showVideoTextModal, setShowVideoTextModal] = useState(false);
  const [videoTextOverlays, setVideoTextOverlays] = useState([]);
  const [currentVideoText, setCurrentVideoText] = useState("");

  const [showCropModal, setShowCropModal] = useState(false);
  const [videoCrop, setVideoCrop] = useState({
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  }); // normalized crop values
  const [videoRotation, setVideoRotation] = useState(0); // 0, 90, 180, 270

  const videoRef = useRef(null);
  const seekTimeoutRef = useRef(null); // Debounce seeking
  const isSeekingRef = useRef(false); // Prevent multiple simultaneous seeks
  const scrollViewRef = useRef(null);
  const linkInputRef = useRef(null);
  const textWebViewRef = useRef(null);
  const hiddenTextInputRef = useRef(null);
  const textModalContainerRef = useRef(null);
  const textStartPositionsRef = useRef({});
  const textPanRespondersRef = useRef({});
  const photoWebViewRef = useRef(null); // Ref for the WebView displaying the photo
  const photoWebViewContainerRef = useRef(null); // Ref for the container View wrapping the WebView

  // Safe seek function with debounce and error handling
  const safeSeek = useCallback(async (positionMs) => {
    // Clear any pending seek
    if (seekTimeoutRef.current) {
      clearTimeout(seekTimeoutRef.current);
    }

    // If already seeking, wait
    if (isSeekingRef.current) {
      return;
    }

    // Debounce the seek operation
    seekTimeoutRef.current = setTimeout(async () => {
      if (!videoRef.current) return;

      isSeekingRef.current = true;
      try {
        await videoRef.current.setPositionAsync(positionMs);
      } catch (error) {
        // Silently ignore seeking errors - they're harmless
        if (!error?.message?.includes?.("Seeking interrupted")) {
        }
      } finally {
        // Reset seeking flag after a short delay
        setTimeout(() => {
          isSeekingRef.current = false;
        }, 100);
      }
    }, 150); // 150ms debounce
  }, []);
  const [processingMedia, setProcessingMedia] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [useProcessing, setUseProcessing] = useState(false);
  const [useAppwriteFunctions, setUseAppwriteFunctions] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editingMedia, setEditingMedia] = useState(null);
  const [isMediaEdited, setIsMediaEdited] = useState(false); // Track if media was edited via MediaEditor
  const [showPhotoEditor, setShowPhotoEditor] = useState(false);
  const [editingPhotoUri, setEditingPhotoUri] = useState(null);
  const [showTextModal, setShowTextModal] = useState(false);
  const [textOverlays, setTextOverlays] = useState([]);
  const [editingTextId, setEditingTextId] = useState(null); // Track which text overlay is being edited
  const [originalEditingOverlay, setOriginalEditingOverlay] = useState(null); // Store original overlay when editing starts
  const [currentText, setCurrentText] = useState("");
  const [currentTextStyle, setCurrentTextStyle] = useState({
    fontSize: 24,
    fontFamily: "Poppins-Bold",
    color: "#FFFFFF",
    backgroundColor: "transparent",
    alignment: "center",
    textStyle: "normal", // normal, outline, shadow, neon, gradient
  });
  const [currentTextPosition, setCurrentTextPosition] = useState({
    x: 50,
    y: 50,
  });

  const [showTextStyles, setShowTextStyles] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showBackgroundColors, setShowBackgroundColors] = useState(false);
  const [imageOverlays, setImageOverlays] = useState([]);
  const [showOverlayModal, setShowOverlayModal] = useState(false);

  // Instagram text styles - Multiple styles like Instagram
  const TEXT_STYLES = [
    {
      id: "normal",
      name: "Normal",
      fontFamily: "Poppins-Regular",
      fontWeight: "400",
    },
    { id: "bold", name: "Bold", fontFamily: "Poppins-Bold", fontWeight: "700" },
    {
      id: "italic",
      name: "Italic",
      fontFamily: "Poppins-Regular",
      fontWeight: "400",
      fontStyle: "italic",
    },
    {
      id: "outline",
      name: "Outline",
      fontFamily: "Poppins-Bold",
      fontWeight: "700",
    },
    {
      id: "shadow",
      name: "Shadow",
      fontFamily: "Poppins-Bold",
      fontWeight: "700",
    },
    { id: "neon", name: "Neon", fontFamily: "Poppins-Bold", fontWeight: "700" },
    {
      id: "gradient",
      name: "Gradient",
      fontFamily: "Poppins-Bold",
      fontWeight: "700",
    },
    {
      id: "classic",
      name: "Classic",
      fontFamily: "Poppins-Bold",
      fontWeight: "700",
    },
    {
      id: "modern",
      name: "Modern",
      fontFamily: "Poppins-SemiBold",
      fontWeight: "600",
    },
    {
      id: "journal",
      name: "Journal",
      fontFamily: "Poppins-Regular",
      fontWeight: "400",
    },
  ];

  // Instagram text colors - Extended palette (no duplicates)
  const TEXT_COLORS = [
    "#FFFFFF",
    "#000000",
    "#FF0000",
    "#00FF00",
    "#0000FF",
    "#FFFF00",
    "#FF00FF",
    "#00FFFF",
    "#FF6B6B",
    "#4ECDC4",
    "#45B7D1",
    "#FFA07A",
    "#98D8C8",
    "#F7DC6F",
    "#BB8FCE",
    "#85C1E2",
    "#F8B739",
    "#FF1493",
    "#00CED1",
    "#FFD700",
    "#FF6347",
    "#9370DB",
    "#20B2AA",
    "#FF69B4",
    "#32CD32",
    "#FF4500",
    "#1E90FF",
    "#00FA9A",
    "#8A2BE2",
    "#DC143C",
  ];

  // Background colors for text
  const BACKGROUND_COLORS = [
    "transparent",
    "#FFFFFF",
    "#000000",
    "#FF0000",
    "#00FF00",
    "#0000FF",
    "#FFFF00",
    "#FF00FF",
    "#00FFFF",
    "#FF6B6B",
    "#4ECDC4",
    "#45B7D1",
  ];

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
    const checkServers = async () => {
      try {
        // Check separate processing server
        const isServerAvailable = await checkProcessingServer();
        setUseProcessing(isServerAvailable);
        
        // Check Appwrite Functions
        const isAppwriteAvailable = await checkAppwriteFunctions();
        setUseAppwriteFunctions(isAppwriteAvailable);
        
      } catch (error) {
        setUseProcessing(false);
        setUseAppwriteFunctions(false);
      }
    };
    checkServers();
  }, []);

  // Update video filter CSS when adjustments change
  useEffect(() => {
    if (form.video) {
      const newFilterCSS = getVideoFilterCSS();
      setVideoFilterCSS(newFilterCSS);
    }
  }, [videoAdjustments, form.filter, form.video, getVideoFilterCSS]);

  // Extract video frame for filter thumbnails (like photos do with base64)
  useEffect(() => {
    const extractVideoFrame = async () => {
      if (!form.video || !form.video.uri) {
        setVideoThumbnailBase64(null);
        return;
      }

      // If we already have a thumbnail for this video, skip
      if (videoThumbnailBase64) {
        return;
      }

      try {
        // Use a hidden Video component to capture a frame
        // We'll use view-shot or canvas to capture the frame
        // For now, we'll extract it when the filter modal opens
        // The thumbnails will use WebView with the video frame once extracted
      } catch (error) {
      }
    };

    extractVideoFrame();
  }, [form.video]);

  // Cleanup seek timeout on unmount
  useEffect(() => {
    return () => {
      if (seekTimeoutRef.current) {
        clearTimeout(seekTimeoutRef.current);
      }
    };
  }, []);

  // Auto-focus text input when text modal opens or when image is tapped
  useEffect(() => {
    if (showTextModal && hiddenTextInputRef.current) {
      // Small delay to ensure modal is fully rendered
      const timer = setTimeout(() => {
        hiddenTextInputRef.current?.focus();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [showTextModal]);

  const openPicker = async (selectType) => {
    try {
      // Request permissions
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          t("alerts.permissionRequiredTitle") || "Permission Required",
          t("alerts.permissionRequiredMessage") ||
            "Please grant permission to access your media library"
        );
        return;
      }

      const pickerOptions = {
        mediaTypes:
          selectType === "image"
            ? ImagePicker.MediaTypeOptions.Images
            : ImagePicker.MediaTypeOptions.Videos,
        quality: selectType === "video" ? 0.6 : 0.7,
        exif: false, // Don't include EXIF data
      };

      // Add type-specific options
      if (selectType === "image") {
        pickerOptions.allowsEditing = true;
        pickerOptions.aspect = [16, 9];
      } else if (selectType === "video") {
        pickerOptions.allowsEditing = false; // Disable editing for videos (we handle trimming separately)
        pickerOptions.videoMaxDuration = 360; // Support up to 6 minutes
      }

      const result = await ImagePicker.launchImageLibraryAsync(pickerOptions);

      // Check if user cancelled
      if (!result || result.canceled) {
        return; // User cancelled - not an error
      }

      // Validate result
      if (!result.assets || result.assets.length === 0) {
        Alert.alert(
          "Error",
          "No media selected. Please try selecting a file again."
        );
        return;
      }

      const selectedAsset = result.assets[0];

      // Validate selected asset
      if (!selectedAsset) {
        Alert.alert("Error", "Invalid media file selected. Please try again.");
        return;
      }

      if (!selectedAsset.uri) {
        Alert.alert(
          "Error",
          "Failed to get media file path. Please try again."
        );
        return;
      }

      let fileName =
        selectedAsset.fileName ||
        selectedAsset.name ||
        selectedAsset.uri.split("/").pop() ||
        `file_${Date.now()}`;

      // Ensure proper file extension for image uploads.
      // For videos, preserve original extension/container to avoid codec mismatch.
      if (selectType === "video") {
        if (!/\.[a-zA-Z0-9]+$/.test(fileName)) {
          const uriExt = selectedAsset.uri?.split(".").pop()?.split("?")[0];
          if (uriExt) {
            fileName = `${fileName}.${uriExt}`;
          }
        }
      } else if (selectType === "image") {
        // Force .jpg extension for images
        const baseName = fileName.split(".")[0];
        fileName = `${baseName}.jpg`;
      }

      const guessedFromExt = (() => {
        const lower = (fileName || "").toLowerCase();
        if (lower.endsWith(".mov") || lower.endsWith(".qt")) return "video/quicktime";
        if (lower.endsWith(".m4v")) return "video/x-m4v";
        if (lower.endsWith(".3gp")) return "video/3gpp";
        if (lower.endsWith(".webm")) return "video/webm";
        if (lower.endsWith(".mp4")) return "video/mp4";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".png")) return "image/png";
        return null;
      })();

      const fileType =
        selectedAsset.mimeType ||
        (selectedAsset.type === "image"
          ? "image/jpeg"
          : selectedAsset.type === "video"
          ? guessedFromExt || "video/mp4"
          : selectedAsset.type) ||
        guessedFromExt ||
        (selectType === "video" ? "video/mp4" : "image/jpeg");
      const fileSize = selectedAsset.fileSize || selectedAsset.size;

      // For videos, copy the trimmed video to a permanent location
      // This ensures the trimmed video persists and is used when posting
      // The trimmed video from ImagePicker might be in a temporary location
      // that gets deleted, so we copy it to a permanent location
      let finalUri = selectedAsset.uri;
      if (selectType === "video") {
        try {
          // Create a permanent file path for the trimmed video
          const permanentPath = `${
            FileSystem.documentDirectory
          }trimmed_video_${Date.now()}.mp4`;

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
            finalUri = selectedAsset.uri;
          }
        } catch (copyError) {
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

      if (postType === "video") {
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
          // Reset all video editing states
          setVideoTrimStart(0);
          setVideoTrimEnd(0);
          setVideoDuration(0);
          setVideoSpeed(1.0);
          setVideoCoverTime(0);
          setVideoVolume(1.0);
          setVideoTextOverlays([]);
          setVideoCrop({ x: 0, y: 0, width: 1, height: 1 });
          setVideoRotation(0);
          setProcessedVideoUri(null); // Clear processed video when new video is selected
          setVideoFilterCSS("none");
          setVideoAdjustments({
            brightness: 0,
            contrast: 0,
            saturation: 0,
            warmth: 0,
            lux: 0,
            fade: 0,
            highlights: 0,
            shadows: 0,
            structure: 0,
          });
        }
      } else {
        // Photo mode
        setOriginalImage(file);
        setEditedImage(file);
        setPhotoForm({ ...photoForm, photo: file });
        setIsMediaEdited(false); // Reset edit flag when new photo is selected
        manuallySetBase64Ref.current = false; // Reset manual base64 flag when new image is selected
      }
    } catch (error) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error occurred";
      Alert.alert(
        t("common.error") || "Error",
        t("alerts.mediaSelectError") ||
          `Failed to select media: ${errorMessage}`
      );
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

      if (filterId === "none") {
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
      const hasAdjustments =
        adjustments.brightness !== 0 ||
        adjustments.contrast !== 1 ||
        adjustments.saturation !== 1 ||
        adjustments.hue !== 0;

      if (hasAdjustments) {
        // Store adjustments in the image object, keeping the filter if any
        const editedFile = {
          ...originalImage,
          filter: photoForm.filter || "none", // Keep existing filter
          adjustments: { ...adjustments }, // Store adjustment values
        };

        setEditedImage(editedFile);
        setPhotoForm({ ...photoForm, photo: editedFile });
        setEdits({ ...edits, adjustments });
      } else {
        // If no adjustments, revert to filter state or original
        if (photoForm.filter && photoForm.filter !== "none" && editedImage) {
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
        type: ["audio/*"],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedAsset = result.assets[0];
        const file = {
          uri: selectedAsset.uri,
          name: selectedAsset.name || `music_${Date.now()}.mp3`,
          type: selectedAsset.mimeType || "audio/mpeg",
          size: selectedAsset.size,
        };
        setForm({ ...form, music: file });
        setShowMusicModal(false);
      }
    } catch (error) {
      Alert.alert(t("common.error"), "Failed to select music file");
    }
  };

  // Generate video filter CSS with adjustments
  const getVideoFilterCSS = useCallback(() => {
    const baseFilterCSS = getFilterCSS(form.filter, null);

    // Add video adjustments to filter CSS
    const adjustmentParts = [];

    // Brightness and Lux combined
    let brightnessValue = 1;
    if (videoAdjustments.brightness !== 0) {
      brightnessValue *= 1 + videoAdjustments.brightness / 200;
    }
    if (videoAdjustments.lux !== 0) {
      brightnessValue *= 1 + videoAdjustments.lux / 300;
    }
    if (brightnessValue !== 1) {
      adjustmentParts.push(`brightness(${brightnessValue.toFixed(2)})`);
    }

    // Contrast and Structure combined
    let contrastValue = 1.0;
    if (videoAdjustments.contrast !== 0) {
      contrastValue = 0.5 + ((videoAdjustments.contrast + 100) / 200) * 1.0;
    }
    if (videoAdjustments.structure !== 0) {
      const structureValue =
        0.5 + ((videoAdjustments.structure + 100) / 200) * 1.0;
      contrastValue *= structureValue;
    }
    if (contrastValue !== 1.0) {
      adjustmentParts.push(`contrast(${contrastValue.toFixed(2)})`);
    }

    // Saturation
    if (videoAdjustments.saturation !== 0) {
      const saturation = 1 + videoAdjustments.saturation / 100;
      adjustmentParts.push(`saturate(${saturation.toFixed(2)})`);
    }

    // Warmth (hue-rotate)
    if (videoAdjustments.warmth !== 0) {
      const hue = (videoAdjustments.warmth / 100) * 30;
      adjustmentParts.push(`hue-rotate(${hue.toFixed(1)}deg)`);
    }

    // Fade (opacity + desaturate)
    if (videoAdjustments.fade !== 0) {
      const fade = videoAdjustments.fade / 100;
      adjustmentParts.push(`opacity(${(1 - fade * 0.3).toFixed(2)})`);
      adjustmentParts.push(`saturate(${(1 - fade * 0.3).toFixed(2)})`);
    }

    // Combine base filter with adjustments
    const allParts = [];
    if (baseFilterCSS && baseFilterCSS !== "none") {
      allParts.push(baseFilterCSS);
    }
    if (adjustmentParts.length > 0) {
      allParts.push(adjustmentParts.join(" "));
    }

    return allParts.length > 0 ? allParts.join(" ") : "none";
  }, [form.filter, videoAdjustments, getFilterCSS]);

  // Apply video trim and/or speed changes - process on server for preview
  const applyVideoTrimAndSpeed = async () => {
    // Determine if trim is needed
    const needsTrim = videoDuration > 0 && (videoTrimStart > 0 || (videoTrimEnd > 0 && videoTrimEnd < videoDuration));
    const trimData = needsTrim && videoDuration > 0 ? { 
      start: videoTrimStart, 
      end: videoTrimEnd > 0 && videoTrimEnd <= videoDuration ? videoTrimEnd : videoDuration 
    } : null;
    const needsSpeed = videoSpeed !== 1.0;
    
    // If processing is available and we have trim or speed changes, process the video
    if ((useProcessing || useAppwriteFunctions) && form.video && (needsTrim || needsSpeed || form.filter !== "none")) {
      try {
        setProcessingMedia(true);
        setProcessingProgress(10);
        
        let processedResult = null;
        
        // Try Appwrite Functions first if available
        if (useAppwriteFunctions) {
          try {
            processedResult = await processVideoAuto({
              video: form.video,
              music: null,
              filter: form.filter || "none",
              filterIntensity: 100,
              musicVolume: 0.5,
              trim: trimData,
              videoSpeed: videoSpeed,
            });
          } catch (appwriteError) {
            // Fallback to separate server if Appwrite fails
            if (useProcessing) {
              try {
                processedResult = await processVideo({
                  video: form.video,
                  music: null,
                  filter: form.filter || "none",
                  filterIntensity: 100,
                  musicVolume: 0.5,
                  trim: trimData,
                  videoSpeed: videoSpeed,
                });
              } catch (serverError) {
                throw appwriteError; // Throw original error
              }
            } else {
              throw appwriteError;
            }
          }
        } 
        // Use separate server if Appwrite Functions not available
        else if (useProcessing) {
          processedResult = await processVideo({
            video: form.video,
            music: null,
            filter: form.filter || "none",
            filterIntensity: 100,
            musicVolume: 0.5,
            trim: trimData,
            videoSpeed: videoSpeed,
          });
        }
        
        if (processedResult && processedResult.base64) {
          const processedUri = `${FileSystem.documentDirectory}preview_video_${Date.now()}.mp4`;
          
          await FileSystem.writeAsStringAsync(
            processedUri,
            processedResult.base64,
            {
              encoding: BASE64_ENCODING,
            }
          );
          
          setProcessedVideoUri(processedUri);
        }
        
        setProcessingProgress(100);
        setProcessingMedia(false);
      } catch (error) {
        setProcessingMedia(false);
        // Don't clear processedVideoUri on error - keep previous processed video if it exists
        // Trim/speed values are saved in state, so they will be applied during final upload
        // Show user-friendly message
        Alert.alert(
          "Processing Unavailable",
          "Video preview processing is not available right now. Your trim and speed settings will be applied when you upload the video.",
          [{ text: "OK" }]
        );
      }
    } else {
      // If no processing server available, trim/speed changes will still be applied during final upload
      // The values are saved in state (videoTrimStart, videoTrimEnd, videoSpeed)
    }
  };

  // Apply video filter - process on server for real-time preview
  const applyVideoFilter = async (filterId) => {
    const filterCSS = getFilterCSS(filterId, null);
    setVideoFilterCSS(filterCSS);
    setForm({ ...form, filter: filterId });
    
    // If processing is available (either Appwrite Functions or separate server), process video in real-time for preview
    if ((useProcessing || useAppwriteFunctions) && form.video && filterId !== "none") {
      try {
        setProcessingMedia(true);
        setProcessingProgress(10);
        
        // Determine if trim is needed for preview
        // Only apply trim if video duration is known and trim values are set
        const needsTrim = videoDuration > 0 && (videoTrimStart > 0 || (videoTrimEnd > 0 && videoTrimEnd < videoDuration));
        const trimData = needsTrim && videoDuration > 0 ? { 
          start: videoTrimStart, 
          end: videoTrimEnd > 0 && videoTrimEnd <= videoDuration ? videoTrimEnd : videoDuration 
        } : null;
        
        // Use processVideoAuto which handles both Appwrite Functions and separate server based on config
        // No fallback - use whatever is configured
        const processedResult = await processVideoAuto({
          video: form.video,
          music: null,
          filter: filterId,
          filterIntensity: 100,
          musicVolume: 0.5,
          trim: trimData,
          videoSpeed: videoSpeed,
        });
        
        if (processedResult && processedResult.base64) {
          const processedUri = `${FileSystem.documentDirectory}preview_video_${Date.now()}.mp4`;
          
          await FileSystem.writeAsStringAsync(
            processedUri,
            processedResult.base64,
            {
              encoding: BASE64_ENCODING,
            }
          );
          
          setProcessedVideoUri(processedUri);
        }
        
        setProcessingProgress(100);
        setProcessingMedia(false);
      } catch (error) {
        setProcessingMedia(false);
        // Don't clear processedVideoUri on error - keep previous processed video if it exists
        // Filter state is saved in form.filter, so it will be applied during upload
      }
    } else {
      // Clear processed video if no filter is selected
      if (filterId === "none") {
        setProcessedVideoUri(null);
      }
      // Otherwise, if no processing available, keep existing processedVideoUri if it exists
    }
    
    // Don't close modal - let user see the preview and click Done
  };

  // Get CSS filter string based on filter type and adjustments
  const getFilterCSS = useCallback((filterId, adjustmentsData) => {
    let filterCSS = "";

    // Apply filter effects
    switch (filterId) {
      // Instagram-style filters
      case "wavy":
        filterCSS +=
          "brightness(1.05) contrast(0.95) saturate(0.85) hue-rotate(5deg)";
        break;
      case "paris":
        filterCSS +=
          "brightness(1.08) contrast(1.1) saturate(1.15) hue-rotate(-10deg)";
        break;
      case "losangeles":
        filterCSS +=
          "brightness(1.15) contrast(1.05) saturate(1.2) hue-rotate(15deg)";
        break;
      case "oslo":
        filterCSS +=
          "brightness(0.95) contrast(1.1) saturate(0.9) hue-rotate(10deg)";
        break;
      case "tokyo":
        filterCSS +=
          "brightness(1.1) contrast(1.15) saturate(1.1) hue-rotate(-5deg)";
        break;
      case "london":
        filterCSS +=
          "brightness(0.9) contrast(1.2) saturate(0.95) hue-rotate(5deg)";
        break;
      case "moscow":
        filterCSS +=
          "brightness(0.92) contrast(1.25) saturate(0.88) hue-rotate(-8deg)";
        break;
      case "berlin":
        filterCSS +=
          "brightness(0.98) contrast(1.15) saturate(1.05) hue-rotate(12deg)";
        break;
      case "rome":
        filterCSS +=
          "brightness(1.12) contrast(1.08) saturate(1.18) hue-rotate(-12deg)";
        break;
      case "madrid":
        filterCSS +=
          "brightness(1.05) contrast(1.2) saturate(1.12) hue-rotate(8deg)";
        break;
      case "amsterdam":
        filterCSS +=
          "brightness(1.08) contrast(1.05) saturate(1.1) hue-rotate(-15deg)";
        break;
      // Classic filters
      case "vintage":
        filterCSS += "brightness(1.1) contrast(0.9) saturate(0.8) sepia(0.2)";
        break;
      case "blackwhite":
        filterCSS += "grayscale(100%)";
        break;
      case "sepia":
        filterCSS += "sepia(1) brightness(1.1) contrast(0.9)";
        break;
      case "cool":
        filterCSS += "hue-rotate(30deg) saturate(0.9)";
        break;
      case "warm":
        filterCSS += "hue-rotate(-30deg) saturate(1.1)";
        break;
      case "contrast":
        filterCSS += "contrast(1.3)";
        break;
      case "bright":
        filterCSS += "brightness(1.2) contrast(1.1)";
        break;
      case "dramatic":
        filterCSS += "contrast(1.4) saturate(1.2) brightness(0.95)";
        break;
      case "portrait":
        filterCSS += "contrast(1.1) saturate(1.05) brightness(1.05)";
        break;
      case "cinema":
        filterCSS += "contrast(1.2) saturate(0.85) brightness(0.9)";
        break;
      case "noir":
        filterCSS += "grayscale(100%) contrast(1.3) brightness(0.9)";
        break;
      case "vivid":
        filterCSS += "saturate(1.3) contrast(1.2) brightness(1.05)";
        break;
      case "fade":
        filterCSS += "brightness(1.1) contrast(0.85) saturate(0.7)";
        break;
      case "chrome":
        filterCSS += "contrast(1.2) saturate(1.1) brightness(1.05)";
        break;
      case "process":
        filterCSS += "contrast(1.15) saturate(1.1) brightness(1.02)";
        break;
      default:
        break;
    }

    // Apply manual adjustments
    if (adjustmentsData) {
      const parts = [];
      if (adjustmentsData.brightness !== 0) {
        parts.push(`brightness(${1 + adjustmentsData.brightness / 100})`);
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
        filterCSS = filterCSS
          ? `${filterCSS} ${parts.join(" ")}`
          : parts.join(" ");
      }
    }

    return filterCSS || "none";
  }, []);

  // Convert image URI to base64 for WebView
  const [imageBase64, setImageBase64] = useState(null);
  const lastConvertedUri = useRef(null);
  const isConvertingRef = useRef(false);
  const manuallySetBase64Ref = useRef(false); // Track if base64 was manually set (from PhotoEditor)
  const captureResolveRef = useRef(null); // Store resolve function for WebView capture
  const captureRejectRef = useRef(null); // Store reject function for WebView capture

  useEffect(() => {
    const convertToBase64 = async () => {
      const currentUri = originalImage?.uri;

      // Clear state if no image
      if (!currentUri) {
        if (imageBase64 !== null) {
          setImageBase64(null);
          lastConvertedUri.current = null;
          manuallySetBase64Ref.current = false;
        }
        return;
      }

      // IMPORTANT: If base64 was manually set (from PhotoEditor), don't overwrite it
      if (manuallySetBase64Ref.current) {
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
        if (
          currentUri.startsWith("data:") ||
          currentUri.startsWith("http://") ||
          currentUri.startsWith("https://")
        ) {
          setImageBase64(currentUri);
          lastConvertedUri.current = currentUri;
          return;
        }

        // Handle file:// URIs
        let fileUri = currentUri;
        if (currentUri.startsWith("file://")) {
          fileUri = currentUri;
        } else if (
          currentUri.startsWith("content://") ||
          currentUri.startsWith("ph://")
        ) {
          // For content:// or ph:// URIs, try to read directly
          fileUri = currentUri;
        }

        // Read file and convert to base64
        const base64 = await FileSystem.readAsStringAsync(fileUri, {
          encoding: "base64",
        });
        const base64Data = `data:image/jpeg;base64,${base64}`;
        setImageBase64(base64Data);
        lastConvertedUri.current = currentUri;
      } catch (error) { 
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

  // Generate HTML for WebView using useMemo to ensure it updates when imageBase64 changes
  const webViewHTML = useMemo(() => {
    if (!imageBase64 || !editedImage) return "";

    return `
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
              height: auto;
              min-height: 100%;
              position: relative;
            }
            img {
              width: 100%;
              height: auto;
              display: block;
              filter: ${(() => {
                // If image came from PhotoEditor, adjustments are already baked in
                // Only apply the filter (if any), not adjustments
                if (
                  editedImage?.adjustmentsAlreadyApplied ||
                  editedImage?.fromPhotoEditor
                ) {
                  return getFilterCSS(photoForm.filter, null);
                }
                // Otherwise, apply both filter and adjustments
                return getFilterCSS(
                  photoForm.filter,
                  editedImage?.adjustments || adjustments
                );
              })()};
            }
            ${textOverlays
              .map((overlay, index) => {
                const textStyle = overlay.style || {};
                let textCSS = `
                position: absolute;
                top: ${overlay.y || 50}%;
                left: ${overlay.x || 50}%;
                transform: translate(-50%, -50%);
                font-size: ${textStyle.fontSize || 24}px;
                font-family: '${
                  textStyle.fontFamily || "Poppins-Bold"
                }', sans-serif;
                color: ${textStyle.color || "#FFFFFF"};
                text-align: ${textStyle.alignment || "center"};
                white-space: nowrap;
                z-index: ${index + 1};
              `;

                if (
                  textStyle.backgroundColor &&
                  textStyle.backgroundColor !== "transparent"
                ) {
                  textCSS += `background-color: ${textStyle.backgroundColor}; padding: 4px 8px; border-radius: 4px;`;
                }

                if (textStyle.textStyle === "outline") {
                  textCSS += `-webkit-text-stroke: 2px ${
                    textStyle.color || "#FFFFFF"
                  }; -webkit-text-fill-color: transparent;`;
                } else if (textStyle.textStyle === "shadow") {
                  textCSS += `text-shadow: 2px 2px 4px rgba(0,0,0,0.8), -2px -2px 4px rgba(0,0,0,0.8);`;
                }

                return `.text-overlay-${index} { ${textCSS} }`;
              })
              .join("\n")}
            ${imageOverlays
              .map((overlay, index) => {
                return `.image-overlay-${index} {
                position: absolute;
                top: ${overlay.y}%;
                left: ${overlay.x}%;
                width: ${overlay.width}%;
                height: ${overlay.height}%;
                transform: translate(-50%, -50%) rotate(${overlay.rotation}deg);
                z-index: ${100 + index};
                pointer-events: none;
              }`;
              })
              .join("\n")}
          </style>
        </head>
        <body>
          <img src="${imageBase64}" alt="Filtered Image" onerror="console.error('Image load error')" />
          ${textOverlays
            .map(
              (overlay, index) =>
                `<div class="text-overlay-${index}" data-overlay-id="${
                  overlay.id || index
                }" data-overlay-index="${index}">${overlay.text}</div>`
            )
            .join("")}
          ${imageOverlays
            .map(
              (overlay, index) =>
                `<img src="${overlay.uri}" class="image-overlay-${index}" alt="Overlay ${index}" />`
            )
            .join("")}
          <script>
            (function() {
              const textOverlays = document.querySelectorAll('[class^="text-overlay-"]');
              let draggedElement = null;
              let dragOffset = { x: 0, y: 0 };
              
              textOverlays.forEach(function(element) {
                element.style.cursor = 'move';
                element.style.userSelect = 'none';
                element.style.touchAction = 'none';
                
                element.addEventListener('touchstart', function(e) {
                  e.preventDefault();
                  e.stopPropagation();
                  draggedElement = element;
                  const rect = element.getBoundingClientRect();
                  const touch = e.touches[0];
                  dragOffset.x = touch.clientX - rect.left - rect.width / 2;
                  dragOffset.y = touch.clientY - rect.top - rect.height / 2;
                  element.style.opacity = '0.7';
                }, { passive: false });
                
                element.addEventListener('touchmove', function(e) {
                  e.preventDefault();
                  e.stopPropagation();
                  if (draggedElement === element) {
                    const touch = e.touches[0];
                    const bodyRect = document.body.getBoundingClientRect();
                    const x = ((touch.clientX - dragOffset.x) / bodyRect.width) * 100;
                    const y = ((touch.clientY - dragOffset.y) / bodyRect.height) * 100;
                    
                    const overlayId = element.getAttribute('data-overlay-id');
                    const overlayIndex = parseInt(element.getAttribute('data-overlay-index'));
                    
                    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'textDrag',
                        id: overlayId,
                        index: overlayIndex,
                        x: Math.max(0, Math.min(100, x)),
                        y: Math.max(0, Math.min(100, y))
                      }));
                    }
                  }
                }, { passive: false });
                
                element.addEventListener('touchend', function(e) {
                  e.preventDefault();
                  e.stopPropagation();
                  if (draggedElement === element) {
                    element.style.opacity = '1';
                    draggedElement = null;
                  }
                }, { passive: false });
              });
            })();
          </script>
        </body>
      </html>
    `;
  }, [
    imageBase64,
    editedImage,
    photoForm.filter,
    textOverlays,
    imageOverlays,
    adjustments,
  ]);

  // Function to capture the WebView content with all edits merged
  const captureWebViewContent = useCallback(async () => {
    return new Promise((resolve, reject) => {
      if (!photoWebViewRef.current || !imageBase64) {
        reject(new Error("WebView or image not available"));
        return;
      }

      // Generate filter CSS
      const filterCSS =
        editedImage?.adjustmentsAlreadyApplied || editedImage?.fromPhotoEditor
          ? getFilterCSS(photoForm.filter, null)
          : getFilterCSS(
              photoForm.filter,
              editedImage?.adjustments || adjustments
            );

      // Escape the filter CSS for JavaScript injection
      const escapedFilterCSS = filterCSS
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r");

      // Create JavaScript to capture the WebView content
      const captureScript = `
        (function() {
          try {
            const img = document.querySelector('img[alt="Filtered Image"]');
            if (!img) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'captureError',
                message: 'Image element not found'
              }));
              return;
            }

            // Wait for image to load
            const captureImage = function() {
              try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Get image dimensions
                const imgWidth = img.naturalWidth || img.width || 2000;
                const imgHeight = img.naturalHeight || img.height || 2000;
                
                if (!imgWidth || !imgHeight || imgWidth === 0 || imgHeight === 0) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'captureError',
                    message: 'Invalid image dimensions'
                  }));
                  return;
                }
                
                canvas.width = imgWidth;
                canvas.height = imgHeight;
                
                // Draw the base image first
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                // Apply filters manually (if any)
                const filterCSS = '${escapedFilterCSS}';
                if (filterCSS && filterCSS !== 'none') {
                  try {
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const data = imageData.data;
                    
                    // Parse filter values
                    const brightnessMatch = filterCSS.match(/brightness\\(([\\d.]+)\\)/g);
                    const contrastMatch = filterCSS.match(/contrast\\(([\\d.]+)\\)/);
                    const saturationMatch = filterCSS.match(/saturate\\(([\\d.]+)\\)/);
                    const hueRotateMatch = filterCSS.match(/hue-rotate\\(([\\d.]+)deg\\)/g);
                    
                    let brightness = 1.0;
                    if (brightnessMatch) {
                      brightnessMatch.forEach(match => {
                        brightness *= parseFloat(match.match(/brightness\\(([\\d.]+)\\)/)[1]);
                      });
                    }
                    
                    let contrast = contrastMatch ? parseFloat(contrastMatch[1]) : 1.0;
                    let saturation = saturationMatch ? parseFloat(saturationMatch[1]) : 1.0;
                    let hueRotate = 0;
                    if (hueRotateMatch) {
                      hueRotateMatch.forEach(match => {
                        hueRotate += parseFloat(match.match(/hue-rotate\\(([\\d.]+)deg\\)/)[1]);
                      });
                    }
                    
                    // Apply filters to pixels
                    for (let i = 0; i < data.length; i += 4) {
                      let r = data[i], g = data[i + 1], b = data[i + 2];
                      
                      if (contrast !== 1.0) {
                        r = ((r - 128) * contrast) + 128;
                        g = ((g - 128) * contrast) + 128;
                        b = ((b - 128) * contrast) + 128;
                      }
                      
                      if (brightness !== 1.0) {
                        r *= brightness;
                        g *= brightness;
                        b *= brightness;
                      }
                      
                      if (saturation !== 1.0) {
                        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                        r = gray + (r - gray) * saturation;
                        g = gray + (g - gray) * saturation;
                        b = gray + (b - gray) * saturation;
                      }
                      
                      data[i] = Math.max(0, Math.min(255, r));
                      data[i + 1] = Math.max(0, Math.min(255, g));
                      data[i + 2] = Math.max(0, Math.min(255, b));
                    }
                    
                    ctx.putImageData(imageData, 0, 0);
                  } catch (e) { 
                  }
                }
                
                // Draw text overlays
                const textOverlayElements = document.querySelectorAll('[class^="text-overlay-"]');
                textOverlayElements.forEach(function(textElement) {
                  const rect = textElement.getBoundingClientRect();
                  const bodyRect = document.body.getBoundingClientRect();
                  
                  // Calculate the center position of the element in screen coordinates
                  const screenCenterX = rect.left + rect.width / 2;
                  const screenCenterY = rect.top + rect.height / 2;
                  
                  // Convert screen coordinates to canvas coordinates
                  const canvasX = (screenCenterX / bodyRect.width) * canvas.width;
                  const canvasY = (screenCenterY / bodyRect.height) * canvas.height;
                  
                  // Convert element dimensions to canvas coordinates
                  const canvasWidth = (rect.width / bodyRect.width) * canvas.width;
                  const canvasHeight = (rect.height / bodyRect.height) * canvas.height;
                  
                  ctx.save();
                  const computedStyle = window.getComputedStyle(textElement);
                  
                  // Draw background color if present
                  const backgroundColor = computedStyle.backgroundColor;
                  if (backgroundColor && backgroundColor !== 'transparent' && backgroundColor !== 'rgba(0, 0, 0, 0)') {
                    ctx.fillStyle = backgroundColor;
                    // Draw rounded rectangle background
                    const borderRadius = 4; // Match CSS border-radius: 4px
                    const x = canvasX - canvasWidth / 2;
                    const y = canvasY - canvasHeight / 2;
                    
                    ctx.beginPath();
                    ctx.moveTo(x + borderRadius, y);
                    ctx.lineTo(x + canvasWidth - borderRadius, y);
                    ctx.quadraticCurveTo(x + canvasWidth, y, x + canvasWidth, y + borderRadius);
                    ctx.lineTo(x + canvasWidth, y + canvasHeight - borderRadius);
                    ctx.quadraticCurveTo(x + canvasWidth, y + canvasHeight, x + canvasWidth - borderRadius, y + canvasHeight);
                    ctx.lineTo(x + borderRadius, y + canvasHeight);
                    ctx.quadraticCurveTo(x, y + canvasHeight, x, y + canvasHeight - borderRadius);
                    ctx.lineTo(x, y + borderRadius);
                    ctx.quadraticCurveTo(x, y, x + borderRadius, y);
                    ctx.closePath();
                    ctx.fill();
                  }
                  
                  // Draw text
                  ctx.font = computedStyle.font || '24px Poppins-Bold';
                  ctx.fillStyle = computedStyle.color || '#FFFFFF';
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  
                  // Handle text styles
                  if (computedStyle.textShadow) {
                    const shadowParts = computedStyle.textShadow.split(' ');
                    if (shadowParts.length >= 3) {
                      ctx.shadowOffsetX = parseInt(shadowParts[0]) || 0;
                      ctx.shadowOffsetY = parseInt(shadowParts[1]) || 0;
                      ctx.shadowBlur = parseInt(shadowParts[2]) || 0;
                      ctx.shadowColor = shadowParts[3] || 'rgba(0,0,0,0.8)';
                    }
                  }
                  
                  const text = textElement.textContent || textElement.innerText;
                  ctx.fillText(text, canvasX, canvasY);
                  ctx.restore();
                });
                
                // Draw image overlays
                const imageOverlays = document.querySelectorAll('[class^="image-overlay-"]');
                imageOverlays.forEach(function(overlayImg) {
                  if (overlayImg.complete && overlayImg.naturalWidth > 0) {
                    const rect = overlayImg.getBoundingClientRect();
                    const bodyRect = document.body.getBoundingClientRect();
                    const x = (rect.left / bodyRect.width) * canvas.width;
                    const y = (rect.top / bodyRect.height) * canvas.height;
                    const width = (rect.width / bodyRect.width) * canvas.width;
                    const height = (rect.height / bodyRect.height) * canvas.height;
                    
                    ctx.save();
                    ctx.translate(x + width / 2, y + height / 2);
                    const rotation = overlayImg.style.transform.match(/rotate\\(([\\d.]+)deg\\)/);
                    if (rotation) {
                      ctx.rotate(parseFloat(rotation[1]) * Math.PI / 180);
                    }
                    ctx.drawImage(overlayImg, -width / 2, -height / 2, width, height);
                    ctx.restore();
                  }
                });
                
                // Convert to data URL
                const dataURL = canvas.toDataURL('image/jpeg', 0.95);
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'captureSuccess',
                  data: dataURL
                }));
              } catch (error) {   
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'captureError',
                  message: error.message || 'Failed to capture image'
                }));
              }
            };
            
            if (img.complete && (img.naturalWidth > 0 || img.width > 0)) {
              captureImage();
            } else {
              img.onload = captureImage;
              setTimeout(function() {
                if (img.complete && (img.naturalWidth > 0 || img.width > 0)) {
                  captureImage();
                } else {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'captureError',
                    message: 'Image load timeout'
                  }));
                }
              }, 3000);
            }
          } catch (error) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'captureError',
              message: error.message || 'Failed to capture'
            }));
          }
        })();
        true;
      `;

      // Store resolve/reject in refs for the message handler
      captureResolveRef.current = resolve;
      captureRejectRef.current = reject;

      if (photoWebViewRef.current) {
        // Inject JavaScript to capture
        photoWebViewRef.current.injectJavaScript(captureScript);

        // Set up timeout
        setTimeout(() => {
          if (captureRejectRef.current) {
            captureRejectRef.current(new Error("Capture timeout"));
            captureResolveRef.current = null;
            captureRejectRef.current = null;
          }
        }, 10000);
      } else {
        reject(new Error("WebView ref not available"));
        captureResolveRef.current = null;
        captureRejectRef.current = null;
      }
    });
  }, [
    imageBase64,
    editedImage,
    photoForm.filter,
    textOverlays,
    imageOverlays,
    adjustments,
    getFilterCSS,
  ]);

  const submit = async () => {
    if (postType === "video") {
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

        // Process video with filter on server if filter is selected
        // IMPORTANT: Use Appwrite Functions if available, otherwise use separate server
        let processedVideo = finalVideo;
        
        // Determine if trim is needed
        // Only apply trim if video duration is known and trim values are set
        const needsTrim = videoDuration > 0 && (videoTrimStart > 0 || (videoTrimEnd > 0 && videoTrimEnd < videoDuration));
        const trimData = needsTrim && videoDuration > 0 ? { 
          start: videoTrimStart, 
          end: videoTrimEnd > 0 && videoTrimEnd <= videoDuration ? videoTrimEnd : videoDuration 
        } : null;
        const needsSpeed = videoSpeed !== 1.0;
        
        // Try processing if filter is not "none", music is provided, trim is set, or speed is set
        if (form.filter !== "none" || form.music || needsTrim || needsSpeed) {
          try {
            setProcessingMedia(true);
            setProcessingProgress(10);


            let processedResult = null;

            // Try Appwrite Functions first if available
            if (useAppwriteFunctions) {
              try {
                
                processedResult = await processVideoAuto({
                  video: form.video,
                  music: form.music || null,
                  filter: form.filter,
                  filterIntensity: 100,
                  musicVolume: 0.5,
                  trim: trimData,
                  videoSpeed: videoSpeed,
                });
                
              } catch (appwriteError) {
                // Fallback to separate server if Appwrite fails
                if (useProcessing) {
                  try {
                    processedResult = await processVideo({
                      video: form.video,
                      music: form.music || null,
                      filter: form.filter,
                      filterIntensity: 100,
                      musicVolume: 0.5,
                      trim: trimData,
                      videoSpeed: videoSpeed,
                    });
                  } catch (serverError) { 
                    throw appwriteError; // Throw original error
                  }
                } else {
                  // No fallback available - throw error
                  throw appwriteError;
                }
              }
            } 
            // Use separate server if Appwrite Functions not available
            else if (useProcessing) {
              processedResult = await processVideo({
                video: form.video,
                music: form.music || null,
                filter: form.filter,
                filterIntensity: 100,
                musicVolume: 0.5,
                trim: trimData,
                videoSpeed: videoSpeed,
              });
            } else {
            }
            

            setProcessingProgress(50);

            // Save processed video to file system
            if (processedResult && processedResult.base64) {
              const processedUri = `${FileSystem.documentDirectory}processed_video_${Date.now()}.mp4`;

              await FileSystem.writeAsStringAsync(
                processedUri,
                processedResult.base64,
                {
                  encoding: BASE64_ENCODING,
                }
              );

              // Get file info to get actual size
              const fileInfo = await FileSystem.getInfoAsync(processedUri);
              const fileSize = fileInfo.size || form.video.size;

              // Update to use processed video
              processedVideo = {
                uri: processedUri,
                name: "processed_video.mp4",
                type: "video/mp4",
                size: fileSize,
              };

            }

            setProcessingProgress(100);
            setProcessingMedia(false);
          } catch (processError) {
            setProcessingMedia(false);
            // Continue with original video - don't block upload
            processedVideo = finalVideo;
          }
        } else {
          // No processing needed - use original video
        }

        setProcessingProgress(0);

        try {
          if (isMuxUploadEnabled()) {
            await publishVideoWithMux(
              { ...form, userId: user.$id },
              processedVideo
            );
          } else {
            await createVideoPost({
              ...form,
              video: processedVideo,
              userId: user.$id,
            });
          }

          Alert.alert(t("common.success"), t("alerts.uploadSuccess"));
          router.push("/(tabs)/home");
        } catch (uploadError) {
          throw uploadError; // Re-throw to be caught by outer catch
        }
      } catch (error) {
        const errorMessage = error.message || error.toString();
        let userMessage = errorMessage;

        // Do not replace Mux/Appwrite/upload diagnostics with a generic "network" alert:
        // many SDK messages contain the word "network" while the real cause is elsewhere.
        const preserveDetailedError =
          errorMessage.includes("\n") ||
          errorMessage.length > 220 ||
          /mux|appwrite|createMux|video post|uploadUrl|execution|Invalid document|document structure|direct\.upload|Functions?/i.test(
            errorMessage
          );

        if (
          !preserveDetailedError &&
          (errorMessage.includes("Network") ||
            errorMessage.includes("network") ||
            errorMessage.includes("timeout") ||
            errorMessage.includes("Check your internet connection") ||
            errorMessage.includes("503") ||
            errorMessage.includes("client read error") ||
            errorMessage.includes("Service Unavailable"))
        ) {
          userMessage =
            "Network Error!\n\nPlease check your internet connection and try again.";
        } else if (
          errorMessage.includes("too large") ||
          errorMessage.includes("File is too large")
        ) {
          userMessage =
            "File Too Large!\n\nPlease select a smaller file or compress it.";
        } else if (errorMessage.includes("Server is temporarily unavailable")) {
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
        setVideoFilterCSS("none");
        setProcessedVideoUri(null); // Clear processed video
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
        let textOverlaysBakedIntoImage = false;
        let imageOverlaysBakedIntoImage = false;

        // Check if we need to merge text/overlays into the image
        const hasTextOverlays = textOverlays.length > 0;
        const hasImageOverlays = imageOverlays.length > 0;
        const needsCapture = hasTextOverlays || hasImageOverlays;

        // If we have text/overlays, capture the WebView content to merge everything
        if (needsCapture && imageBase64 && photoWebViewRef.current) {
          try {
            setProcessingMedia(true);
            setProcessingProgress(20);

            const capturedDataURL = await captureWebViewContent();

            if (capturedDataURL) {
              // Convert data URL to file
              const base64Data = capturedDataURL.replace(
                "data:image/jpeg;base64,",
                ""
              );
              const capturedUri = `${
                FileSystem.cacheDirectory
              }captured_photo_${Date.now()}.jpg`;

              await FileSystem.writeAsStringAsync(capturedUri, base64Data, {
                encoding: BASE64_ENCODING,
              });

              const fileInfo = await FileSystem.getInfoAsync(capturedUri);
              const fileSize =
                fileInfo.size ||
                base64Data.length * 0.75 ||
                photoForm.photo.size ||
                0;

              finalPhoto = {
                uri: capturedUri,
                name: `captured_${Date.now()}.jpg`,
                type: "image/jpeg",
                mimeType: "image/jpeg",
                size: fileSize,
              };

              // Mark that overlays were baked into the image
              textOverlaysBakedIntoImage = hasTextOverlays;
              imageOverlaysBakedIntoImage = hasImageOverlays;

              setProcessingProgress(60);
            }
          } catch (captureError) {
            // Continue with original photo if capture fails
          }
        }

        // Skip processing if media was already edited via MediaEditor (it already has all edits applied)
        // OR if we just captured the WebView (it already has all edits)
        // Process photo if filter/adjustments are applied AND media wasn't already edited AND we didn't capture
        if (
          !isMediaEdited &&
          !needsCapture &&
          (photoForm.filter !== "none" ||
            Object.keys(edits).length > 0 ||
            adjustments.brightness !== 0 ||
            adjustments.contrast !== 1 ||
            adjustments.saturation !== 1 ||
            adjustments.hue !== 0)
        ) {
          try {
            setProcessingMedia(true);
            setProcessingProgress(10);

            let processedPhoto = null;

            // Try server processing first if available
            if (useProcessing) {
              try {
                const processedResult = await processPhoto({
                  photo: photoForm.photo,
                  filter: photoForm.filter,
                  brightness: adjustments.brightness,
                  contrast: adjustments.contrast,
                  saturation: adjustments.saturation,
                });

                if (processedResult && processedResult.base64) {
                  const processedUri = `${
                    FileSystem.documentDirectory
                  }processed_photo_${Date.now()}.jpg`;
                  await FileSystem.writeAsStringAsync(
                    processedUri,
                    processedResult.base64,
                    {
                      encoding: BASE64_ENCODING,
                    }
                  );
                  processedPhoto = {
                    uri: processedUri,
                    name: "processed_photo.jpg",
                    type: "image/jpeg",
                    size: photoForm.photo.size,
                  };
                }
              } catch (serverError) {
              }
            }

            // Fallback to client-side processing using ImageManipulator
            if (!processedPhoto && photoForm.photo?.uri) {
              setProcessingProgress(30);

              try {
                let manipActions = [];

                // Apply adjustments using ImageManipulator
                if (
                  adjustments.brightness !== 0 ||
                  adjustments.contrast !== 1 ||
                  adjustments.saturation !== 1
                ) {
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
                      name: "processed_photo.jpg",
                      type: "image/jpeg",
                      size: photoForm.photo.size,
                    };
                  }
                }
              } catch (clientError) {
              }
            }

            setProcessingProgress(80);

            // Use processed photo if available, otherwise use original (filters will be applied via CSS on display)
            if (processedPhoto) {
              finalPhoto = processedPhoto;
            }

            setProcessingProgress(100);
            setProcessingMedia(false);
          } catch (processError) {
            setProcessingMedia(false);
            // Continue with original photo if processing fails (filters will be applied via CSS)
          }
        }

        setProcessingProgress(0);

        // Build edits object with text/overlays if any
        const finalEdits = {
          ...edits,
          adjustments: editedImage?.adjustments || adjustments,
        };

        // Include image overlays in edits only if not already baked into image
        if (imageOverlays.length > 0 && !isMediaEdited && !imageOverlaysBakedIntoImage) {
          finalEdits.imageOverlays = imageOverlays;
        }

        // Save textOverlays ONLY if they were NOT baked into the image during capture
        // If text overlays were baked into the image, don't save them in edits to avoid duplication
        if (textOverlays.length > 0 && !textOverlaysBakedIntoImage) {
          // Save textOverlays if filters/adjustments are applied (so they render on top)
          if (photoForm.filter !== 'none' || adjustments || editedImage?.adjustments) {
            // Compress textOverlays to save space
            finalEdits.t = textOverlays.map(overlay => ({
              txt: overlay.text,
              stl: {
                fs: overlay.style?.fontSize || 24,
                ff: overlay.style?.fontFamily || 'Poppins-Bold',
                c: overlay.style?.color || '#FFFFFF',
                bc: overlay.style?.backgroundColor || 'transparent',
                al: overlay.style?.alignment || 'center',
                ts: overlay.style?.textStyle || 'normal'
              },
              x: overlay.x || 50,
              y: overlay.y || 50,
              id: overlay.id || `text-${Date.now()}-${Math.random()}`
            }));
            // Also save adjustments in compressed format
            if (finalEdits.adjustments) {
              finalEdits.a = finalEdits.adjustments;
            }
            // Compress image overlays if they exist
            if (finalEdits.imageOverlays && finalEdits.imageOverlays.length > 0) {
              finalEdits.i = finalEdits.imageOverlays.map(overlay => ({
                u: overlay.uri,
                x: overlay.x,
                y: overlay.y,
                w: overlay.width,
                h: overlay.height,
                r: overlay.rotation || 0
              }));
              delete finalEdits.imageOverlays; // Remove uncompressed version
            }
          } else {
            // If no filters/adjustments, save in uncompressed format for backward compatibility
            finalEdits.textOverlays = textOverlays;
          }
        }

        await createPhotoPost({
          ...photoForm,
          photo: finalPhoto,
          userId: user.$id,
          edits: finalEdits,
        });

        // Clean up state before showing alert and navigating
        setProcessingMedia(false);
        setProcessingProgress(0);
        setUploading(false);

        Alert.alert(t("common.success"), "Photo uploaded successfully!");
        // Stay on create page - user can navigate manually if they want
      } catch (error) {
        const errorMessage = error.message || error.toString();
        let userMessage = errorMessage;

        const preserveDetailedError =
          errorMessage.includes("\n") ||
          errorMessage.length > 220 ||
          /mux|appwrite|photo post|Invalid document|document structure|Functions?/i.test(
            errorMessage
          );

        if (
          !preserveDetailedError &&
          (errorMessage.includes("Network") ||
            errorMessage.includes("network") ||
            errorMessage.includes("timeout") ||
            errorMessage.includes("Network request failed") ||
            errorMessage.includes("503") ||
            errorMessage.includes("client read error") ||
            errorMessage.includes("Service Unavailable"))
        ) {
          userMessage =
            "Network Error!\n\nPlease check your internet connection and try again.";
        } else if (
          errorMessage.includes("too large") ||
          errorMessage.includes("File is too large")
        ) {
          userMessage =
            "File Too Large!\n\nPlease select a smaller file or compress it.";
        } else if (errorMessage.includes("Server is temporarily unavailable")) {
          userMessage = "Server Busy!\n\nPlease wait a moment and try again.";
        } else if (
          !userMessage.includes("Network") &&
          !userMessage.includes("too large")
        ) {
          userMessage = errorMessage || "Failed to upload photo";
        }

        Alert.alert(t("common.error"), userMessage);
      } finally {
        // Clean up all state before navigation
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
        setIsMediaEdited(false);
        setTextOverlays([]);
        setImageOverlays([]);
        setProcessingMedia(false);
        setProcessingProgress(0);
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
                contentContainerStyle={{
                  paddingHorizontal: 16,
                  paddingVertical: 24,
                  gap: 24,
                  paddingBottom: 100,
                }}
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
                    flexDirection: "row",
                    borderRadius: 14,
                    padding: 4,
                    backgroundColor: themedColor(
                      "rgba(15,23,42,0.6)",
                      theme.surface
                    ),
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
                      backgroundColor:
                        postType === "video" ? theme.accentSoft : "transparent",
                    }}
                    onPress={() => setPostType("video")}
                  >
                    <Text
                      style={{
                        textAlign: "center",
                        fontFamily: "Poppins-Medium",
                        color:
                          postType === "video"
                            ? theme.textPrimary
                            : theme.textSecondary,
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
                      backgroundColor:
                        postType === "photo" ? theme.accentSoft : "transparent",
                    }}
                    onPress={() => setPostType("photo")}
                  >
                    <Text
                      style={{
                        textAlign: "center",
                        fontFamily: "Poppins-Medium",
                        color:
                          postType === "photo"
                            ? theme.textPrimary
                            : theme.textSecondary,
                      }}
                    >
                      Photo
                    </Text>
                  </TouchableOpacity>
                </View>

                {postType === "video" ? (
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

                      <View style={{ position: "relative" }}>
                        {form.video ? (
                          <View
                            style={{
                              width: "100%",
                              height: 256,
                              borderRadius: 16,
                              overflow: "hidden",
                            }}
                          >
                            {/* Change Video Button */}
                            <TouchableOpacity
                              onPress={() => openPicker("video")}
                              style={{
                                position: "absolute",
                                top: 10,
                                right: 10,
                                backgroundColor: "rgba(0,0,0,0.7)",
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                                borderRadius: 8,
                                zIndex: 10,
                              }}
                            >
                              <Text
                                style={{
                                  color: "#fff",
                                  fontSize: 12,
                                  fontWeight: "600",
                                }}
                              >
                                Change
                              </Text>
                            </TouchableOpacity>
                            {/* Use processed video if available, otherwise use original */}
                            <Video
                              key={processedVideoUri || form.video.uri}
                              ref={videoRef}
                              source={{ uri: processedVideoUri || form.video.uri }}
                                style={{ width: "100%", height: "100%" }}
                              useNativeControls
                              resizeMode={ResizeMode.COVER}
                              isLooping
                              rate={videoSpeed}
                              volume={videoVolume}
                              onLoad={(status) => {
                                if (status.isLoaded) {
                                  const duration =
                                    status.durationMillis / 1000;
                                  setVideoDuration(duration);
                                  if (videoTrimEnd === 0) {
                                    setVideoTrimEnd(duration);
                                  }
                                }
                              }}
                              onError={(error) => {
                                // Ignore seeking interrupted errors - they're harmless
                                if (
                                  error?.error?.includes?.(
                                    "Seeking interrupted"
                                  )
                                ) {
                                  return;
                                }
                                // Log other errors for debugging
                              }}
                            />
                            {/* Filter indicator */}
                            {form.filter !== "none" && (
                              <View
                                style={{
                                  position: "absolute",
                                  bottom: 10,
                                  left: 10,
                                  backgroundColor: "rgba(0,0,0,0.7)",
                                  paddingHorizontal: 12,
                                  paddingVertical: 6,
                                  borderRadius: 8,
                                }}
                              >
                                <Text
                                  style={{
                                    color: "#fff",
                                    fontSize: 12,
                                    fontWeight: "600",
                                  }}
                                >
                                  Filter: {FILTERS.find((f) => f.id === form.filter)?.name || form.filter}
                                </Text>
                              </View>
                            )}
                            {/* Indicators Row */}
                            <View
                              style={{
                                position: "absolute",
                                top: 10,
                                left: 10,
                                flexDirection: "row",
                                flexWrap: "wrap",
                                gap: 6,
                                maxWidth: "80%",
                              }}
                            >
                                {form.filter !== "none" && (
                                  <View
                                    style={{
                                      backgroundColor: "rgba(0,0,0,0.7)",
                                      paddingHorizontal: 12,
                                      paddingVertical: 6,
                                      borderRadius: 8,
                                    }}
                                  >
                                    <Text
                                      style={{
                                        color: "#fff",
                                        fontSize: 12,
                                        fontWeight: "600",
                                      }}
                                    >
                                      Filter:{" "}
                                      {FILTERS.find((f) => f.id === form.filter)
                                        ?.name || form.filter}
                                    </Text>
                                  </View>
                                )}
                                {Object.values(videoAdjustments).some(
                                  (val) => val !== 0
                                ) && (
                                  <View
                                    style={{
                                      backgroundColor: "rgba(0,0,0,0.7)",
                                      paddingHorizontal: 12,
                                      paddingVertical: 6,
                                      borderRadius: 8,
                                    }}
                                  >
                                    <Text
                                      style={{
                                        color: "#fff",
                                        fontSize: 12,
                                        fontWeight: "600",
                                      }}
                                    >
                                      ✨ Adjusted
                                    </Text>
                                  </View>
                                )}
                                {videoSpeed !== 1 && (
                                  <View
                                    style={{
                                      backgroundColor: "rgba(0,0,0,0.7)",
                                      paddingHorizontal: 12,
                                      paddingVertical: 6,
                                      borderRadius: 8,
                                    }}
                                  >
                                    <Text
                                      style={{
                                        color: "#fff",
                                        fontSize: 12,
                                        fontWeight: "600",
                                      }}
                                    >
                                      ⚡ {videoSpeed}x
                                    </Text>
                                  </View>
                                )}
                                {(videoTrimStart > 0 ||
                                  videoTrimEnd < videoDuration) && (
                                  <View
                                    style={{
                                      backgroundColor: "rgba(0,0,0,0.7)",
                                      paddingHorizontal: 12,
                                      paddingVertical: 6,
                                      borderRadius: 8,
                                    }}
                                  >
                                    <Text
                                      style={{
                                        color: "#fff",
                                        fontSize: 12,
                                        fontWeight: "600",
                                      }}
                                    >
                                      ✂️ Trimmed
                                    </Text>
                                  </View>
                                )}
                                {videoTextOverlays.length > 0 && (
                                  <View
                                    style={{
                                      backgroundColor: "rgba(0,0,0,0.7)",
                                      paddingHorizontal: 12,
                                      paddingVertical: 6,
                                      borderRadius: 8,
                                    }}
                                  >
                                    <Text
                                      style={{
                                        color: "#fff",
                                        fontSize: 12,
                                        fontWeight: "600",
                                      }}
                                    >
                                      📝 {videoTextOverlays.length} Text
                                    </Text>
                                  </View>
                                )}
                                {videoRotation !== 0 && (
                                  <View
                                    style={{
                                      backgroundColor: "rgba(0,0,0,0.7)",
                                      paddingHorizontal: 12,
                                      paddingVertical: 6,
                                      borderRadius: 8,
                                    }}
                                  >
                                    <Text
                                      style={{
                                        color: "#fff",
                                        fontSize: 12,
                                        fontWeight: "600",
                                      }}
                                    >
                                      🔄 {videoRotation}°
                                    </Text>
                                  </View>
                                )}
                              </View>
                              {form.music && (
                                <View
                                  style={{
                                    position: "absolute",
                                    top: 10,
                                    right: 10,
                                    backgroundColor: "rgba(0,0,0,0.7)",
                                    paddingHorizontal: 12,
                                    paddingVertical: 6,
                                    borderRadius: 8,
                                  }}
                                >
                                  <Text
                                    style={{
                                      color: "#fff",
                                      fontSize: 12,
                                      fontWeight: "600",
                                    }}
                                  >
                                    🎵 Music
                                  </Text>
                                </View>
                              )}
                            </View>
                          ) : (
                            <TouchableOpacity onPress={() => openPicker("video")}>
                              <View
                                style={{
                                  width: "100%",
                                  height: 180,
                                  paddingHorizontal: 16,
                                  borderRadius: 16,
                                  borderWidth: 1,
                                  borderColor: theme.border,
                                  backgroundColor: themedColor(
                                    "rgba(15,23,42,0.6)",
                                    theme.surface
                                  ),
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
                                  style={{
                                    width: 28,
                                    height: 28,
                                    tintColor: theme.accent,
                                  }}
                                />
                              </View>
                              <Text
                                style={{
                                  color: theme.textSecondary,
                                  marginTop: 12,
                                }}
                              >
                                Tap to select video
                              </Text>
                            </View>
                          </TouchableOpacity>
                        )}
                        {form.video && (
                          <TouchableOpacity
                            onPress={() => setForm({ ...form, video: null })}
                            style={{
                              position: "absolute",
                              top: 10,
                              right: 10,
                              backgroundColor: "rgba(255, 59, 48, 0.9)",
                              borderRadius: 20,
                              width: 36,
                              height: 36,
                              justifyContent: "center",
                              alignItems: "center",
                              zIndex: 10,
                            }}
                          >
                            <Text
                              style={{
                                color: "#fff",
                                fontSize: 20,
                                fontWeight: "bold",
                              }}
                            >
                              ×
                            </Text>
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

                        {/* Instagram-style Editing Tools */}
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={{
                            gap: 12,
                            paddingVertical: 4,
                          }}
                        >
                          <TouchableOpacity
                            onPress={() => setShowVideoAdjustModal(true)}
                            style={{
                              paddingVertical: 12,
                              paddingHorizontal: 16,
                              borderRadius: 12,
                              backgroundColor: themedColor(
                                "rgba(15,23,42,0.6)",
                                theme.surface
                              ),
                              borderWidth: 1,
                              borderColor: theme.border,
                              alignItems: "center",
                              justifyContent: "center",
                              minWidth: 80,
                            }}
                          >
                            <Feather
                              name="sliders"
                              size={20}
                              color={theme.textPrimary}
                            />
                            <Text
                              style={{
                                color: theme.textPrimary,
                                fontSize: 12,
                                fontFamily: "Poppins-Medium",
                                marginTop: 4,
                              }}
                            >
                              Adjust
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => setShowVideoFilterModal(true)}
                            style={{
                              paddingVertical: 12,
                              paddingHorizontal: 16,
                              borderRadius: 12,
                              backgroundColor: themedColor(
                                "rgba(15,23,42,0.6)",
                                theme.surface
                              ),
                              borderWidth: 1,
                              borderColor: theme.border,
                              alignItems: "center",
                              justifyContent: "center",
                              minWidth: 80,
                            }}
                          >
                            <Feather
                              name="image"
                              size={20}
                              color={theme.textPrimary}
                            />
                            <Text
                              style={{
                                color: theme.textPrimary,
                                fontSize: 12,
                                fontFamily: "Poppins-Medium",
                                marginTop: 4,
                              }}
                            >
                              {form.filter !== "none"
                                ? FILTERS.find((f) => f.id === form.filter)
                                    ?.name
                                : "Filters"}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => setShowTrimModal(true)}
                            style={{
                              paddingVertical: 12,
                              paddingHorizontal: 16,
                              borderRadius: 12,
                              backgroundColor: themedColor(
                                "rgba(15,23,42,0.6)",
                                theme.surface
                              ),
                              borderWidth: 1,
                              borderColor: theme.border,
                              alignItems: "center",
                              justifyContent: "center",
                              minWidth: 80,
                            }}
                          >
                            <Feather
                              name="scissors"
                              size={20}
                              color={theme.textPrimary}
                            />
                            <Text
                              style={{
                                color: theme.textPrimary,
                                fontSize: 12,
                                fontFamily: "Poppins-Medium",
                                marginTop: 4,
                              }}
                            >
                              Trim
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => setShowSpeedModal(true)}
                            style={{
                              paddingVertical: 12,
                              paddingHorizontal: 16,
                              borderRadius: 12,
                              backgroundColor: themedColor(
                                "rgba(15,23,42,0.6)",
                                theme.surface
                              ),
                              borderWidth: 1,
                              borderColor: theme.border,
                              alignItems: "center",
                              justifyContent: "center",
                              minWidth: 80,
                            }}
                          >
                            <Feather
                              name="zap"
                              size={20}
                              color={theme.textPrimary}
                            />
                            <Text
                              style={{
                                color: theme.textPrimary,
                                fontSize: 12,
                                fontFamily: "Poppins-Medium",
                                marginTop: 4,
                              }}
                            >
                              {videoSpeed !== 1 ? `${videoSpeed}x` : "Speed"}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => setShowCoverModal(true)}
                            style={{
                              paddingVertical: 12,
                              paddingHorizontal: 16,
                              borderRadius: 12,
                              backgroundColor: themedColor(
                                "rgba(15,23,42,0.6)",
                                theme.surface
                              ),
                              borderWidth: 1,
                              borderColor: theme.border,
                              alignItems: "center",
                              justifyContent: "center",
                              minWidth: 80,
                            }}
                          >
                            <Feather
                              name="image"
                              size={20}
                              color={theme.textPrimary}
                            />
                            <Text
                              style={{
                                color: theme.textPrimary,
                                fontSize: 12,
                                fontFamily: "Poppins-Medium",
                                marginTop: 4,
                              }}
                            >
                              Cover
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => setShowVolumeModal(true)}
                            style={{
                              paddingVertical: 12,
                              paddingHorizontal: 16,
                              borderRadius: 12,
                              backgroundColor: themedColor(
                                "rgba(15,23,42,0.6)",
                                theme.surface
                              ),
                              borderWidth: 1,
                              borderColor: theme.border,
                              alignItems: "center",
                              justifyContent: "center",
                              minWidth: 80,
                            }}
                          >
                            <Feather
                              name="volume-2"
                              size={20}
                              color={theme.textPrimary}
                            />
                            <Text
                              style={{
                                color: theme.textPrimary,
                                fontSize: 12,
                                fontFamily: "Poppins-Medium",
                                marginTop: 4,
                              }}
                            >
                              Volume
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => setShowVideoTextModal(true)}
                            style={{
                              paddingVertical: 12,
                              paddingHorizontal: 16,
                              borderRadius: 12,
                              backgroundColor: themedColor(
                                "rgba(15,23,42,0.6)",
                                theme.surface
                              ),
                              borderWidth: 1,
                              borderColor: theme.border,
                              alignItems: "center",
                              justifyContent: "center",
                              minWidth: 80,
                            }}
                          >
                            <Feather
                              name="type"
                              size={20}
                              color={theme.textPrimary}
                            />
                            <Text
                              style={{
                                color: theme.textPrimary,
                                fontSize: 12,
                                fontFamily: "Poppins-Medium",
                                marginTop: 4,
                              }}
                            >
                              Text
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => setShowCropModal(true)}
                            style={{
                              paddingVertical: 12,
                              paddingHorizontal: 16,
                              borderRadius: 12,
                              backgroundColor: themedColor(
                                "rgba(15,23,42,0.6)",
                                theme.surface
                              ),
                              borderWidth: 1,
                              borderColor: theme.border,
                              alignItems: "center",
                              justifyContent: "center",
                              minWidth: 80,
                            }}
                          >
                            <Feather
                              name="crop"
                              size={20}
                              color={theme.textPrimary}
                            />
                            <Text
                              style={{
                                color: theme.textPrimary,
                                fontSize: 12,
                                fontFamily: "Poppins-Medium",
                                marginTop: 4,
                              }}
                            >
                              Crop
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => setShowMusicModal(true)}
                            style={{
                              paddingVertical: 12,
                              paddingHorizontal: 16,
                              borderRadius: 12,
                              backgroundColor: themedColor(
                                "rgba(15,23,42,0.6)",
                                theme.surface
                              ),
                              borderWidth: 1,
                              borderColor: theme.border,
                              alignItems: "center",
                              justifyContent: "center",
                              minWidth: 80,
                            }}
                          >
                            <Feather
                              name="music"
                              size={20}
                              color={theme.textPrimary}
                            />
                            <Text
                              style={{
                                color: theme.textPrimary,
                                fontSize: 12,
                                fontFamily: "Poppins-Medium",
                                marginTop: 4,
                              }}
                            >
                              {form.music ? "Music" : "Music"}
                            </Text>
                          </TouchableOpacity>
                        </ScrollView>

                        {form.music && (
                          <TouchableOpacity
                            onPress={() => setForm({ ...form, music: null })}
                            style={{
                              padding: 8,
                              borderRadius: 8,
                              backgroundColor: "rgba(255, 59, 48, 0.1)",
                              borderWidth: 1,
                              borderColor: "rgba(255, 59, 48, 0.3)",
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <Text
                              style={{
                                color: theme.textPrimary,
                                fontSize: 12,
                                flex: 1,
                              }}
                            >
                              Music: {form.music.name}
                            </Text>
                            <Text
                              style={{
                                color: "#ff3b30",
                                fontSize: 16,
                                marginLeft: 8,
                              }}
                            >
                              ×
                            </Text>
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
                            scrollViewRef.current?.scrollToEnd({
                              animated: true,
                            });
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
                      handleChangeText={(e) =>
                        setPhotoForm({ ...photoForm, title: e })
                      }
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

                      {editedImage ? (
                        <View
                          style={{
                            position: "relative",
                            width: "100%",
                            height: 400,
                            borderRadius: 16,
                            overflow: "hidden",
                          }}
                        >
                          {/* Change Photo Button */}
                          <TouchableOpacity
                            onPress={() => openPicker("image")}
                            style={{
                              position: "absolute",
                              top: 10,
                              right: 50,
                              backgroundColor: "rgba(0,0,0,0.7)",
                              paddingHorizontal: 12,
                              paddingVertical: 8,
                              borderRadius: 8,
                              zIndex: 10,
                            }}
                          >
                            <Text
                              style={{
                                color: "#fff",
                                fontSize: 12,
                                fontWeight: "600",
                              }}
                            >
                              Change
                            </Text>
                          </TouchableOpacity>
                          {imageBase64 && webViewHTML ? (
                            <WebView
                              key={`photo-${
                                editedImage?.uri ||
                                originalImage?.uri ||
                                "none"
                              }-${imageUpdateKey}-${imageBase64.length}-${
                                photoForm.filter
                              }-${textOverlays.length}-${
                                imageOverlays.length
                              }`}
                              source={{ html: webViewHTML }}
                              style={{
                                width: "100%",
                                height: 600,
                                backgroundColor: "transparent",
                              }}
                              scrollEnabled={false}
                              showsVerticalScrollIndicator={false}
                              showsHorizontalScrollIndicator={false}
                              javaScriptEnabled={true}
                              ref={photoWebViewRef}
                              onMessage={(event) => {
                                try {
                                  const message = JSON.parse(
                                    event.nativeEvent.data
                                  );
                                  if (message.type === "textDrag") {
                                    setTextOverlays((prev) =>
                                      prev.map((overlay, index) =>
                                        overlay.id === message.id ||
                                        index === message.index
                                          ? {
                                              ...overlay,
                                              x: message.x,
                                              y: message.y,
                                            }
                                          : overlay
                                      )
                                    );
                                  } else if (
                                    message.type === "captureSuccess" &&
                                    captureResolveRef.current
                                  ) {
                                    // Handle WebView capture success
                                    const resolve = captureResolveRef.current;
                                    captureResolveRef.current = null;
                                    captureRejectRef.current = null;
                                    resolve(message.data);
                                  } else if (
                                    message.type === "captureError" &&
                                    captureRejectRef.current
                                  ) {
                                    // Handle WebView capture error
                                    const reject = captureRejectRef.current;
                                    captureResolveRef.current = null;
                                    captureRejectRef.current = null;
                                    reject(
                                      new Error(
                                        message.message || "Capture failed"
                                      )
                                    );
                                  }
                                } catch (error) {
                                 
                                }
                              }}
                            />
                          ) : (
                            <View
                              style={{
                                width: "100%",
                                height: 400,
                                justifyContent: "center",
                                alignItems: "center",
                                backgroundColor: theme.surface,
                              }}
                            >
                              <ActivityIndicator
                                size="large"
                                color={theme.accent}
                              />
                            </View>
                          )}
                          {/* Filter Indicator */}
                          {photoForm.filter &&
                            photoForm.filter !== "none" && (
                              <View
                                style={{
                                  position: "absolute",
                                  top: 10,
                                  left: 10,
                                  backgroundColor: "rgba(0,0,0,0.7)",
                                  paddingHorizontal: 12,
                                  paddingVertical: 6,
                                  borderRadius: 8,
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 8,
                                }}
                              >
                                <Text
                                  style={{
                                    color: "#fff",
                                    fontSize: 12,
                                    fontWeight: "600",
                                  }}
                                >
                                  Filter:{" "}
                                  {FILTERS.find(
                                    (f) => f.id === photoForm.filter
                                  )?.name || photoForm.filter}
                                </Text>
                                <TouchableOpacity
                                  onPress={() => {
                                    applyFilter("none");
                                  }}
                                >
                                  <Text
                                    style={{
                                      color: "#fff",
                                      fontSize: 16,
                                      fontWeight: "bold",
                                    }}
                                  >
                                    ×
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            )}

                          {/* Text Overlays Count Indicator */}
                          {textOverlays.length > 0 && (
                            <View
                              style={{
                                position: "absolute",
                                top: 10,
                                right: imageOverlays.length > 0 ? 120 : 50,
                                backgroundColor: "rgba(0,0,0,0.7)",
                                paddingHorizontal: 12,
                                paddingVertical: 6,
                                borderRadius: 8,
                              }}
                            >
                              <Text
                                style={{
                                  color: "#fff",
                                  fontSize: 12,
                                  fontWeight: "600",
                                }}
                              >
                                {textOverlays.length} Text
                                {textOverlays.length > 1 ? "s" : ""}
                              </Text>
                            </View>
                          )}

                          {/* Image Overlays Count Indicator */}
                          {imageOverlays.length > 0 && (
                            <View
                              style={{
                                position: "absolute",
                                top: 10,
                                right: 50,
                                backgroundColor: "rgba(0,0,0,0.7)",
                                paddingHorizontal: 12,
                                paddingVertical: 6,
                                borderRadius: 8,
                              }}
                            >
                              <Text
                                style={{
                                  color: "#fff",
                                  fontSize: 12,
                                  fontWeight: "600",
                                }}
                              >
                                {imageOverlays.length} Overlay
                                {imageOverlays.length > 1 ? "s" : ""}
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
                              setTextOverlays([]);
                              setImageOverlays([]);
                            }}
                            style={{
                              position: "absolute",
                              top: 10,
                              right: 10,
                              backgroundColor: "rgba(255, 59, 48, 0.9)",
                              borderRadius: 20,
                              width: 36,
                              height: 36,
                              justifyContent: "center",
                              alignItems: "center",
                              zIndex: 10,
                            }}
                          >
                            <Text
                              style={{
                                color: "#fff",
                                fontSize: 20,
                                fontWeight: "bold",
                              }}
                            >
                              ×
                            </Text>
                          </TouchableOpacity>
                            {/* Instagram-style action buttons */}
                            <View
                              style={{
                                position: "absolute",
                                bottom: 0,
                                left: 0,
                                right: 0,
                                paddingBottom: 16,
                                paddingHorizontal: 16,
                                paddingTop: 20,
                                backgroundColor: "transparent",
                              }}
                            >
                              <LinearGradient
                                colors={[
                                  "transparent",
                                  "rgba(0, 0, 0, 0.7)",
                                  "rgba(0, 0, 0, 0.85)",
                                ]}
                                style={{
                                  position: "absolute",
                                  bottom: 0,
                                  left: 0,
                                  right: 0,
                                  height: 120,
                                }}
                              />
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                }}
                              >
                                {/* Action buttons row */}
                                <View
                                  style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    flex: 1,
                                    marginRight: 12,
                                  }}
                                >
                                  {/* Audio Button */}
                                  <TouchableOpacity
                                    onPress={() => setShowMusicModal(true)}
                                    style={{
                                      width: 60,
                                      height: 60,
                                      borderRadius: 12,
                                      backgroundColor:
                                        "rgba(255, 255, 255, 0.15)",
                                      justifyContent: "center",
                                      alignItems: "center",
                                      marginRight: 4,
                                      paddingTop: 8,
                                      paddingBottom: 4,
                                    }}
                                    activeOpacity={0.8}
                                  >
                                    <Feather
                                      name="music"
                                      size={22}
                                      color="#FFFFFF"
                                    />
                                    <Text
                                      style={{
                                        color: "#FFFFFF",
                                        fontSize: 11,
                                        fontWeight: "500",
                                        fontFamily: "Poppins-Medium",
                                        marginTop: 2,
                                        textAlign: "center",
                                      }}
                                    >
                                      Audio
                                    </Text>
                                  </TouchableOpacity>

                                  {/* Text Button */}
                                  <TouchableOpacity
                                    onPress={() => {
                                      if (!editedImage) {
                                        Alert.alert(
                                          "No Photo",
                                          "Please select a photo first"
                                        );
                                        return;
                                      }
                                      setCurrentText("");
                                      setEditingTextId(null);
                                      setOriginalEditingOverlay(null);
                                      setCurrentTextStyle({
                                        fontSize: 24,
                                        fontFamily: "Poppins-Bold",
                                        color: "#FFFFFF",
                                        backgroundColor: "transparent",
                                        alignment: "center",
                                        textStyle: "normal",
                                      });
                                      setCurrentTextPosition({ x: 50, y: 50 });
                                      setShowTextModal(true);
                                    }}
                                    style={{
                                      width: 60,
                                      height: 60,
                                      borderRadius: 12,
                                      backgroundColor:
                                        "rgba(255, 255, 255, 0.15)",
                                      justifyContent: "center",
                                      alignItems: "center",
                                      marginRight: 4,
                                      paddingTop: 8,
                                      paddingBottom: 4,
                                    }}
                                    activeOpacity={0.8}
                                  >
                                    <Feather
                                      name="type"
                                      size={22}
                                      color="#FFFFFF"
                                    />
                                    <Text
                                      style={{
                                        color: "#FFFFFF",
                                        fontSize: 11,
                                        fontWeight: "500",
                                        fontFamily: "Poppins-Medium",
                                        marginTop: 2,
                                        textAlign: "center",
                                      }}
                                    >
                                      Text
                                    </Text>
                                  </TouchableOpacity>

                                  {/* Overlay Button */}
                                  <TouchableOpacity
                                    onPress={async () => {
                                      if (!editedImage) {
                                        Alert.alert(
                                          "No Photo",
                                          "Please select a photo first"
                                        );
                                        return;
                                      }

                                      // If there are overlays, show management modal
                                      if (imageOverlays.length > 0) {
                                        setShowOverlayModal(true);
                                        return;
                                      }

                                      // Otherwise, open image picker for new overlay
                                      try {
                                        const permission =
                                          await ImagePicker.requestMediaLibraryPermissionsAsync();
                                        if (!permission.granted) {
                                          Alert.alert(
                                            "Permission Required",
                                            "Please grant permission to access your photos"
                                          );
                                          return;
                                        }

                                        const result =
                                          await ImagePicker.launchImageLibraryAsync(
                                            {
                                              mediaTypes:
                                                ImagePicker.MediaTypeOptions
                                                  .Images,
                                              allowsEditing: false,
                                              quality: 0.8,
                                              exif: false,
                                            }
                                          );

                                        if (
                                          !result.canceled &&
                                          result.assets &&
                                          result.assets.length > 0
                                        ) {
                                          const selectedAsset =
                                            result.assets[0];

                                          // Convert image to base64 for WebView rendering
                                          try {
                                            const base64 =
                                              await FileSystem.readAsStringAsync(
                                                selectedAsset.uri,
                                                {
                                                  encoding: BASE64_ENCODING,
                                                }
                                              );

                                            const imageUri = `data:image/jpeg;base64,${base64}`;

                                            // Add overlay image to state
                                            const newOverlay = {
                                              id: Date.now().toString(),
                                              uri: imageUri,
                                              x: 50, // Center position (percentage)
                                              y: 50,
                                              width: 30, // Default width (percentage)
                                              height: 30, // Default height (percentage)
                                              rotation: 0,
                                            };

                                            setImageOverlays([
                                              ...imageOverlays,
                                              newOverlay,
                                            ]);
                                          } catch (error) {
                                            console.error(
                                              "Error processing overlay image:",
                                              error
                                            );
                                            Alert.alert(
                                              "Error",
                                              "Failed to process overlay image"
                                            );
                                          }
                                        }
                                      } catch (error) {
                                       
                                        Alert.alert(
                                          "Error",
                                          "Failed to pick overlay image"
                                        );
                                      }
                                    }}
                                    style={{
                                      width: 60,
                                      height: 60,
                                      borderRadius: 12,
                                      backgroundColor:
                                        imageOverlays.length > 0
                                          ? "rgba(255, 255, 255, 0.3)"
                                          : "rgba(255, 255, 255, 0.15)",
                                      justifyContent: "center",
                                      alignItems: "center",
                                      marginRight: 4,
                                      paddingTop: 8,
                                      paddingBottom: 4,
                                    }}
                                    activeOpacity={0.8}
                                  >
                                    <Feather
                                      name="grid"
                                      size={22}
                                      color="#FFFFFF"
                                    />
                                    <Text
                                      style={{
                                        color: "#FFFFFF",
                                        fontSize: 11,
                                        fontWeight: "500",
                                        fontFamily: "Poppins-Medium",
                                        marginTop: 2,
                                        textAlign: "center",
                                      }}
                                    >
                                      Overlay
                                    </Text>
                                  </TouchableOpacity>

                                  {/* Filter Button */}
                                  <TouchableOpacity
                                    onPress={() => setShowFilterModal(true)}
                                    style={{
                                      width: 60,
                                      height: 60,
                                      borderRadius: 12,
                                      backgroundColor:
                                        "rgba(255, 255, 255, 0.15)",
                                      justifyContent: "center",
                                      alignItems: "center",
                                      marginRight: 4,
                                      paddingTop: 8,
                                      paddingBottom: 4,
                                    }}
                                    activeOpacity={0.8}
                                  >
                                    <Feather
                                      name="sliders"
                                      size={22}
                                      color="#FFFFFF"
                                    />
                                    <Text
                                      style={{
                                        color: "#FFFFFF",
                                        fontSize: 11,
                                        fontWeight: "500",
                                        fontFamily: "Poppins-Medium",
                                        marginTop: 2,
                                        textAlign: "center",
                                      }}
                                    >
                                      Filter
                                    </Text>
                                  </TouchableOpacity>

                                  {/* Edit Button */}
                                  <TouchableOpacity
                                    onPress={() => {
                                      if (editedImage || photoForm.photo) {
                                        const photo =
                                          editedImage || photoForm.photo;
                                        setEditingPhotoUri(photo.uri);
                                        setShowPhotoEditor(true);
                                      } else {
                                        Alert.alert(
                                          "No Photo",
                                          "Please select a photo first"
                                        );
                                      }
                                    }}
                                    style={{
                                      width: 60,
                                      height: 60,
                                      borderRadius: 12,
                                      backgroundColor:
                                        "rgba(255, 255, 255, 0.15)",
                                      justifyContent: "center",
                                      alignItems: "center",
                                      marginRight: 4,
                                      paddingTop: 8,
                                      paddingBottom: 4,
                                    }}
                                    activeOpacity={0.8}
                                  >
                                    <Feather
                                      name="edit-2"
                                      size={22}
                                      color="#FFFFFF"
                                    />
                                    <Text
                                      style={{
                                        color: "#FFFFFF",
                                        fontSize: 11,
                                        fontWeight: "500",
                                        fontFamily: "Poppins-Medium",
                                        marginTop: 2,
                                        textAlign: "center",
                                      }}
                                    >
                                      Edit
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            </View>
                          </View>
                        ) : (
                          <TouchableOpacity onPress={() => openPicker("image")}>
                            <View
                              style={{
                                width: "100%",
                                height: 300,
                                paddingHorizontal: 16,
                                borderRadius: 16,
                                borderWidth: 1,
                                borderColor: theme.border,
                                backgroundColor: themedColor(
                                  "rgba(15,23,42,0.6)",
                                  theme.surface
                                ),
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
                                  style={{
                                    width: 28,
                                    height: 28,
                                    tintColor: theme.accent,
                                  }}
                                />
                              </View>
                              <Text
                                style={{
                                  color: theme.textSecondary,
                                  marginTop: 12,
                                }}
                              >
                                Tap to select photo
                              </Text>
                            </View>
                          </TouchableOpacity>
                        )}
                    </View>

                    <FormField
                      title="Caption (Optional)"
                      value={photoForm.caption}
                      placeholder="Add a caption..."
                      handleChangeText={(e) =>
                        setPhotoForm({ ...photoForm, caption: e })
                      }
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
                        handleChangeText={(e) =>
                          setPhotoForm({ ...photoForm, link: e })
                        }
                        onFocus={() => {
                          setTimeout(() => {
                            scrollViewRef.current?.scrollToEnd({
                              animated: true,
                            });
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
                      : postType === "video"
                      ? t("create.submitButton")
                      : "Post Photo"
                  }
                  handlePress={submit}
                  containerStyles="mt-6"
                  isLoading={uploading || processingMedia}
                  disabled={uploading || processingMedia}
                />

                {/* Processing Progress Indicator */}
                {processingMedia && (
                  <View
                    style={{
                      marginTop: 12,
                      padding: 12,
                      borderRadius: 8,
                      backgroundColor: themedColor(
                        "rgba(15,23,42,0.6)",
                        theme.surface
                      ),
                      borderWidth: 1,
                      borderColor: theme.border,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <ActivityIndicator size="small" color={theme.accent} />
                      <Text
                        style={{
                          color: theme.textPrimary,
                          fontSize: 14,
                          flex: 1,
                        }}
                      >
                        Processing {postType === "video" ? "video" : "photo"}{" "}
                        with filter and effects...
                      </Text>
                      <Text
                        style={{ color: theme.textSecondary, fontSize: 12 }}
                      >
                        {processingProgress}%
                      </Text>
                    </View>
                    <View
                      style={{
                        marginTop: 8,
                        height: 4,
                        backgroundColor: theme.border,
                        borderRadius: 2,
                        overflow: "hidden",
                      }}
                    >
                      <View
                        style={{
                          height: "100%",
                          width: `${processingProgress}%`,
                          backgroundColor: theme.accent,
                          borderRadius: 2,
                        }}
                      />
                    </View>
                  </View>
                )}

                {/* Processing Server Status Indicator */}
                {!useProcessing && (
                  <View
                    style={{
                      marginTop: 12,
                      padding: 8,
                      borderRadius: 8,
                      backgroundColor: themedColor(
                        "rgba(255,193,7,0.1)",
                        "rgba(255,193,7,0.1)"
                      ),
                      borderWidth: 1,
                      borderColor: themedColor(
                        "rgba(255,193,7,0.3)",
                        "rgba(255,193,7,0.3)"
                      ),
                    }}
                  >
                    <Text style={{ color: theme.textPrimary, fontSize: 14 }}></Text>
                  </View>
                )}
              </ScrollView>
            </KeyboardAvoidingView>

            {/* Instagram-style Filter Modal */}
            <Modal
              visible={showFilterModal}
              transparent={true}
              animationType="slide"
              onRequestClose={() => setShowFilterModal(false)}
            >
              <View
                style={{
                  flex: 1,
                  backgroundColor: "rgba(0,0,0,0.95)",
                }}
              >
                {/* Full-screen preview with selected filter */}
                {editedImage && imageBase64 ? (
                  <View style={{ flex: 1, backgroundColor: "#000" }}>
                    <WebView
                      key={`filter-preview-${photoForm.filter}`}
                      source={{
                        html: `
                          <!DOCTYPE html>
                          <html>
                            <head>
                              <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                              <style>
                                * {
                                  margin: 0;
                                  padding: 0;
                                  box-sizing: border-box;
                                }
                                html, body {
                                  width: 100%;
                                  height: 100%;
                                  overflow: hidden;
                                  background: #000;
                                }
                                body {
                                  display: flex;
                                  align-items: center;
                                  justify-content: center;
                                }
                                img {
                                  width: 100%;
                                  height: 100%;
                                  object-fit: cover;
                                  display: block;
                                  filter: ${(() => {
                                    // If image came from PhotoEditor, adjustments are already baked in
                                    if (
                                      editedImage?.adjustmentsAlreadyApplied ||
                                      editedImage?.fromPhotoEditor
                                    ) {
                                      return getFilterCSS(
                                        photoForm.filter,
                                        null
                                      );
                                    }
                                    return getFilterCSS(
                                      photoForm.filter,
                                      editedImage?.adjustments || adjustments
                                    );
                                  })()};
                                }
                              </style>
                            </head>
                            <body>
                              <img src="${imageBase64}" alt="Filtered Image" onerror="this.style.display='none';" />
                            </body>
                          </html>
                        `,
                      }}
                      style={{
                        flex: 1,
                        backgroundColor: "#000",
                      }}
                      scrollEnabled={false}
                      showsVerticalScrollIndicator={false}
                      showsHorizontalScrollIndicator={false}
                      bounces={false}
                      overScrollMode="never"
                      androidLayerType="hardware"
                      originWhitelist={["*"]}
                      javaScriptEnabled={true}
                    />
                  </View>
                ) : (
                  <View
                    style={{
                      flex: 1,
                      justifyContent: "center",
                      alignItems: "center",
                      backgroundColor: "#000",
                    }}
                  >
                    <Text style={{ color: "#fff" }}>No image selected</Text>
                  </View>
                )}

                {/* Bottom Filter Carousel */}
                <View
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    backgroundColor: "rgba(0, 0, 0, 0.85)",
                    borderTopLeftRadius: 20,
                    borderTopRightRadius: 20,
                    paddingTop: 12,
                    paddingBottom: 20,
                    maxHeight: 200,
                  }}
                >
                  {/* Action Bar */}
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingHorizontal: 16,
                      paddingBottom: 12,
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => setShowFilterModal(false)}
                      style={{ minWidth: 60 }}
                    >
                      <Text
                        style={{
                          color: "#FFFFFF",
                          fontSize: 16,
                          fontWeight: "600",
                          fontFamily: "Poppins-SemiBold",
                        }}
                      >
                        Cancel
                      </Text>
                    </TouchableOpacity>

                    <Text
                      style={{
                        color: "#FFFFFF",
                        fontSize: 16,
                        fontWeight: "600",
                        fontFamily: "Poppins-SemiBold",
                        position: "absolute",
                        left: 0,
                        right: 0,
                        textAlign: "center",
                      }}
                    >
                      Filter
                    </Text>

                    <TouchableOpacity
                      onPress={() => {
                        setShowFilterModal(false);
                      }}
                      style={{ minWidth: 60, alignItems: "flex-end" }}
                    >
                      <Text
                        style={{
                          color: "#FFFFFF",
                          fontSize: 16,
                          fontWeight: "600",
                          fontFamily: "Poppins-SemiBold",
                        }}
                      >
                        Done
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Filter Thumbnails Carousel */}
                  {editedImage && imageBase64 ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        alignItems: "center",
                      }}
                    >
                      {FILTERS.map((filter) => {
                        const filterCSS = getFilterCSS(filter.id, null);
                        const isSelected = photoForm.filter === filter.id;

                        return (
                          <TouchableOpacity
                            key={filter.id}
                            onPress={() =>
                              !processingImage && applyFilter(filter.id)
                            }
                            disabled={processingImage}
                            style={{
                              alignItems: "center",
                              marginRight: 12,
                              minWidth: 70,
                              opacity: processingImage ? 0.5 : 1,
                            }}
                          >
                            <View
                              style={{
                                width: 70,
                                height: 70,
                                borderRadius: 8,
                                overflow: "hidden",
                                borderWidth: isSelected ? 3 : 2,
                                borderColor: isSelected
                                  ? "#0095F6"
                                  : "transparent",
                                marginBottom: 6,
                                backgroundColor: "rgba(255, 255, 255, 0.1)",
                              }}
                            >
                              {filter.id === "none" || filterCSS === "none" ? (
                                <Image
                                  source={{
                                    uri: imageBase64.startsWith("data:")
                                      ? imageBase64
                                      : editedImage.uri,
                                  }}
                                  style={{ width: "100%", height: "100%" }}
                                  resizeMode="cover"
                                />
                              ) : (
                                <WebView
                                  key={`filter-thumb-${filter.id}`}
                                  source={{
                                    html: `
                                      <!DOCTYPE html>
                                      <html>
                                        <head>
                                          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                                          <style>
                                            * {
                                              margin: 0;
                                              padding: 0;
                                              box-sizing: border-box;
                                            }
                                            html, body {
                                              width: 100%;
                                              height: 100%;
                                              overflow: hidden;
                                              background: transparent;
                                            }
                                            img {
                                              width: 100%;
                                              height: 100%;
                                              object-fit: cover;
                                              display: block;
                                              filter: ${filterCSS};
                                            }
                                          </style>
                                        </head>
                                        <body>
                                          <img src="${imageBase64}" onerror="this.style.display='none';" />
                                        </body>
                                      </html>
                                    `,
                                  }}
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    backgroundColor: "transparent",
                                  }}
                                  scrollEnabled={false}
                                  showsVerticalScrollIndicator={false}
                                  showsHorizontalScrollIndicator={false}
                                  bounces={false}
                                  overScrollMode="never"
                                  androidLayerType="hardware"
                                  originWhitelist={["*"]}
                                  javaScriptEnabled={true}
                                  domStorageEnabled={true}
                                />
                              )}
                            </View>
                            <Text
                              style={{
                                color: isSelected ? "#0095F6" : "#FFFFFF",
                                fontSize: 12,
                                fontWeight: isSelected ? "600" : "400",
                                fontFamily: isSelected
                                  ? "Poppins-SemiBold"
                                  : "Poppins-Regular",
                                textAlign: "center",
                              }}
                            >
                              {filter.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  ) : (
                    <View style={{ paddingVertical: 20, alignItems: "center" }}>
                      <Text style={{ color: "#FFFFFF", fontSize: 14 }}>
                        Please select a photo first
                      </Text>
                    </View>
                  )}
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
              <View
                style={{
                  flex: 1,
                  backgroundColor: "rgba(0,0,0,0.8)",
                  justifyContent: "flex-end",
                }}
              >
                <View
                  style={{
                    backgroundColor: theme.surface,
                    borderTopLeftRadius: 20,
                    borderTopRightRadius: 20,
                    padding: 20,
                    maxHeight: "70%",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 20,
                    }}
                  >
                    <Text
                      style={{
                        color: theme.textPrimary,
                        fontSize: 20,
                        fontWeight: "bold",
                      }}
                    >
                      Adjustments
                    </Text>
                    {processingImage && (
                      <ActivityIndicator size="small" color={theme.accent} />
                    )}
                  </View>

                  <ScrollView
                    style={{ maxHeight: 400 }}
                    showsVerticalScrollIndicator={false}
                  >
                    <View style={{ gap: 24 }}>
                      {/* Brightness */}
                      <View>
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 12,
                          }}
                        >
                          <Text
                            style={{
                              color: theme.textPrimary,
                              fontSize: 16,
                              fontWeight: "600",
                            }}
                          >
                            Brightness
                          </Text>
                          <Text
                            style={{ color: theme.textSecondary, fontSize: 14 }}
                          >
                            {adjustments.brightness}
                          </Text>
                        </View>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 12,
                          }}
                        >
                          <TouchableOpacity
                            onPress={() =>
                              setAdjustments({
                                ...adjustments,
                                brightness: Math.max(
                                  -100,
                                  adjustments.brightness - 5
                                ),
                              })
                            }
                            style={{
                              padding: 10,
                              backgroundColor: theme.cardSoft,
                              borderRadius: 8,
                              minWidth: 44,
                              alignItems: "center",
                            }}
                          >
                            <Text
                              style={{
                                color: theme.textPrimary,
                                fontSize: 18,
                                fontWeight: "bold",
                              }}
                            >
                              −
                            </Text>
                          </TouchableOpacity>
                          <View
                            style={{
                              flex: 1,
                              height: 40,
                              justifyContent: "center",
                            }}
                          >
                            <View
                              style={{
                                height: 8,
                                backgroundColor: theme.border,
                                borderRadius: 4,
                                position: "relative",
                              }}
                            >
                              <View
                                style={{
                                  position: "absolute",
                                  left: `${
                                    ((adjustments.brightness + 100) / 200) * 100
                                  }%`,
                                  top: -6,
                                  width: 20,
                                  height: 20,
                                  borderRadius: 10,
                                  backgroundColor: theme.accent,
                                  borderWidth: 2,
                                  borderColor: "#fff",
                                }}
                              />
                            </View>
                          </View>
                          <TouchableOpacity
                            onPress={() =>
                              setAdjustments({
                                ...adjustments,
                                brightness: Math.min(
                                  100,
                                  adjustments.brightness + 5
                                ),
                              })
                            }
                            style={{
                              padding: 10,
                              backgroundColor: theme.cardSoft,
                              borderRadius: 8,
                              minWidth: 44,
                              alignItems: "center",
                            }}
                          >
                            <Text
                              style={{
                                color: theme.textPrimary,
                                fontSize: 18,
                                fontWeight: "bold",
                              }}
                            >
                              +
                            </Text>
                          </TouchableOpacity>
                        </View>
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            marginTop: 4,
                          }}
                        >
                          <Text
                            style={{ color: theme.textSecondary, fontSize: 12 }}
                          >
                            -100
                          </Text>
                          <Text
                            style={{ color: theme.textSecondary, fontSize: 12 }}
                          >
                            0
                          </Text>
                          <Text
                            style={{ color: theme.textSecondary, fontSize: 12 }}
                          >
                            100
                          </Text>
                        </View>
                      </View>

                      {/* Contrast */}
                      <View>
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 12,
                          }}
                        >
                          <Text
                            style={{
                              color: theme.textPrimary,
                              fontSize: 16,
                              fontWeight: "600",
                            }}
                          >
                            Contrast
                          </Text>
                          <Text
                            style={{ color: theme.textSecondary, fontSize: 14 }}
                          >
                            {adjustments.contrast.toFixed(1)}
                          </Text>
                        </View>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 12,
                          }}
                        >
                          <TouchableOpacity
                            onPress={() =>
                              setAdjustments({
                                ...adjustments,
                                contrast: Math.max(
                                  0,
                                  adjustments.contrast - 0.1
                                ),
                              })
                            }
                            style={{
                              padding: 10,
                              backgroundColor: theme.cardSoft,
                              borderRadius: 8,
                              minWidth: 44,
                              alignItems: "center",
                            }}
                          >
                            <Text
                              style={{
                                color: theme.textPrimary,
                                fontSize: 18,
                                fontWeight: "bold",
                              }}
                            >
                              −
                            </Text>
                          </TouchableOpacity>
                          <View
                            style={{
                              flex: 1,
                              height: 40,
                              justifyContent: "center",
                            }}
                          >
                            <View
                              style={{
                                height: 8,
                                backgroundColor: theme.border,
                                borderRadius: 4,
                                position: "relative",
                              }}
                            >
                              <View
                                style={{
                                  position: "absolute",
                                  left: `${(adjustments.contrast / 2) * 100}%`,
                                  top: -6,
                                  width: 20,
                                  height: 20,
                                  borderRadius: 10,
                                  backgroundColor: theme.accent,
                                  borderWidth: 2,
                                  borderColor: "#fff",
                                }}
                              />
                            </View>
                          </View>
                          <TouchableOpacity
                            onPress={() =>
                              setAdjustments({
                                ...adjustments,
                                contrast: Math.min(
                                  2,
                                  adjustments.contrast + 0.1
                                ),
                              })
                            }
                            style={{
                              padding: 10,
                              backgroundColor: theme.cardSoft,
                              borderRadius: 8,
                              minWidth: 44,
                              alignItems: "center",
                            }}
                          >
                            <Text
                              style={{
                                color: theme.textPrimary,
                                fontSize: 18,
                                fontWeight: "bold",
                              }}
                            >
                              +
                            </Text>
                          </TouchableOpacity>
                        </View>
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            marginTop: 4,
                          }}
                        >
                          <Text
                            style={{ color: theme.textSecondary, fontSize: 12 }}
                          >
                            0
                          </Text>
                          <Text
                            style={{ color: theme.textSecondary, fontSize: 12 }}
                          >
                            1
                          </Text>
                          <Text
                            style={{ color: theme.textSecondary, fontSize: 12 }}
                          >
                            2
                          </Text>
                        </View>
                      </View>

                      {/* Saturation */}
                      <View>
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 12,
                          }}
                        >
                          <Text
                            style={{
                              color: theme.textPrimary,
                              fontSize: 16,
                              fontWeight: "600",
                            }}
                          >
                            Saturation
                          </Text>
                          <Text
                            style={{ color: theme.textSecondary, fontSize: 14 }}
                          >
                            {adjustments.saturation.toFixed(1)}
                          </Text>
                        </View>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 12,
                          }}
                        >
                          <TouchableOpacity
                            onPress={() =>
                              setAdjustments({
                                ...adjustments,
                                saturation: Math.max(
                                  0,
                                  adjustments.saturation - 0.1
                                ),
                              })
                            }
                            style={{
                              padding: 10,
                              backgroundColor: theme.cardSoft,
                              borderRadius: 8,
                              minWidth: 44,
                              alignItems: "center",
                            }}
                          >
                            <Text
                              style={{
                                color: theme.textPrimary,
                                fontSize: 18,
                                fontWeight: "bold",
                              }}
                            >
                              −
                            </Text>
                          </TouchableOpacity>
                          <View
                            style={{
                              flex: 1,
                              height: 40,
                              justifyContent: "center",
                            }}
                          >
                            <View
                              style={{
                                height: 8,
                                backgroundColor: theme.border,
                                borderRadius: 4,
                                position: "relative",
                              }}
                            >
                              <View
                                style={{
                                  position: "absolute",
                                  left: `${
                                    (adjustments.saturation / 2) * 100
                                  }%`,
                                  top: -6,
                                  width: 20,
                                  height: 20,
                                  borderRadius: 10,
                                  backgroundColor: theme.accent,
                                  borderWidth: 2,
                                  borderColor: "#fff",
                                }}
                              />
                            </View>
                          </View>
                          <TouchableOpacity
                            onPress={() =>
                              setAdjustments({
                                ...adjustments,
                                saturation: Math.min(
                                  2,
                                  adjustments.saturation + 0.1
                                ),
                              })
                            }
                            style={{
                              padding: 10,
                              backgroundColor: theme.cardSoft,
                              borderRadius: 8,
                              minWidth: 44,
                              alignItems: "center",
                            }}
                          >
                            <Text
                              style={{
                                color: theme.textPrimary,
                                fontSize: 18,
                                fontWeight: "bold",
                              }}
                            >
                              +
                            </Text>
                          </TouchableOpacity>
                        </View>
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            marginTop: 4,
                          }}
                        >
                          <Text
                            style={{ color: theme.textSecondary, fontSize: 12 }}
                          >
                            0
                          </Text>
                          <Text
                            style={{ color: theme.textSecondary, fontSize: 12 }}
                          >
                            1
                          </Text>
                          <Text
                            style={{ color: theme.textSecondary, fontSize: 12 }}
                          >
                            2
                          </Text>
                        </View>
                      </View>
                    </View>
                  </ScrollView>

                  <View
                    style={{ flexDirection: "row", gap: 12, marginTop: 20 }}
                  >
                    <TouchableOpacity
                      onPress={applyAdjustments}
                      disabled={processingImage}
                      style={{
                        flex: 1,
                        backgroundColor: processingImage
                          ? theme.border
                          : theme.accent,
                        padding: 15,
                        borderRadius: 10,
                        alignItems: "center",
                        opacity: processingImage ? 0.6 : 1,
                      }}
                    >
                      {processingImage ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text
                          style={{
                            color: "#fff",
                            fontWeight: "bold",
                            fontSize: 16,
                          }}
                        >
                          Apply
                        </Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setAdjustments({
                          brightness: 0,
                          contrast: 1,
                          saturation: 1,
                          hue: 0,
                        });
                        resetEdits();
                        setShowAdjustModal(false);
                      }}
                      style={{
                        flex: 1,
                        backgroundColor: theme.cardSoft,
                        padding: 15,
                        borderRadius: 10,
                        alignItems: "center",
                        borderWidth: 1,
                        borderColor: theme.border,
                      }}
                    >
                      <Text
                        style={{
                          color: theme.textPrimary,
                          fontWeight: "bold",
                          fontSize: 16,
                        }}
                      >
                        Reset
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setShowAdjustModal(false)}
                      style={{
                        flex: 1,
                        backgroundColor: theme.cardSoft,
                        padding: 15,
                        borderRadius: 10,
                        alignItems: "center",
                        borderWidth: 1,
                        borderColor: theme.border,
                      }}
                    >
                      <Text
                        style={{
                          color: theme.textPrimary,
                          fontWeight: "bold",
                          fontSize: 16,
                        }}
                      >
                        Cancel
                      </Text>
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
              <View
                style={{
                  flex: 1,
                  backgroundColor: "rgba(0,0,0,0.8)",
                  justifyContent: "flex-end",
                }}
              >
                <View
                  style={{
                    backgroundColor: theme.surface,
                    borderTopLeftRadius: 20,
                    borderTopRightRadius: 20,
                    padding: 20,
                    maxHeight: "50%",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 20,
                    }}
                  >
                    <Text
                      style={{
                        color: theme.textPrimary,
                        fontSize: 20,
                        fontWeight: "bold",
                      }}
                    >
                      Add Music
                    </Text>
                  </View>

                  <Text
                    style={{
                      color: theme.textSecondary,
                      marginBottom: 20,
                      fontSize: 14,
                    }}
                  >
                    Select an audio file to add as background music to your
                    video. The music will be mixed with the video's original
                    audio.
                  </Text>

                  <TouchableOpacity
                    onPress={selectMusic}
                    style={{
                      backgroundColor: theme.accent,
                      padding: 15,
                      borderRadius: 10,
                      alignItems: "center",
                      marginBottom: 12,
                    }}
                  >
                    <Text
                      style={{
                        color: "#fff",
                        fontWeight: "bold",
                        fontSize: 16,
                      }}
                    >
                      Select Music File
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setShowMusicModal(false)}
                    style={{
                      backgroundColor: theme.cardSoft,
                      padding: 15,
                      borderRadius: 10,
                      alignItems: "center",
                      borderWidth: 1,
                      borderColor: theme.border,
                    }}
                  >
                    <Text
                      style={{
                        color: theme.textPrimary,
                        fontWeight: "bold",
                        fontSize: 16,
                      }}
                    >
                      Cancel
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>

            {/* Video Filter Modal - Instagram-style with thumbnails */}
            <Modal
              visible={showVideoFilterModal}
              transparent={true}
              animationType="slide"
              onRequestClose={() => setShowVideoFilterModal(false)}
            >
              <View
                style={{
                  flex: 1,
                  backgroundColor: "rgba(0,0,0,0.95)",
                }}
              >
                {/* Header */}
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingHorizontal: 16,
                    paddingTop: Platform.OS === "ios" ? 50 : 20,
                    paddingBottom: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: "rgba(255,255,255,0.1)",
                  }}
                >
                  <TouchableOpacity
                    onPress={() => setShowVideoFilterModal(false)}
                  >
                    <Text
                      style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}
                    >
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <Text
                    style={{ color: "#fff", fontSize: 18, fontWeight: "bold" }}
                  >
                    Filter
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowVideoFilterModal(false);
                    }}
                  >
                    <Text
                      style={{
                        color: "#0095F6",
                        fontSize: 16,
                        fontWeight: "600",
                      }}
                    >
                      Done
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Video Preview with Selected Filter */}
                {form.video && (
                  <View
                    style={{
                      flex: 1,
                      backgroundColor: "#000",
                      justifyContent: "center",
                      alignItems: "center",
                      position: "relative",
                    }}
                  >
                    {/* Use processed video if available (server-processed with filter), otherwise use original */}
                    <Video
                      key={processedVideoUri || form.video.uri}
                      ref={videoRef}
                      source={{ uri: processedVideoUri || form.video.uri }}
                      style={{
                        width: "100%",
                        height: "100%",
                      }}
                      resizeMode={ResizeMode.CONTAIN}
                      shouldPlay={true}
                      isLooping
                      muted
                      onLoad={(status) => {
                        if (status.isLoaded) {
                          const duration = status.durationMillis / 1000;
                          setVideoDuration(duration);
                          if (videoDuration === 0) {
                            const seekTime = Math.max(1, duration / 2);
                            safeSeek(seekTime * 1000);
                          }
                        }
                      }}
                      onError={(error) => {
                        if (!error?.error?.includes?.("Seeking interrupted")) {
                        }
                      }}
                    />
                    {/* Show processing indicator */}
                    {processingMedia && (
                      <View
                        style={{
                          position: "absolute",
                          top: "50%",
                          left: "50%",
                          transform: [{ translateX: -50 }, { translateY: -50 }],
                          backgroundColor: "rgba(0,0,0,0.7)",
                          padding: 16,
                          borderRadius: 8,
                        }}
                      >
                        <Text style={{ color: "#fff", fontSize: 14 }}>
                          Processing filter...
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Filter Thumbnails */}
                {form.video && (
                  <View
                    style={{
                      borderTopWidth: 1,
                      borderTopColor: "rgba(255,255,255,0.1)",
                      paddingVertical: 16,
                      paddingHorizontal: 16,
                      backgroundColor: "#000",
                    }}
                  >
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{
                        gap: 12,
                        paddingHorizontal: 4,
                      }}
                    >
                      {FILTERS.map((filter) => {
                        const filterCSS = getFilterCSS(filter.id, null);
                        const isSelected = form.filter === filter.id;

                        return (
                          <TouchableOpacity
                            key={filter.id}
                            onPress={() => applyVideoFilter(filter.id)}
                            style={{
                              alignItems: "center",
                              marginRight: 12,
                              minWidth: 70,
                            }}
                          >
                            <View
                              style={{
                                width: 70,
                                height: 70,
                                borderRadius: 8,
                                overflow: "hidden",
                                borderWidth: isSelected ? 3 : 2,
                                borderColor: isSelected
                                  ? "#0095F6"
                                  : "transparent",
                                marginBottom: 6,
                                backgroundColor: "rgba(255, 255, 255, 0.1)",
                                position: "relative",
                              }}
                            >
                              {/* Use native Video for thumbnails - filters shown via label */}
                              <Video
                                source={{ uri: form.video.uri }}
                                style={{
                                  width: "100%",
                                  height: "100%",
                                }}
                                resizeMode={ResizeMode.COVER}
                                shouldPlay={false}
                                muted
                              />
                              {/* Filter overlay indicator */}
                              {filter.id !== "none" && filterCSS !== "none" && (
                                <View
                                  style={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    backgroundColor: "rgba(0,0,0,0.3)",
                                    justifyContent: "center",
                                    alignItems: "center",
                                  }}
                                >
                                  <Text
                                    style={{
                                      color: "#fff",
                                      fontSize: 10,
                                      fontWeight: "600",
                                    }}
                                  >
                                    {filter.name}
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Text
                              style={{
                                color: isSelected ? "#0095F6" : "#FFFFFF",
                                fontSize: 12,
                                fontWeight: isSelected ? "600" : "400",
                                fontFamily: isSelected
                                  ? "Poppins-SemiBold"
                                  : "Poppins-Regular",
                                textAlign: "center",
                              }}
                            >
                              {filter.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>
            </Modal>

            {/* Video Adjustments Modal - Instagram-style */}
            <Modal
              visible={showVideoAdjustModal}
              transparent={true}
              animationType="slide"
              onRequestClose={() => setShowVideoAdjustModal(false)}
            >
              <View
                style={{
                  flex: 1,
                  backgroundColor: "rgba(0,0,0,0.95)",
                }}
              >
                {/* Header */}
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingHorizontal: 16,
                    paddingTop: Platform.OS === "ios" ? 50 : 20,
                    paddingBottom: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: "rgba(255,255,255,0.1)",
                  }}
                >
                  <TouchableOpacity
                    onPress={() => setShowVideoAdjustModal(false)}
                  >
                    <Text
                      style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}
                    >
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <Text
                    style={{ color: "#fff", fontSize: 18, fontWeight: "bold" }}
                  >
                    Adjust
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      // Reset all adjustments
                      setVideoAdjustments({
                        brightness: 0,
                        contrast: 0,
                        saturation: 0,
                        warmth: 0,
                        lux: 0,
                        fade: 0,
                        highlights: 0,
                        shadows: 0,
                        structure: 0,
                      });
                      setSelectedVideoTool(null);
                    }}
                  >
                    <Text
                      style={{
                        color: "#007AFF",
                        fontSize: 16,
                        fontWeight: "600",
                      }}
                    >
                      Reset
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Video Preview */}
                <View
                  style={{
                    flex: 1,
                    backgroundColor: "#000",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  {form.video && (
                    <Video
                      source={{ uri: form.video.uri }}
                      style={{ width: "100%", height: "100%" }}
                      resizeMode={ResizeMode.CONTAIN}
                      shouldPlay={false}
                      isLooping={false}
                    />
                  )}
                </View>

                {/* Tools Selection */}
                {!selectedVideoTool && (
                  <View
                    style={{
                      borderTopWidth: 1,
                      borderTopColor: "rgba(255,255,255,0.1)",
                      paddingVertical: 12,
                    }}
                  >
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ paddingHorizontal: 16, gap: 16 }}
                    >
                      {[
                        { id: "brightness", name: "Brightness", icon: "sun" },
                        { id: "contrast", name: "Contrast", icon: "layers" },
                        {
                          id: "saturation",
                          name: "Saturation",
                          icon: "droplet",
                        },
                        { id: "warmth", name: "Warmth", icon: "thermometer" },
                        { id: "lux", name: "Lux", icon: "sun" },
                        { id: "fade", name: "Fade", icon: "minus-circle" },
                        {
                          id: "highlights",
                          name: "Highlights",
                          icon: "circle",
                        },
                        { id: "shadows", name: "Shadows", icon: "moon" },
                        { id: "structure", name: "Structure", icon: "grid" },
                      ].map((tool) => (
                        <TouchableOpacity
                          key={tool.id}
                          onPress={() => setSelectedVideoTool(tool.id)}
                          style={{
                            alignItems: "center",
                            justifyContent: "center",
                            width: 70,
                            gap: 8,
                          }}
                        >
                          <Feather name={tool.icon} size={24} color="#fff" />
                          <Text
                            style={{
                              color: "#fff",
                              fontSize: 12,
                              fontWeight: "500",
                            }}
                          >
                            {tool.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* Slider for selected tool */}
                {selectedVideoTool && (
                  <View
                    style={{
                      borderTopWidth: 1,
                      borderTopColor: "rgba(255,255,255,0.1)",
                      paddingVertical: 20,
                      paddingHorizontal: 16,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 20,
                      }}
                    >
                      <TouchableOpacity
                        onPress={() => setSelectedVideoTool(null)}
                      >
                        <Feather name="chevron-left" size={24} color="#fff" />
                      </TouchableOpacity>
                      <Text
                        style={{
                          color: "#fff",
                          fontSize: 18,
                          fontWeight: "bold",
                        }}
                      >
                        {
                          [
                            { id: "brightness", name: "Brightness" },
                            { id: "contrast", name: "Contrast" },
                            { id: "saturation", name: "Saturation" },
                            { id: "warmth", name: "Warmth" },
                            { id: "lux", name: "Lux" },
                            { id: "fade", name: "Fade" },
                            { id: "highlights", name: "Highlights" },
                            { id: "shadows", name: "Shadows" },
                            { id: "structure", name: "Structure" },
                          ].find((t) => t.id === selectedVideoTool)?.name
                        }
                      </Text>
                      <TouchableOpacity
                        onPress={() => {
                          setVideoAdjustments((prev) => ({
                            ...prev,
                            [selectedVideoTool]: 0,
                          }));
                        }}
                      >
                        <Text
                          style={{
                            color: "#007AFF",
                            fontSize: 16,
                            fontWeight: "600",
                          }}
                        >
                          Reset
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <Slider
                      style={{ width: "100%", height: 40 }}
                      minimumValue={-100}
                      maximumValue={100}
                      value={videoAdjustments[selectedVideoTool] || 0}
                      onValueChange={(value) => {
                        setVideoAdjustments((prev) => ({
                          ...prev,
                          [selectedVideoTool]: Math.round(value),
                        }));
                      }}
                      minimumTrackTintColor="#fff"
                      maximumTrackTintColor="rgba(255,255,255,0.3)"
                      thumbTintColor="#fff"
                    />
                    <Text
                      style={{
                        color: "#fff",
                        fontSize: 16,
                        fontWeight: "600",
                        textAlign: "center",
                        marginTop: 8,
                      }}
                    >
                      {videoAdjustments[selectedVideoTool] || 0}
                    </Text>
                  </View>
                )}
              </View>
            </Modal>

            {/* Video Trim Modal */}
            <Modal
              visible={showTrimModal}
              transparent={true}
              animationType="slide"
              onRequestClose={() => setShowTrimModal(false)}
            >
              <View
                style={{
                  flex: 1,
                  backgroundColor: "rgba(0,0,0,0.95)",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingHorizontal: 16,
                    paddingTop: Platform.OS === "ios" ? 50 : 20,
                    paddingBottom: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: "rgba(255,255,255,0.1)",
                  }}
                >
                  <TouchableOpacity onPress={() => setShowTrimModal(false)}>
                    <Text
                      style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}
                    >
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <Text
                    style={{ color: "#fff", fontSize: 18, fontWeight: "bold" }}
                  >
                    Trim Video
                  </Text>
                  <TouchableOpacity
                    onPress={async () => {
                      // Keep current trim values and apply them
                      await applyVideoTrimAndSpeed();
                      setShowTrimModal(false);
                    }}
                  >
                    <Text
                      style={{
                        color: "#007AFF",
                        fontSize: 16,
                        fontWeight: "600",
                      }}
                    >
                      Done
                    </Text>
                  </TouchableOpacity>
                </View>

                <View
                  style={{
                    flex: 1,
                    justifyContent: "center",
                    alignItems: "center",
                    padding: 20,
                  }}
                >
                  {form.video && (
                    <Video
                      ref={videoRef}
                      source={{ uri: form.video.uri }}
                      style={{ width: "100%", height: 300 }}
                      resizeMode={ResizeMode.CONTAIN}
                      shouldPlay={false}
                      onLoad={(status) => {
                        if (status.isLoaded) {
                          const duration = status.durationMillis / 1000;
                          setVideoDuration(duration);
                          setVideoTrimEnd(duration);
                        }
                      }}
                    />
                  )}

                  <View
                    style={{
                      width: "100%",
                      marginTop: 30,
                      paddingHorizontal: 20,
                    }}
                  >
                    <Text
                      style={{ color: "#fff", fontSize: 14, marginBottom: 10 }}
                    >
                      Start: {Math.floor(videoTrimStart)}s
                    </Text>
                    <Slider
                      style={{ width: "100%", height: 40 }}
                      minimumValue={0}
                      maximumValue={videoDuration}
                      value={videoTrimStart}
                      onValueChange={(value) => {
                        setVideoTrimStart(value);
                      }}
                      onSlidingComplete={async (value) => {
                        // Only seek when user stops dragging
                        if (videoRef.current) {
                          try {
                            await videoRef.current.setPositionAsync(
                              value * 1000
                            );
                          } catch (error) {
                            // Ignore seeking errors
                          }
                        }
                      }}
                      minimumTrackTintColor="#007AFF"
                      maximumTrackTintColor="rgba(255,255,255,0.3)"
                      thumbTintColor="#007AFF"
                    />

                    <Text
                      style={{
                        color: "#fff",
                        fontSize: 14,
                        marginTop: 20,
                        marginBottom: 10,
                      }}
                    >
                      End: {Math.floor(videoTrimEnd)}s
                    </Text>
                    <Slider
                      style={{ width: "100%", height: 40 }}
                      minimumValue={0}
                      maximumValue={videoDuration}
                      value={videoTrimEnd}
                      onValueChange={(value) => {
                        if (value > videoTrimStart) {
                          setVideoTrimEnd(value);
                        }
                      }}
                      onSlidingComplete={(value) => {
                        // Preview end position
                        if (value > videoTrimStart) {
                          safeSeek(value * 1000);
                        }
                      }}
                      minimumTrackTintColor="#007AFF"
                      maximumTrackTintColor="rgba(255,255,255,0.3)"
                      thumbTintColor="#007AFF"
                    />

                    <Text
                      style={{
                        color: "#fff",
                        fontSize: 12,
                        marginTop: 20,
                        textAlign: "center",
                      }}
                    >
                      Duration: {Math.floor(videoTrimEnd - videoTrimStart)}s
                    </Text>
                  </View>
                </View>
              </View>
            </Modal>

            {/* Video Speed Modal */}
            <Modal
              visible={showSpeedModal}
              transparent={true}
              animationType="slide"
              onRequestClose={() => setShowSpeedModal(false)}
            >
              <View
                style={{
                  flex: 1,
                  backgroundColor: "rgba(0,0,0,0.95)",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingHorizontal: 16,
                    paddingTop: Platform.OS === "ios" ? 50 : 20,
                    paddingBottom: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: "rgba(255,255,255,0.1)",
                  }}
                >
                  <TouchableOpacity onPress={() => setShowSpeedModal(false)}>
                    <Text
                      style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}
                    >
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <Text
                    style={{ color: "#fff", fontSize: 18, fontWeight: "bold" }}
                  >
                    Speed
                  </Text>
                  <TouchableOpacity
                    onPress={async () => {
                      // Apply speed changes and close modal
                      await applyVideoTrimAndSpeed();
                      setShowSpeedModal(false);
                    }}
                  >
                    <Text
                      style={{
                        color: "#007AFF",
                        fontSize: 16,
                        fontWeight: "600",
                      }}
                    >
                      Done
                    </Text>
                  </TouchableOpacity>
                </View>

                <View
                  style={{
                    flex: 1,
                    justifyContent: "center",
                    alignItems: "center",
                    padding: 20,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 12,
                      flexWrap: "wrap",
                      justifyContent: "center",
                    }}
                  >
                    {[0.3, 0.5, 1, 2, 3].map((speed) => (
                      <TouchableOpacity
                        key={speed}
                        onPress={() => setVideoSpeed(speed)}
                        style={{
                          paddingVertical: 16,
                          paddingHorizontal: 24,
                          borderRadius: 12,
                          backgroundColor:
                            videoSpeed === speed
                              ? "#007AFF"
                              : "rgba(255,255,255,0.1)",
                          minWidth: 80,
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            color: "#fff",
                            fontSize: 18,
                            fontWeight: "bold",
                          }}
                        >
                          {speed}x
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text
                    style={{
                      color: "#fff",
                      fontSize: 16,
                      marginTop: 30,
                      fontWeight: "600",
                    }}
                  >
                    Selected: {videoSpeed}x
                  </Text>
                </View>
              </View>
            </Modal>

            {/* Video Cover/Thumbnail Modal */}
            <Modal
              visible={showCoverModal}
              transparent={true}
              animationType="slide"
              onRequestClose={() => setShowCoverModal(false)}
            >
              <View
                style={{
                  flex: 1,
                  backgroundColor: "rgba(0,0,0,0.95)",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingHorizontal: 16,
                    paddingTop: Platform.OS === "ios" ? 50 : 20,
                    paddingBottom: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: "rgba(255,255,255,0.1)",
                  }}
                >
                  <TouchableOpacity onPress={() => setShowCoverModal(false)}>
                    <Text
                      style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}
                    >
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <Text
                    style={{ color: "#fff", fontSize: 18, fontWeight: "bold" }}
                  >
                    Select Cover
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowCoverModal(false);
                    }}
                  >
                    <Text
                      style={{
                        color: "#007AFF",
                        fontSize: 16,
                        fontWeight: "600",
                      }}
                    >
                      Done
                    </Text>
                  </TouchableOpacity>
                </View>

                <View
                  style={{
                    flex: 1,
                    justifyContent: "center",
                    alignItems: "center",
                    padding: 20,
                  }}
                >
                  {form.video && (
                    <Video
                      ref={videoRef}
                      source={{ uri: form.video.uri }}
                      style={{ width: "100%", height: 400 }}
                      resizeMode={ResizeMode.CONTAIN}
                      shouldPlay={false}
                      onLoad={(status) => {
                        if (status.isLoaded) {
                          const duration = status.durationMillis / 1000;
                          setVideoDuration(duration);
                          setVideoCoverTime(duration / 2);
                        }
                      }}
                      onError={(error) => {
                        // Ignore seeking interrupted errors
                        if (error?.error?.includes?.("Seeking interrupted")) {
                          return;
                        }
                      }}
                    />
                  )}

                  <View
                    style={{
                      width: "100%",
                      marginTop: 30,
                      paddingHorizontal: 20,
                    }}
                  >
                    <Text
                      style={{
                        color: "#fff",
                        fontSize: 14,
                        marginBottom: 10,
                        textAlign: "center",
                      }}
                    >
                      {Math.floor(videoCoverTime)}s /{" "}
                      {Math.floor(videoDuration)}s
                    </Text>
                    <Slider
                      style={{ width: "100%", height: 40 }}
                      minimumValue={0}
                      maximumValue={videoDuration}
                      value={videoCoverTime}
                      onValueChange={(value) => {
                        setVideoCoverTime(value);
                      }}
                      onSlidingComplete={(value) => {
                        // Only seek when user stops dragging
                        safeSeek(value * 1000);
                      }}
                      minimumTrackTintColor="#007AFF"
                      maximumTrackTintColor="rgba(255,255,255,0.3)"
                      thumbTintColor="#007AFF"
                    />
                    <TouchableOpacity
                      onPress={async () => {
                        if (videoRef.current) {
                          try {
                            await safeSeek(videoCoverTime * 1000);
                            await videoRef.current.playAsync();
                            setTimeout(async () => {
                              try {
                                await videoRef.current?.pauseAsync();
                              } catch (error) {
                                // Ignore pause errors
                              }
                            }, 200);
                          } catch (error) {
                            // Ignore preview errors
                          }
                        }
                      }}
                      style={{
                        marginTop: 20,
                        backgroundColor: "#007AFF",
                        padding: 12,
                        borderRadius: 8,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: "#fff",
                          fontSize: 16,
                          fontWeight: "600",
                        }}
                      >
                        Preview Frame
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>

            {/* Video Volume Modal */}
            <Modal
              visible={showVolumeModal}
              transparent={true}
              animationType="slide"
              onRequestClose={() => setShowVolumeModal(false)}
            >
              <View
                style={{
                  flex: 1,
                  backgroundColor: "rgba(0,0,0,0.95)",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingHorizontal: 16,
                    paddingTop: Platform.OS === "ios" ? 50 : 20,
                    paddingBottom: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: "rgba(255,255,255,0.1)",
                  }}
                >
                  <TouchableOpacity onPress={() => setShowVolumeModal(false)}>
                    <Text
                      style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}
                    >
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <Text
                    style={{ color: "#fff", fontSize: 18, fontWeight: "bold" }}
                  >
                    Volume
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setVideoVolume(1.0);
                      setShowVolumeModal(false);
                    }}
                  >
                    <Text
                      style={{
                        color: "#007AFF",
                        fontSize: 16,
                        fontWeight: "600",
                      }}
                    >
                      Reset
                    </Text>
                  </TouchableOpacity>
                </View>

                <View
                  style={{
                    flex: 1,
                    justifyContent: "center",
                    alignItems: "center",
                    padding: 20,
                  }}
                >
                  <Feather
                    name={
                      videoVolume === 0
                        ? "volume-x"
                        : videoVolume < 0.5
                        ? "volume-1"
                        : "volume-2"
                    }
                    size={60}
                    color="#fff"
                  />

                  <View
                    style={{
                      width: "100%",
                      marginTop: 40,
                      paddingHorizontal: 20,
                    }}
                  >
                    <Text
                      style={{
                        color: "#fff",
                        fontSize: 16,
                        marginBottom: 20,
                        textAlign: "center",
                      }}
                    >
                      {Math.round(videoVolume * 100)}%
                    </Text>
                    <Slider
                      style={{ width: "100%", height: 40 }}
                      minimumValue={0}
                      maximumValue={1}
                      value={videoVolume}
                      onValueChange={setVideoVolume}
                      minimumTrackTintColor="#007AFF"
                      maximumTrackTintColor="rgba(255,255,255,0.3)"
                      thumbTintColor="#007AFF"
                    />
                  </View>
                </View>
              </View>
            </Modal>

            {/* Video Text Overlay Modal */}
            <Modal
              visible={showVideoTextModal}
              transparent={true}
              animationType="slide"
              onRequestClose={() => setShowVideoTextModal(false)}
            >
              <View
                style={{
                  flex: 1,
                  backgroundColor: "rgba(0,0,0,0.95)",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingHorizontal: 16,
                    paddingTop: Platform.OS === "ios" ? 50 : 20,
                    paddingBottom: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: "rgba(255,255,255,0.1)",
                  }}
                >
                  <TouchableOpacity
                    onPress={() => {
                      setShowVideoTextModal(false);
                      setCurrentVideoText("");
                    }}
                  >
                    <Text
                      style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}
                    >
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <Text
                    style={{ color: "#fff", fontSize: 18, fontWeight: "bold" }}
                  >
                    Add Text
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      if (currentVideoText.trim()) {
                        setVideoTextOverlays([
                          ...videoTextOverlays,
                          {
                            id: Date.now(),
                            text: currentVideoText,
                            x: 50,
                            y: 50,
                            style: { ...currentTextStyle },
                          },
                        ]);
                        setCurrentVideoText("");
                      }
                    }}
                  >
                    <Text
                      style={{
                        color: "#007AFF",
                        fontSize: 16,
                        fontWeight: "600",
                      }}
                    >
                      Add
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={{ flex: 1, padding: 20 }}>
                  <TextInput
                    placeholder="Enter text..."
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    value={currentVideoText}
                    onChangeText={setCurrentVideoText}
                    style={{
                      backgroundColor: "rgba(255,255,255,0.1)",
                      borderRadius: 12,
                      padding: 16,
                      color: "#fff",
                      fontSize: 16,
                      marginBottom: 20,
                    }}
                    multiline
                  />

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginBottom: 20 }}
                  >
                    <View style={{ flexDirection: "row", gap: 12 }}>
                      {TEXT_COLORS.slice(0, 10).map((color) => (
                        <TouchableOpacity
                          key={color}
                          onPress={() =>
                            setCurrentTextStyle({ ...currentTextStyle, color })
                          }
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 20,
                            backgroundColor: color,
                            borderWidth:
                              currentTextStyle.color === color ? 3 : 0,
                            borderColor: "#007AFF",
                          }}
                        />
                      ))}
                    </View>
                  </ScrollView>

                  {videoTextOverlays.length > 0 && (
                    <View>
                      <Text
                        style={{
                          color: "#fff",
                          fontSize: 14,
                          marginBottom: 10,
                        }}
                      >
                        Text Overlays ({videoTextOverlays.length})
                      </Text>
                      {videoTextOverlays.map((overlay) => (
                        <View
                          key={overlay.id}
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            alignItems: "center",
                            backgroundColor: "rgba(255,255,255,0.1)",
                            padding: 12,
                            borderRadius: 8,
                            marginBottom: 8,
                          }}
                        >
                          <Text style={{ color: "#fff", flex: 1 }}>
                            {overlay.text}
                          </Text>
                          <TouchableOpacity
                            onPress={() => {
                              setVideoTextOverlays(
                                videoTextOverlays.filter(
                                  (o) => o.id !== overlay.id
                                )
                              );
                            }}
                          >
                            <Feather name="x" size={20} color="#ff3b30" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            </Modal>

            {/* Video Crop/Rotate Modal */}
            <Modal
              visible={showCropModal}
              transparent={true}
              animationType="slide"
              onRequestClose={() => setShowCropModal(false)}
            >
              <View
                style={{
                  flex: 1,
                  backgroundColor: "rgba(0,0,0,0.95)",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingHorizontal: 16,
                    paddingTop: Platform.OS === "ios" ? 50 : 20,
                    paddingBottom: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: "rgba(255,255,255,0.1)",
                  }}
                >
                  <TouchableOpacity onPress={() => setShowCropModal(false)}>
                    <Text
                      style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}
                    >
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <Text
                    style={{ color: "#fff", fontSize: 18, fontWeight: "bold" }}
                  >
                    Crop & Rotate
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setVideoCrop({ x: 0, y: 0, width: 1, height: 1 });
                      setVideoRotation(0);
                      setShowCropModal(false);
                    }}
                  >
                    <Text
                      style={{
                        color: "#007AFF",
                        fontSize: 16,
                        fontWeight: "600",
                      }}
                    >
                      Reset
                    </Text>
                  </TouchableOpacity>
                </View>

                <View
                  style={{
                    flex: 1,
                    justifyContent: "center",
                    alignItems: "center",
                    padding: 20,
                  }}
                >
                  {form.video && (
                    <Video
                      source={{ uri: form.video.uri }}
                      style={{
                        width: "100%",
                        height: 300,
                        transform: [{ rotate: `${videoRotation}deg` }],
                      }}
                      resizeMode={ResizeMode.CONTAIN}
                      shouldPlay={false}
                    />
                  )}

                  <View style={{ width: "100%", marginTop: 30 }}>
                    <Text
                      style={{
                        color: "#fff",
                        fontSize: 16,
                        marginBottom: 20,
                        textAlign: "center",
                      }}
                    >
                      Rotation: {videoRotation}°
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        gap: 12,
                        justifyContent: "center",
                        marginBottom: 20,
                      }}
                    >
                      {[0, 90, 180, 270].map((angle) => (
                        <TouchableOpacity
                          key={angle}
                          onPress={() => setVideoRotation(angle)}
                          style={{
                            paddingVertical: 12,
                            paddingHorizontal: 20,
                            borderRadius: 8,
                            backgroundColor:
                              videoRotation === angle
                                ? "#007AFF"
                                : "rgba(255,255,255,0.1)",
                          }}
                        >
                          <Text style={{ color: "#fff", fontSize: 16 }}>
                            {angle}°
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text
                      style={{
                        color: "#fff",
                        fontSize: 14,
                        marginBottom: 10,
                        textAlign: "center",
                      }}
                    >
                      Crop (coming soon - requires video processing)
                    </Text>
                  </View>
                </View>
              </View>
            </Modal>

            {/* Instagram-style Text Editor Modal - EXACT MATCH */}
            <Modal
              visible={showTextModal}
              transparent={true}
              animationType="slide"
              onRequestClose={() => setShowTextModal(false)}
            >
              <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={{ flex: 1 }}
                keyboardVerticalOffset={0}
              >
                <View
                  style={{
                    flex: 1,
                    backgroundColor: "rgba(0,0,0,0.95)",
                  }}
                >
                  {/* Full-screen preview with text overlay */}
                  {editedImage && imageBase64 ? (
                    <View style={{ flex: 1, backgroundColor: "#000" }}>
                      <WebView
                        key={`text-preview-${editedImage?.uri || "none"}-${
                          textOverlays.length
                        }-${currentText ? "has-current" : "no-current"}`}
                        source={{
                          html: `
                            <!DOCTYPE html>
                            <html>
                              <head>
                                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                                <style>
                                  * {
                                    margin: 0;
                                    padding: 0;
                                    box-sizing: border-box;
                                  }
                                  html, body {
                                    width: 100%;
                                    height: 100%;
                                    overflow: hidden;
                                    background: #000;
                                  }
                                  body {
                                    position: relative;
                                  }
                                  img {
                                    width: 100%;
                                    height: 100%;
                                    object-fit: cover;
                                    display: block;
                                    filter: ${(() => {
                                      // If image came from PhotoEditor, adjustments are already baked in
                                      if (
                                        editedImage?.adjustmentsAlreadyApplied ||
                                        editedImage?.fromPhotoEditor
                                      ) {
                                        return getFilterCSS(
                                          photoForm.filter,
                                          null
                                        );
                                      }
                                      return getFilterCSS(
                                        photoForm.filter,
                                        editedImage?.adjustments || adjustments
                                      );
                                    })()};
                                  }
                                  ${textOverlays
                                    .map((overlay, index) => {
                                      const textStyle =
                                        overlay.style || currentTextStyle;
                                      const alignment =
                                        textStyle.alignment || "center";

                                      // Use x/y from overlay if set (from dragging), otherwise use alignment-based positioning
                                      let leftPos, transformValue;
                                      if (
                                        overlay.x !== undefined &&
                                        overlay.y !== undefined
                                      ) {
                                        // Dragged position - use center transform
                                        leftPos = overlay.x + "%";
                                        transformValue =
                                          "translate(-50%, -50%)";
                                      } else {
                                        // Initial position based on alignment
                                        if (alignment === "left") {
                                          leftPos = "5%";
                                          transformValue = "translateY(-50%)";
                                        } else if (alignment === "right") {
                                          leftPos = "95%";
                                          transformValue =
                                            "translate(-100%, -50%)";
                                        } else {
                                          // center
                                          leftPos = "50%";
                                          transformValue =
                                            "translate(-50%, -50%)";
                                        }
                                      }

                                      let textCSS = `
                                      position: absolute;
                                      top: ${
                                        overlay.y !== undefined ? overlay.y : 50
                                      }%;
                                      left: ${leftPos};
                                      transform: ${transformValue};
                                      font-size: ${textStyle.fontSize}px;
                                      font-family: '${
                                        textStyle.fontFamily
                                      }', sans-serif;
                                      color: ${textStyle.color};
                                      text-align: ${alignment};
                                      white-space: nowrap;
                                      z-index: ${index + 1};
                                      pointer-events: auto;
                                      touch-action: none;
                                      -webkit-user-select: none;
                                      user-select: none;
                                      cursor: move;
                                    `;

                                      if (
                                        textStyle.backgroundColor &&
                                        textStyle.backgroundColor !==
                                          "transparent"
                                      ) {
                                        textCSS += `background-color: ${textStyle.backgroundColor}; padding: 4px 8px; border-radius: 4px;`;
                                      }

                                      if (textStyle.textStyle === "outline") {
                                        textCSS += `-webkit-text-stroke: 2px ${textStyle.color}; -webkit-text-fill-color: transparent;`;
                                      } else if (
                                        textStyle.textStyle === "shadow"
                                      ) {
                                        textCSS += `text-shadow: 2px 2px 4px rgba(0,0,0,0.8), -2px -2px 4px rgba(0,0,0,0.8);`;
                                      } else if (
                                        textStyle.textStyle === "neon"
                                      ) {
                                        textCSS += `text-shadow: 0 0 5px ${textStyle.color}, 0 0 10px ${textStyle.color}, 0 0 15px ${textStyle.color};`;
                                      } else if (
                                        textStyle.textStyle === "gradient"
                                      ) {
                                        textCSS += `background: linear-gradient(45deg, ${textStyle.color}, #FF6B6B); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;`;
                                      }

                                      return `.text-overlay-${index} { ${textCSS} }`;
                                    })
                                    .join("\n")}
                                  ${imageOverlays
                                    .map((overlay, index) => {
                                      return `.image-overlay-${index} {
                                      position: absolute;
                                      top: ${overlay.y}%;
                                      left: ${overlay.x}%;
                                      width: ${overlay.width}%;
                                      height: ${overlay.height}%;
                                      transform: translate(-50%, -50%) rotate(${
                                        overlay.rotation
                                      }deg);
                                      z-index: ${100 + index};
                                      pointer-events: none;
                                    }`;
                                    })
                                    .join("\n")}
                                  ${
                                    currentText
                                      ? (() => {
                                          let css =
                                            ".current-text { position: absolute; top: " +
                                            currentTextPosition.y +
                                            "%; left: " +
                                            currentTextPosition.x +
                                            "%; transform: translate(-50%, -50%); font-size: " +
                                            currentTextStyle.fontSize +
                                            "px; font-family: '" +
                                            currentTextStyle.fontFamily +
                                            "', sans-serif; color: " +
                                            currentTextStyle.color +
                                            "; text-align: center; white-space: nowrap; z-index: 1000; pointer-events: auto; touch-action: none; -webkit-user-select: none; user-select: none; cursor: move;";

                                          if (
                                            currentTextStyle.backgroundColor &&
                                            currentTextStyle.backgroundColor !==
                                              "transparent"
                                          ) {
                                            css +=
                                              " background-color: " +
                                              currentTextStyle.backgroundColor +
                                              "; padding: 4px 8px; border-radius: 4px;";
                                          }

                                          if (
                                            currentTextStyle.textStyle ===
                                            "outline"
                                          ) {
                                            css +=
                                              " -webkit-text-stroke: 2px " +
                                              currentTextStyle.color +
                                              "; -webkit-text-fill-color: transparent;";
                                          } else if (
                                            currentTextStyle.textStyle ===
                                            "shadow"
                                          ) {
                                            css +=
                                              " text-shadow: 2px 2px 4px rgba(0,0,0,0.8), -2px -2px 4px rgba(0,0,0,0.8);";
                                          } else if (
                                            currentTextStyle.textStyle ===
                                            "neon"
                                          ) {
                                            css +=
                                              " text-shadow: 0 0 5px " +
                                              currentTextStyle.color +
                                              ", 0 0 10px " +
                                              currentTextStyle.color +
                                              ", 0 0 15px " +
                                              currentTextStyle.color +
                                              ";";
                                          } else if (
                                            currentTextStyle.textStyle ===
                                            "gradient"
                                          ) {
                                            css +=
                                              " background: linear-gradient(45deg, " +
                                              currentTextStyle.color +
                                              ", #FF6B6B); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;";
                                          }

                                          css += " }";
                                          return css;
                                        })()
                                      : ""
                                  }
                                </style>
                              </head>
                              <body>
                                <img src="${imageBase64}" alt="Image with Text" />
                                ${textOverlays
                                  .map(
                                    (overlay, index) =>
                                      `<div class="text-overlay-${index}" data-overlay-id="${
                                        overlay.id || index
                                      }" data-overlay-index="${index}">${
                                        overlay.text
                                      }</div>`
                                  )
                                  .join("")}
                                ${imageOverlays
                                  .map(
                                    (overlay, index) =>
                                      `<img src="${overlay.uri}" class="image-overlay-${index}" alt="Overlay ${index}" />`
                                  )
                                  .join("")}
                                ${
                                  currentText
                                    ? `<div class="current-text">${currentText}</div>`
                                    : ""
                                }
                                <script>
                                  setTimeout(function() {
                                    const textOverlays = document.querySelectorAll('[class^="text-overlay-"]');
                                    const currentTextElement = document.querySelector('.current-text');
                                    let draggedElement = null;
                                    let dragOffset = { x: 0, y: 0 };
                                    
                                    // Function to handle dragging for both overlay texts and current text
                                    function setupDraggableElement(element, isCurrentText = false) {
                                      element.style.cursor = 'move';
                                      element.style.userSelect = 'none';
                                      element.style.touchAction = 'none';
                                      element.style.pointerEvents = 'auto';
                                      
                                      // Store current position to use in handleEnd
                                      let currentX = null;
                                      let currentY = null;
                                      let touchStartTime = null;
                                      let touchStartX = null;
                                      let touchStartY = null;
                                      let hasMoved = false;
                                      
                                      function handleStart(e) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        draggedElement = element;
                                        const rect = element.getBoundingClientRect();
                                        const touch = e.touches[0];
                                        dragOffset.x = touch.clientX - rect.left - rect.width / 2;
                                        dragOffset.y = touch.clientY - rect.top - rect.height / 2;
                                        touchStartTime = Date.now();
                                        touchStartX = touch.clientX;
                                        touchStartY = touch.clientY;
                                        hasMoved = false;
                                        element.style.opacity = '0.7';
                                        // Reset position tracking
                                        currentX = null;
                                        currentY = null;
                                      }
                                      
                                      function handleMove(e) {
                                        if (draggedElement === element) {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          const touch = e.touches[0];
                                          
                                          // Check if user has moved significantly (more than 10px)
                                          const moveDistance = Math.sqrt(
                                            Math.pow(touch.clientX - touchStartX, 2) + 
                                            Math.pow(touch.clientY - touchStartY, 2)
                                          );
                                          if (moveDistance > 10) {
                                            hasMoved = true;
                                          }
                                          
                                          const bodyRect = document.body.getBoundingClientRect();
                                          const x = Math.max(0, Math.min(100, ((touch.clientX - dragOffset.x) / bodyRect.width) * 100));
                                          const y = Math.max(0, Math.min(100, ((touch.clientY - dragOffset.y) / bodyRect.height) * 100));
                                          
                                          // Store position for use in handleEnd
                                          currentX = x;
                                          currentY = y;
                                          
                                          // Update position directly in DOM for smooth dragging (no WebView reload)
                                          element.style.left = x + '%';
                                          element.style.top = y + '%';
                                          
                                          if (isCurrentText) {
                                            // Position is updated directly in DOM above, no need to send message during drag
                                            // This prevents WebView reload which causes the black screen glitch
                                          } else {
                                            // For overlay texts
                                            const overlayId = element.getAttribute('data-overlay-id');
                                            const overlayIndex = parseInt(element.getAttribute('data-overlay-index'));
                                            
                                            if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                                              window.ReactNativeWebView.postMessage(JSON.stringify({
                                                type: 'textDrag',
                                                id: overlayId,
                                                index: overlayIndex,
                                                x: x,
                                                y: y
                                              }));
                                            }
                                          }
                                        }
                                      }
                                      
                                      function handleEnd(e) {
                                        if (draggedElement === element) {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          element.style.opacity = '1';
                                          
                                          const touchDuration = Date.now() - touchStartTime;
                                          
                                          // If it was a quick tap (less than 300ms) and didn't move much, treat as edit tap
                                          // Only for overlay texts, not current text
                                          if (!isCurrentText && touchDuration < 300 && !hasMoved) {
                                            const overlayId = element.getAttribute('data-overlay-id');
                                            const overlayIndex = parseInt(element.getAttribute('data-overlay-index'));
                                            
                                            if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                                              window.ReactNativeWebView.postMessage(JSON.stringify({
                                                type: 'editText',
                                                id: overlayId,
                                                index: overlayIndex
                                              }));
                                            }
                                            draggedElement = null;
                                            currentX = null;
                                            currentY = null;
                                            return;
                                          }
                                          
                                          if (isCurrentText) {
                                            // Send final position when drag ends (only then update React state to avoid WebView reload)
                                            // Use stored position if available, otherwise read from element style
                                            let finalX, finalY;
                                            if (currentX !== null && currentY !== null) {
                                              finalX = currentX;
                                              finalY = currentY;
                                            } else {
                                              // Fallback: read from style (shouldn't happen if drag occurred)
                                              finalX = parseFloat(element.style.left) || 50;
                                              finalY = parseFloat(element.style.top) || 50;
                                            }
                                            
                                            if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                                              window.ReactNativeWebView.postMessage(JSON.stringify({
                                                type: 'currentTextDrag',
                                                x: finalX,
                                                y: finalY
                                              }));
                                            }
                                          }
                                          
                                          draggedElement = null;
                                          currentX = null;
                                          currentY = null;
                                        }
                                      }
                                      
                                      element.addEventListener('touchstart', handleStart, { passive: false });
                                      element.addEventListener('touchmove', handleMove, { passive: false });
                                      element.addEventListener('touchend', handleEnd, { passive: false });
                                    }
                                    
                                    // Setup draggable for overlay texts
                                    textOverlays.forEach(function(element) {
                                      setupDraggableElement(element, false);
                                    });
                                    
                                    // Setup draggable for current text if it exists
                                    if (currentTextElement) {
                                      setupDraggableElement(currentTextElement, true);
                                    }
                                  }, 100);
                                </script>
                              </body>
                            </html>
                          `,
                        }}
                        style={{ flex: 1, backgroundColor: "#000" }}
                        scrollEnabled={false}
                        showsVerticalScrollIndicator={false}
                        showsHorizontalScrollIndicator={false}
                        bounces={false}
                        overScrollMode="never"
                        androidLayerType="hardware"
                        originWhitelist={["*"]}
                        javaScriptEnabled={true}
                        cacheEnabled={false}
                        cacheMode="LOAD_NO_CACHE"
                        renderToHardwareTextureAndroid={false}
                        androidHardwareAccelerationDisabled={false}
                        nestedScrollEnabled={false}
                        startInLoadingState={false}
                        mixedContentMode="always"
                        allowsInlineMediaPlayback={true}
                        mediaPlaybackRequiresUserAction={false}
                        onShouldStartLoadWithRequest={() => true}
                        onError={(syntheticEvent) => {
                          const { nativeEvent } = syntheticEvent;
                        }}
                        onLoadEnd={() => {
                          // WebView loaded successfully
                        }}
                        onMessage={(event) => {
                          try {
                            const message = JSON.parse(event.nativeEvent.data);
                            if (message.type === "textDrag") {
                              setTextOverlays((prev) =>
                                prev.map((overlay, index) =>
                                  overlay.id === message.id ||
                                  index === message.index
                                    ? { ...overlay, x: message.x, y: message.y }
                                    : overlay
                                )
                              );
                            } else if (message.type === "currentTextDrag") {
                              // Only update state when drag ends to avoid WebView reload
                              setCurrentTextPosition({
                                x: message.x,
                                y: message.y,
                              });
                            } else if (message.type === "editText") {
                              // Find the overlay to edit
                              const overlayToEdit = textOverlays.find(
                                (overlay, index) =>
                                  overlay.id === message.id ||
                                  index === message.index
                              );
                              if (overlayToEdit) {
                                // Store original overlay for cancel
                                setOriginalEditingOverlay({ ...overlayToEdit });
                                // Load overlay data into current text state
                                setEditingTextId(overlayToEdit.id);
                                setCurrentText(overlayToEdit.text);
                                setCurrentTextStyle({
                                  ...overlayToEdit.style,
                                });
                                setCurrentTextPosition({
                                  x: overlayToEdit.x || 50,
                                  y: overlayToEdit.y || 50,
                                });
                                // Open text modal for editing
                                setShowTextModal(true);
                                // Remove the overlay from the list (will be re-added when Done is pressed)
                                setTextOverlays((prev) =>
                                  prev.filter(
                                    (overlay) => overlay.id !== overlayToEdit.id
                                  )
                                );
                              }
                            }
                          } catch (error) {
                           
                          }
                        }}
                        ref={textWebViewRef}
                      />
                    </View>
                  ) : (
                    <View
                      style={{
                        flex: 1,
                        justifyContent: "center",
                        alignItems: "center",
                        backgroundColor: "#000",
                      }}
                    >
                      <Text style={{ color: "#fff" }}>No image selected</Text>
                    </View>
                  )}

                  {/* Top Action Bar - EXACT Instagram Style */}
                  <View
                    style={{
                      position: "absolute",
                      top: Platform.OS === "ios" ? 60 : 50,
                      left: 0,
                      right: 0,
                      zIndex: 1000,
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      backgroundColor: "transparent",
                      pointerEvents: "box-none",
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        height: 44,
                        pointerEvents: "box-none",
                      }}
                    >
                      <TouchableOpacity
                        onPress={() => {
                          // If we were editing, restore the original overlay
                          if (editingTextId && originalEditingOverlay) {
                            setTextOverlays((prev) => [
                              ...prev,
                              originalEditingOverlay,
                            ]);
                            setOriginalEditingOverlay(null);
                          }
                          setShowTextModal(false);
                          setCurrentText("");
                          setEditingTextId(null);
                          setCurrentTextPosition({ x: 50, y: 50 });
                          setShowTextStyles(false);
                          setShowColorPicker(false);
                          setShowBackgroundColors(false);
                        }}
                        style={{
                          minWidth: 60,
                          paddingVertical: 8,
                          paddingHorizontal: 4,
                          zIndex: 1001,
                        }}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={{
                            color: "#FFFFFF",
                            fontSize: 16,
                            fontWeight: "600",
                            fontFamily: "Poppins-SemiBold",
                          }}
                        >
                          Cancel
                        </Text>
                      </TouchableOpacity>

                      <Text
                        style={{
                          color: "#FFFFFF",
                          fontSize: 16,
                          fontWeight: "600",
                          fontFamily: "Poppins-SemiBold",
                          position: "absolute",
                          left: 0,
                          right: 0,
                          textAlign: "center",
                          pointerEvents: "none",
                        }}
                      >
                        Text
                      </Text>

                      <TouchableOpacity
                        onPress={() => {
                          if (currentText.trim()) {
                            if (editingTextId) {
                              // Update existing overlay
                              setTextOverlays((prev) => [
                                ...prev,
                                {
                                  text: currentText,
                                  style: { ...currentTextStyle },
                                  x: currentTextPosition.x,
                                  y: currentTextPosition.y,
                                  id: editingTextId, // Keep the same ID
                                },
                              ]);
                              setEditingTextId(null);
                              setOriginalEditingOverlay(null);
                            } else {
                              // Create new overlay
                              setTextOverlays([
                                ...textOverlays,
                                {
                                  text: currentText,
                                  style: { ...currentTextStyle },
                                  x: currentTextPosition.x,
                                  y: currentTextPosition.y,
                                  id: Date.now().toString(),
                                },
                              ]);
                            }
                            setCurrentText("");
                            setCurrentTextStyle({
                              fontSize: 24,
                              fontFamily: "Poppins-Bold",
                              color: "#FFFFFF",
                              backgroundColor: "transparent",
                              alignment: "center",
                              textStyle: "normal",
                            });
                            setCurrentTextPosition({ x: 50, y: 50 });
                          }
                          setShowTextModal(false);
                          setShowTextStyles(false);
                          setShowColorPicker(false);
                          setShowBackgroundColors(false);
                        }}
                        style={{
                          minWidth: 60,
                          alignItems: "flex-end",
                          paddingVertical: 8,
                          paddingHorizontal: 4,
                          zIndex: 1001,
                        }}
                        activeOpacity={0.7}
                        disabled={!currentText.trim()}
                      >
                        <Text
                          style={{
                            color: currentText.trim()
                              ? "#0095F6"
                              : "rgba(255, 255, 255, 0.5)",
                            fontSize: 16,
                            fontWeight: "600",
                            fontFamily: "Poppins-SemiBold",
                          }}
                        >
                          Done
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Left Side Vertical Slider - Tapered Style (Wider at top, narrower at bottom) */}
                  <View
                    style={{
                      position: "absolute",
                      left: 12,
                      top: 120,
                      width: 30,
                      height: 250,
                      zIndex: 50,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    {/* Tapered Slider Track - Wider at top, narrower at bottom */}
                    <View
                      style={{
                        width: 5, // Base width
                        height: 250,
                        position: "relative",
                        alignSelf: "center",
                        overflow: "visible",
                      }}
                    >
                      {/* Top section - Wider (5px) */}
                      <View
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: 5,
                          height: 80,
                          backgroundColor: "rgba(255, 255, 255, 0.3)",
                          borderRadius: 2.5,
                        }}
                      />

                      {/* Middle section - Medium (4px) */}
                      <View
                        style={{
                          position: "absolute",
                          top: 80,
                          left: 0.5,
                          width: 4,
                          height: 90,
                          backgroundColor: "rgba(255, 255, 255, 0.3)",
                          borderRadius: 2,
                        }}
                      />

                      {/* Bottom section - Narrower (3px) */}
                      <View
                        style={{
                          position: "absolute",
                          top: 170,
                          left: 1,
                          width: 3,
                          height: 80,
                          backgroundColor: "rgba(255, 255, 255, 0.3)",
                          borderRadius: 1.5,
                        }}
                      />

                      {/* Filled portion from bottom with tapered width */}
                      {(() => {
                        const fillHeight =
                          ((currentTextStyle.fontSize - 12) / (72 - 12)) * 100;
                        let fillWidth, fillLeft, fillBorderRadius;

                        if (fillHeight <= 32) {
                          // Bottom section (narrowest)
                          fillWidth = 3;
                          fillLeft = 1;
                          fillBorderRadius = 1.5;
                        } else if (fillHeight <= 68) {
                          // Middle section
                          fillWidth = 4;
                          fillLeft = 0.5;
                          fillBorderRadius = 2;
                        } else {
                          // Top section (widest)
                          fillWidth = 5;
                          fillLeft = 0;
                          fillBorderRadius = 2.5;
                        }

                        return (
                          <View
                            style={{
                              position: "absolute",
                              bottom: 0,
                              left: fillLeft,
                              width: fillWidth,
                              height: `${fillHeight}%`,
                              backgroundColor: "#FFFFFF",
                              borderRadius: fillBorderRadius,
                            }}
                          />
                        );
                      })()}
                    </View>

                    {/* Slider Thumb (Circle) - Centered on the line */}
                    <View
                      style={{
                        position: "absolute",
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        backgroundColor: "#FFFFFF",
                        borderWidth: 2,
                        borderColor: "#0095F6",
                        left: 3, // Center: (30px container - 24px circle) / 2 = 3px
                        bottom: `${
                          ((currentTextStyle.fontSize - 12) / (72 - 12)) * 100
                        }%`,
                        transform: [{ translateY: 12 }], // Half of thumb height to center it vertically
                      }}
                    />

                    {/* Touchable Area */}
                    <View
                      style={{
                        position: "absolute",
                        width: 50,
                        height: 250,
                        left: -25,
                        top: 0,
                      }}
                      onStartShouldSetResponder={() => true}
                      onMoveShouldSetResponder={() => true}
                      onResponderGrant={(e) => {
                        const { locationY } = e.nativeEvent;
                        const sliderHeight = 250;
                        // Clamp locationY to slider bounds
                        const clampedY = Math.max(
                          0,
                          Math.min(sliderHeight, locationY)
                        );
                        // Calculate percentage from bottom (0 = bottom, 1 = top)
                        const percentage = 1 - clampedY / sliderHeight;
                        // Map to fontSize range (12-72)
                        const newValue = 12 + percentage * (72 - 12);
                        setCurrentTextStyle({
                          ...currentTextStyle,
                          fontSize: Math.max(
                            12,
                            Math.min(72, Math.round(newValue))
                          ),
                        });
                      }}
                      onResponderMove={(e) => {
                        const { locationY } = e.nativeEvent;
                        const sliderHeight = 250;
                        // Clamp locationY to slider bounds
                        const clampedY = Math.max(
                          0,
                          Math.min(sliderHeight, locationY)
                        );
                        // Calculate percentage from bottom (0 = bottom, 1 = top)
                        const percentage = 1 - clampedY / sliderHeight;
                        // Map to fontSize range (12-72)
                        const newValue = 12 + percentage * (72 - 12);
                        setCurrentTextStyle({
                          ...currentTextStyle,
                          fontSize: Math.max(
                            12,
                            Math.min(72, Math.round(newValue))
                          ),
                        });
                      }}
                    />
                  </View>

                  {/* Bottom Text Editor Panel - Instagram Style Tab Above Keyboard */}
                  <View
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      backgroundColor: "transparent",
                      borderTopLeftRadius: 0,
                      borderTopRightRadius: 0,
                      paddingTop: 12,
                      paddingBottom: Platform.OS === "ios" ? 0 : 16,
                    }}
                  >
                    {/* Text Formatting Options Row - Aa, Rainbow, Lines, A */}
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "center",
                        paddingHorizontal: 20,
                        paddingVertical: 12,
                        marginBottom: 12,
                        gap: 20,
                        alignItems: "center",
                        backgroundColor: "rgba(0, 0, 0, 0.7)",
                        borderRadius: 12,
                        marginHorizontal: 16,
                      }}
                    >
                      {/* Aa Button - Text Styling (Shows draggable text styles) */}
                      <TouchableOpacity
                        onPress={() => {
                          setShowTextStyles(!showTextStyles);
                          setShowColorPicker(false);
                          setShowBackgroundColors(false);
                        }}
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 22,
                          backgroundColor: showTextStyles
                            ? "rgba(255, 255, 255, 0.3)"
                            : "rgba(255, 255, 255, 0.15)",
                          justifyContent: "center",
                          alignItems: "center",
                          borderWidth: showTextStyles ? 2 : 1,
                          borderColor: showTextStyles
                            ? "#0095F6"
                            : "rgba(255, 255, 255, 0.3)",
                        }}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={{
                            color: "#FFFFFF",
                            fontSize: 18,
                            fontFamily: "Poppins-Bold",
                          }}
                        >
                          Aa
                        </Text>
                      </TouchableOpacity>

                      {/* Rainbow Gradient Button - Color Picker (Shows draggable colors) */}
                      <TouchableOpacity
                        onPress={() => {
                          setShowColorPicker(!showColorPicker);
                          setShowTextStyles(false);
                          setShowBackgroundColors(false);
                        }}
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 22,
                          overflow: "hidden",
                          borderWidth: showColorPicker ? 2 : 1,
                          borderColor: showColorPicker
                            ? "#0095F6"
                            : "rgba(255, 255, 255, 0.3)",
                        }}
                        activeOpacity={0.7}
                      >
                        <LinearGradient
                          colors={[
                            "#FF0000",
                            "#FF7F00",
                            "#FFFF00",
                            "#00FF00",
                            "#0000FF",
                            "#4B0082",
                            "#9400D3",
                          ]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={{ width: "100%", height: "100%" }}
                        />
                      </TouchableOpacity>

                      {/* Three Lines Button - Alignment */}
                      <TouchableOpacity
                        onPress={() => {
                          const alignments = ["left", "center", "right"];
                          const currentIndex = alignments.indexOf(
                            currentTextStyle.alignment
                          );
                          const nextAlignment =
                            alignments[(currentIndex + 1) % alignments.length];
                          setCurrentTextStyle({
                            ...currentTextStyle,
                            alignment: nextAlignment,
                          });
                        }}
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 8,
                          backgroundColor: "rgba(255, 255, 255, 0.15)",
                          justifyContent: "center",
                          alignItems: "center",
                          borderWidth: 1,
                          borderColor: "rgba(255, 255, 255, 0.3)",
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={{ gap: 3 }}>
                          <View
                            style={{
                              width:
                                currentTextStyle.alignment === "left"
                                  ? 20
                                  : currentTextStyle.alignment === "center"
                                  ? 18
                                  : 14,
                              height: 2,
                              backgroundColor: "#FFFFFF",
                            }}
                          />
                          <View
                            style={{
                              width:
                                currentTextStyle.alignment === "left"
                                  ? 18
                                  : currentTextStyle.alignment === "center"
                                  ? 20
                                  : 16,
                              height: 2,
                              backgroundColor: "#FFFFFF",
                            }}
                          />
                          <View
                            style={{
                              width:
                                currentTextStyle.alignment === "left"
                                  ? 14
                                  : currentTextStyle.alignment === "center"
                                  ? 18
                                  : 20,
                              height: 2,
                              backgroundColor: "#FFFFFF",
                            }}
                          />
                        </View>
                      </TouchableOpacity>

                      {/* A Button - Background Color (Shows draggable background colors) */}
                      <TouchableOpacity
                        onPress={() => {
                          setShowBackgroundColors(!showBackgroundColors);
                          setShowTextStyles(false);
                          setShowColorPicker(false);
                        }}
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 8,
                          backgroundColor: showBackgroundColors
                            ? "rgba(255, 255, 255, 0.3)"
                            : "rgba(255, 255, 255, 0.15)",
                          justifyContent: "center",
                          alignItems: "center",
                          borderWidth: showBackgroundColors ? 2 : 1,
                          borderColor: showBackgroundColors
                            ? "#0095F6"
                            : "rgba(255, 255, 255, 0.3)",
                        }}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={{
                            color: "#FFFFFF",
                            fontSize: 20,
                            fontFamily: "Poppins-Bold",
                            textShadowColor:
                              currentTextStyle.textStyle === "shadow"
                                ? "#000"
                                : "transparent",
                            textShadowOffset:
                              currentTextStyle.textStyle === "shadow"
                                ? { width: 1, height: 1 }
                                : { width: 0, height: 0 },
                            textShadowRadius:
                              currentTextStyle.textStyle === "shadow" ? 2 : 0,
                          }}
                        >
                          A
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Draggable Text Styles - Horizontal Scroll */}
                    {showTextStyles && (
                      <View
                        style={{
                          marginBottom: 12,
                          backgroundColor: "rgba(0, 0, 0, 0.7)",
                          borderRadius: 12,
                          marginHorizontal: 16,
                          paddingVertical: 8,
                        }}
                      >
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={{
                            paddingHorizontal: 16,
                            paddingVertical: 8,
                          }}
                          decelerationRate="fast"
                          snapToInterval={80}
                          snapToAlignment="start"
                        >
                          {TEXT_STYLES.map((style) => {
                            const isSelected =
                              currentTextStyle.textStyle === style.id ||
                              (style.id === "normal" &&
                                currentTextStyle.textStyle === "normal" &&
                                currentTextStyle.fontFamily ===
                                  style.fontFamily);
                            return (
                              <TouchableOpacity
                                key={style.id}
                                onPress={() => {
                                  setCurrentTextStyle({
                                    ...currentTextStyle,
                                    textStyle: style.id,
                                    fontFamily: style.fontFamily,
                                    backgroundColor:
                                      style.id === "outline" ||
                                      style.id === "shadow"
                                        ? "transparent"
                                        : currentTextStyle.backgroundColor,
                                  });
                                }}
                                style={{
                                  width: 70,
                                  height: 50,
                                  borderRadius: 8,
                                  backgroundColor: isSelected
                                    ? "rgba(255, 255, 255, 0.3)"
                                    : "rgba(255, 255, 255, 0.1)",
                                  justifyContent: "center",
                                  alignItems: "center",
                                  marginRight: 8,
                                  borderWidth: isSelected ? 2 : 1,
                                  borderColor: isSelected
                                    ? "#0095F6"
                                    : "rgba(255, 255, 255, 0.2)",
                                }}
                              >
                                <Text
                                  style={{
                                    color: "#FFFFFF",
                                    fontSize: 14,
                                    fontFamily: style.fontFamily,
                                    fontWeight: style.fontWeight,
                                    fontStyle: style.fontStyle || "normal",
                                    textShadowColor:
                                      style.id === "shadow"
                                        ? "#000"
                                        : "transparent",
                                    textShadowOffset:
                                      style.id === "shadow"
                                        ? { width: 1, height: 1 }
                                        : { width: 0, height: 0 },
                                    textShadowRadius:
                                      style.id === "shadow" ? 2 : 0,
                                  }}
                                >
                                  {style.name}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </View>
                    )}

                    {/* Draggable Color Picker - Horizontal Scroll */}
                    {showColorPicker && (
                      <View
                        style={{
                          marginBottom: 12,
                          backgroundColor: "rgba(0, 0, 0, 0.7)",
                          borderRadius: 12,
                          marginHorizontal: 16,
                          paddingVertical: 8,
                          zIndex: 10,
                        }}
                      >
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={{
                            paddingHorizontal: 16,
                            paddingVertical: 8,
                          }}
                          decelerationRate="fast"
                          snapToInterval={48}
                          snapToAlignment="start"
                        >
                          {TEXT_COLORS.map((color, index) => (
                            <TouchableOpacity
                              key={`color-${color}-${index}`}
                              onPress={() =>
                                setCurrentTextStyle({
                                  ...currentTextStyle,
                                  color: color,
                                })
                              }
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius: 20,
                                backgroundColor: color,
                                borderWidth:
                                  currentTextStyle.color === color ? 3 : 2,
                                borderColor:
                                  currentTextStyle.color === color
                                    ? "#0095F6"
                                    : "rgba(255, 255, 255, 0.3)",
                                marginRight: 10,
                              }}
                              activeOpacity={0.7}
                            />
                          ))}
                        </ScrollView>
                      </View>
                    )}

                    {/* Draggable Background Colors - Horizontal Scroll */}
                    {showBackgroundColors && (
                      <View
                        style={{
                          marginBottom: 12,
                          backgroundColor: "rgba(0, 0, 0, 0.7)",
                          borderRadius: 12,
                          marginHorizontal: 16,
                          paddingVertical: 8,
                          zIndex: 10,
                        }}
                      >
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={{
                            paddingHorizontal: 16,
                            paddingVertical: 8,
                          }}
                          decelerationRate="fast"
                          snapToInterval={48}
                          snapToAlignment="start"
                        >
                          {BACKGROUND_COLORS.map((bgColor, index) => (
                            <TouchableOpacity
                              key={`bg-${bgColor}-${index}`}
                              onPress={() =>
                                setCurrentTextStyle({
                                  ...currentTextStyle,
                                  backgroundColor: bgColor,
                                })
                              }
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius: 20,
                                backgroundColor:
                                  bgColor === "transparent"
                                    ? "rgba(255, 255, 255, 0.1)"
                                    : bgColor,
                                borderWidth:
                                  currentTextStyle.backgroundColor === bgColor
                                    ? 3
                                    : 2,
                                borderColor:
                                  currentTextStyle.backgroundColor === bgColor
                                    ? "#0095F6"
                                    : "rgba(255, 255, 255, 0.3)",
                                marginRight: 10,
                                borderStyle:
                                  bgColor === "transparent"
                                    ? "dashed"
                                    : "solid",
                                justifyContent: "center",
                                alignItems: "center",
                              }}
                              activeOpacity={0.7}
                            >
                              {bgColor === "transparent" && (
                                <Text
                                  style={{ color: "#FFFFFF", fontSize: 12 }}
                                >
                                  Ø
                                </Text>
                              )}
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}

                    {/* Visible Text Input - Users can see and edit their text */}
                    <View
                      style={{
                        position: "absolute",
                        bottom: Platform.OS === "ios" ? 100 : 120,
                        left: 16,
                        right: 16,
                        backgroundColor: "rgba(0, 0, 0, 0.7)",
                        borderRadius: 12,
                        padding: 12,
                        zIndex: 100,
                      }}
                    >
                      <TextInput
                        ref={hiddenTextInputRef}
                        value={currentText}
                        onChangeText={setCurrentText}
                        placeholder="Type your text here..."
                        placeholderTextColor="rgba(255, 255, 255, 0.5)"
                        style={{
                          color: "#FFFFFF",
                          fontSize: 16,
                          fontFamily: "Poppins-Regular",
                          minHeight: 40,
                          maxHeight: 100,
                          textAlign: "center",
                        }}
                        autoFocus={false}
                        multiline
                        textAlign="center"
                        selectionColor="#0095F6"
                      />
                      <Text
                        style={{
                          color: "rgba(255, 255, 255, 0.6)",
                          fontSize: 12,
                          marginTop: 4,
                          textAlign: "center",
                          fontFamily: "Poppins-Regular",
                        }}
                      >
                        Tap on existing text to edit it
                      </Text>
                    </View>
                  </View>
                </View>
              </KeyboardAvoidingView>
            </Modal>

            {/* Overlay Management Modal */}
            <Modal
              visible={showOverlayModal}
              transparent={true}
              animationType="slide"
              onRequestClose={() => setShowOverlayModal(false)}
            >
              <View
                style={{
                  flex: 1,
                  backgroundColor: "rgba(0,0,0,0.95)",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <View
                  style={{
                    width: "90%",
                    maxHeight: "80%",
                    backgroundColor: "rgba(255, 255, 255, 0.1)",
                    borderRadius: 20,
                    padding: 20,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 20,
                    }}
                  >
                    <Text
                      style={{
                        color: "#FFFFFF",
                        fontSize: 20,
                        fontWeight: "bold",
                        fontFamily: "Poppins-Bold",
                      }}
                    >
                      Image Overlays ({imageOverlays.length})
                    </Text>
                    <TouchableOpacity
                      onPress={() => setShowOverlayModal(false)}
                      style={{
                        padding: 8,
                      }}
                    >
                      <Text
                        style={{
                          color: "#FFFFFF",
                          fontSize: 24,
                          fontWeight: "bold",
                        }}
                      >
                        ×
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <ScrollView style={{ maxHeight: 400 }}>
                    {imageOverlays.map((overlay, index) => (
                      <View
                        key={overlay.id}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          backgroundColor: "rgba(255, 255, 255, 0.1)",
                          borderRadius: 12,
                          padding: 12,
                          marginBottom: 12,
                        }}
                      >
                        <Image
                          source={{ uri: overlay.uri }}
                          style={{
                            width: 60,
                            height: 60,
                            borderRadius: 8,
                            marginRight: 12,
                          }}
                          resizeMode="cover"
                        />
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              color: "#FFFFFF",
                              fontSize: 14,
                              fontWeight: "600",
                            }}
                          >
                            Overlay {index + 1}
                          </Text>
                          <Text
                            style={{
                              color: "#AAAAAA",
                              fontSize: 12,
                              marginTop: 4,
                            }}
                          >
                            Position: {Math.round(overlay.x)}%,{" "}
                            {Math.round(overlay.y)}%
                          </Text>
                          <Text style={{ color: "#AAAAAA", fontSize: 12 }}>
                            Size: {Math.round(overlay.width)}% ×{" "}
                            {Math.round(overlay.height)}%
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => {
                            setImageOverlays(
                              imageOverlays.filter((_, i) => i !== index)
                            );
                            if (imageOverlays.length === 1) {
                              setShowOverlayModal(false);
                            }
                          }}
                          style={{
                            backgroundColor: "rgba(255, 59, 48, 0.8)",
                            borderRadius: 8,
                            padding: 8,
                            marginLeft: 8,
                          }}
                        >
                          <Feather name="trash-2" size={20} color="#FFFFFF" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>

                  <View
                    style={{
                      flexDirection: "row",
                      gap: 12,
                      marginTop: 20,
                    }}
                  >
                    <TouchableOpacity
                      onPress={async () => {
                        try {
                          const permission =
                            await ImagePicker.requestMediaLibraryPermissionsAsync();
                          if (!permission.granted) {
                            Alert.alert(
                              "Permission Required",
                              "Please grant permission to access your photos"
                            );
                            return;
                          }

                          const result =
                            await ImagePicker.launchImageLibraryAsync({
                              mediaTypes: ImagePicker.MediaTypeOptions.Images,
                              allowsEditing: false,
                              quality: 0.8,
                              exif: false,
                            });

                          if (
                            !result.canceled &&
                            result.assets &&
                            result.assets.length > 0
                          ) {
                            const selectedAsset = result.assets[0];

                            try {
                              const base64 = await FileSystem.readAsStringAsync(
                                selectedAsset.uri,
                                {
                                  encoding: BASE64_ENCODING,
                                }
                              );

                              const imageUri = `data:image/jpeg;base64,${base64}`;

                              const newOverlay = {
                                id: Date.now().toString(),
                                uri: imageUri,
                                x: 50,
                                y: 50,
                                width: 30,
                                height: 30,
                                rotation: 0,
                              };

                              setImageOverlays([...imageOverlays, newOverlay]);
                            } catch (error) {
                              Alert.alert(
                                "Error",
                                "Failed to process overlay image"
                              );
                            }
                          }
                        } catch (error) {   
                          Alert.alert("Error", "Failed to pick overlay image");
                        }
                      }}
                      style={{
                        flex: 1,
                        backgroundColor: "rgba(255, 255, 255, 0.2)",
                        borderRadius: 12,
                        padding: 16,
                        alignItems: "center",
                      }}
                    >
                      <Feather name="plus" size={24} color="#FFFFFF" />
                      <Text
                        style={{
                          color: "#FFFFFF",
                          fontSize: 14,
                          marginTop: 8,
                          fontWeight: "600",
                        }}
                      >
                        Add Overlay
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setShowOverlayModal(false)}
                      style={{
                        flex: 1,
                        backgroundColor: "#0095F6",
                        borderRadius: 12,
                        padding: 16,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: "#FFFFFF",
                          fontSize: 16,
                          fontWeight: "bold",
                        }}
                      >
                        Done
                      </Text>
                    </TouchableOpacity>
                  </View>
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
                mediaType={editingMedia.mediaType || "photo"}
                onSave={async (editedData, captureRef) => {
                  try {
                    // Export edited media with capture function for photos
                    const exportedMedia = await exportEditedMedia(
                      editedData,
                      captureRef
                    );

                    // Mark media as edited so we don't process it again during upload
                    setIsMediaEdited(true);

                    // Update form with exported media
                    if (editedData.mediaType === "video") {
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
                    Alert.alert("Success", "Media edited and saved!");
                  } catch (error) {
                    Alert.alert(
                      "Error",
                      "Failed to export edited media: " + error.message
                    );
                  }
                }}
                onExport={async (editedData, captureRef) => {
                  try {
                    // Export edited media with capture function for photos
                    const exportedMedia = await exportEditedMedia(
                      editedData,
                      captureRef
                    );

                    // Mark media as edited so we don't process it again during upload
                    setIsMediaEdited(true);

                    // Update form with exported media
                    if (editedData.mediaType === "video") {
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
                    Alert.alert(
                      "Error",
                      "Failed to export edited media: " + error.message
                    );
                  }
                }}
              />
            )}

            {/* Photo Editor Modal */}
            <PhotoEditor
              visible={showPhotoEditor}
              onClose={() => {
                setShowPhotoEditor(false);
                setEditingPhotoUri(null);
              }}
              imageUri={editingPhotoUri}
              onSave={async (editedFile) => {
                try {
                  setIsMediaEdited(true);

                  // Convert edited image to base64 for display
                  let editedBase64 = null;
                  try {
                    if (editedFile.uri) {
                      const base64 = await FileSystem.readAsStringAsync(
                        editedFile.uri,
                        {
                          encoding: BASE64_ENCODING,
                        }
                      );
                      editedBase64 = `data:image/jpeg;base64,${base64}`;
                     
                    }
                  } catch (conversionError) {
                   
                  }

                  if (!editedBase64) {
                    Alert.alert("Error", "Failed to convert edited image");
                    return;
                  }

                  // IMPORTANT: Mark that we're manually setting base64 FIRST
                  // This prevents useEffect from overwriting our edited base64
                  manuallySetBase64Ref.current = true;

                  // Update the ref to prevent useEffect from running
                  lastConvertedUri.current = editedFile.uri;

                  // Mark that we're manually setting base64 (prevent useEffect from overwriting)
                  isConvertingRef.current = true;

                  // Update imageBase64 FIRST and wait for it to complete
                  // Use a promise to ensure state is updated
                  await new Promise((resolve) => {
                    setImageBase64(editedBase64);
                   
                    // Use requestAnimationFrame to ensure React has processed the state update
                    requestAnimationFrame(() => {
                      setTimeout(resolve, 150);
                    });
                  });

                  // Then update all other states
                  // Mark that adjustments are already baked into this image from PhotoEditor
                  const editedFileWithFlag = {
                    ...editedFile,
                    adjustmentsAlreadyApplied: true, // Flag to prevent re-applying adjustments
                    fromPhotoEditor: true, // Mark as coming from PhotoEditor
                  };
                  setEditedImage(editedFileWithFlag);

                  // IMPORTANT: Update originalImage too (like filter does)
                  // But keep manuallySetBase64Ref true so useEffect doesn't overwrite our base64
                  setOriginalImage(editedFileWithFlag);

                  setPhotoForm({
                    ...photoForm,
                    photo: editedFileWithFlag,
                  });

                  // Close editor AFTER state updates
                  setShowPhotoEditor(false);
                  setEditingPhotoUri(null);

                  // Force WebView re-render by updating the key with a unique value
                  // Use a counter that increments to ensure key always changes
                  setImageUpdateKey((prev) => {
                    const newKey = (prev || 0) + 1;
                    return newKey;
                  });

                  // Wait for React to process all state updates and re-render
                  await new Promise((resolve) => setTimeout(resolve, 300));

                  // Release the conversion lock after a delay (but keep manuallySetBase64Ref true)
                  setTimeout(() => {
                    isConvertingRef.current = false;
                    // Keep manuallySetBase64Ref true so useEffect doesn't overwrite
                    // It will be reset when a new image is selected
                  }, 2000);
                  Alert.alert("Success", "Photo edited and saved!");
                } catch (error) {
                  isConvertingRef.current = false;
                  manuallySetBase64Ref.current = false; // Reset on error
                  Alert.alert(
                    "Error",
                    "Failed to save edited photo: " + error.message
                  );
                }
              }}
            />
          </ImageBackground>
        </LinearGradient>
      </View>
    </SafeAreaView>
  );
};

export default Create;
