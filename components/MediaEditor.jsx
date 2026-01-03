import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  StyleSheet,
  Dimensions,
  Alert,
  ActivityIndicator,
  Platform,
  BackHandler,
  PanResponder,
} from 'react-native';
import { WebView } from 'react-native-webview';
import Slider from '@react-native-community/slider';
import { ResizeMode, Video } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { captureRef } from 'react-native-view-shot';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useGlobalContext } from '../context/GlobalProvider';
import { useTranslation } from 'react-i18next';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Filter CSS generator function
const getFilterCSS = (filterId) => {
  if (!filterId || filterId === 'none') {
    return 'none';
  }
  
  let filterCSS = '';
  
  switch (filterId) {
    // Instagram-style filters
    case 'wavy':
      filterCSS = 'brightness(1.05) contrast(0.95) saturate(0.85) hue-rotate(5deg)';
      break;
    case 'paris':
      filterCSS = 'brightness(1.08) contrast(1.1) saturate(1.15) hue-rotate(-10deg)';
      break;
    case 'losangeles':
      filterCSS = 'brightness(1.15) contrast(1.05) saturate(1.2) hue-rotate(15deg)';
      break;
    case 'oslo':
      filterCSS = 'brightness(0.95) contrast(1.1) saturate(0.9) hue-rotate(10deg)';
      break;
    case 'tokyo':
      filterCSS = 'brightness(1.1) contrast(1.15) saturate(1.1) hue-rotate(-5deg)';
      break;
    case 'london':
      filterCSS = 'brightness(0.9) contrast(1.2) saturate(0.95) hue-rotate(5deg)';
      break;
    case 'moscow':
      filterCSS = 'brightness(0.92) contrast(1.25) saturate(0.88) hue-rotate(-8deg)';
      break;
    case 'berlin':
      filterCSS = 'brightness(0.98) contrast(1.15) saturate(1.05) hue-rotate(12deg)';
      break;
    case 'rome':
      filterCSS = 'brightness(1.12) contrast(1.08) saturate(1.18) hue-rotate(-12deg)';
      break;
    case 'madrid':
      filterCSS = 'brightness(1.05) contrast(1.2) saturate(1.12) hue-rotate(8deg)';
      break;
    case 'amsterdam':
      filterCSS = 'brightness(1.08) contrast(1.05) saturate(1.1) hue-rotate(-15deg)';
      break;
    // Classic filters
    case 'vintage':
      filterCSS = 'brightness(1.1) contrast(0.9) saturate(0.8) sepia(0.2)';
      break;
    case 'blackwhite':
      filterCSS = 'grayscale(100%)';
      break;
    case 'sepia':
      filterCSS = 'sepia(1) brightness(1.1) contrast(0.9)';
      break;
    case 'cool':
      filterCSS = 'hue-rotate(30deg) saturate(0.9)';
      break;
    case 'warm':
      filterCSS = 'hue-rotate(-30deg) saturate(1.1)';
      break;
    case 'contrast':
      filterCSS = 'contrast(1.3)';
      break;
    case 'bright':
      filterCSS = 'brightness(1.2) contrast(1.1)';
      break;
    case 'dramatic':
      filterCSS = 'contrast(1.4) saturate(1.2) brightness(0.95)';
      break;
    case 'portrait':
      filterCSS = 'contrast(1.1) saturate(1.05) brightness(1.05)';
      break;
    case 'cinema':
      filterCSS = 'contrast(1.2) saturate(0.85) brightness(0.9)';
      break;
    case 'noir':
      filterCSS = 'grayscale(100%) contrast(1.3) brightness(0.9)';
      break;
    case 'vivid':
      filterCSS = 'saturate(1.3) contrast(1.2) brightness(1.05)';
      break;
    case 'fade':
      filterCSS = 'brightness(1.1) contrast(0.85) saturate(0.7)';
      break;
    case 'chrome':
      filterCSS = 'contrast(1.2) saturate(1.1) brightness(1.05)';
      break;
    case 'process':
      filterCSS = 'contrast(1.15) saturate(1.1) brightness(1.02)';
      break;
    default:
      filterCSS = 'none';
  }
  
  return filterCSS || 'none';
};

const FILTERS = [
  { id: 'none', name: 'Original' },
  { id: 'wavy', name: 'Wavy' },
  { id: 'paris', name: 'Paris' },
  { id: 'losangeles', name: 'Los Angeles' },
  { id: 'oslo', name: 'Oslo' },
  { id: 'tokyo', name: 'Tokyo' },
  { id: 'london', name: 'London' },
  { id: 'moscow', name: 'Moscow' },
  { id: 'berlin', name: 'Berlin' },
  { id: 'rome', name: 'Rome' },
  { id: 'madrid', name: 'Madrid' },
  { id: 'amsterdam', name: 'Amsterdam' },
  { id: 'vintage', name: 'Vintage' },
  { id: 'blackwhite', name: 'B&W' },
  { id: 'sepia', name: 'Sepia' },
  { id: 'cool', name: 'Cool' },
  { id: 'warm', name: 'Warm' },
  { id: 'contrast', name: 'Contrast' },
  { id: 'bright', name: 'Bright' },
  { id: 'dramatic', name: 'Dramatic' },
  { id: 'portrait', name: 'Portrait' },
  { id: 'cinema', name: 'Cinema' },
  { id: 'noir', name: 'Noir' },
  { id: 'vivid', name: 'Vivid' },
  { id: 'fade', name: 'Fade' },
  { id: 'chrome', name: 'Chrome' },
  { id: 'process', name: 'Process' },
];

// Available fonts
const TEXT_FONTS = [
  { id: 'Poppins-Regular', name: 'Regular' },
  { id: 'Poppins-Bold', name: 'Bold' },
  { id: 'Poppins-Light', name: 'Light' },
  { id: 'Poppins-Medium', name: 'Medium' },
  { id: 'Poppins-SemiBold', name: 'SemiBold' },
  { id: 'Poppins-ExtraBold', name: 'ExtraBold' },
  { id: 'Poppins-Thin', name: 'Thin' },
  { id: 'Poppins-Black', name: 'Black' },
];

// Text alignment options
const TEXT_ALIGNMENTS = [
  { id: 'left', name: 'Left' },
  { id: 'center', name: 'Center' },
  { id: 'right', name: 'Right' },
];

const STICKERS = [
  '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂',
  '❤️', '💕', '💖', '💗', '💓', '💞', '💝', '💘',
  '⭐', '🌟', '✨', '💫', '🔥', '💯', '👍', '👏',
  '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🥈', '🥉',
];

// Memoized Filter Button Component
const FilterButton = React.memo(({ filter, isSelected, onPress, theme }) => (
  <TouchableOpacity
    style={[
      styles.filterButton,
      isSelected && { backgroundColor: theme.accent }
    ]}
    onPress={onPress}
  >
    <Text style={[
      styles.filterButtonText,
      { color: isSelected ? '#fff' : theme.textPrimary }
    ]}>
      {filter.name}
    </Text>
  </TouchableOpacity>
));

// Memoized Sticker Item Component
const StickerItem = React.memo(({ emoji, onPress }) => (
  <TouchableOpacity
    style={styles.stickerItem}
    onPress={onPress}
  >
    <Text style={styles.stickerEmojiLarge}>{emoji}</Text>
  </TouchableOpacity>
));

const MediaEditor = ({ 
  visible, 
  onClose, 
  media, 
  mediaType, // 'video' or 'photo'
  onSave,
  onExport 
}) => {
  const { theme, isDarkMode } = useGlobalContext();
  const { t } = useTranslation();
  
  const [activeTab, setActiveTab] = useState('adjust'); // adjust, crop, stickers, text, draw, trim, music, transitions, clips
  const [selectedFilter, setSelectedFilter] = useState('none');
  const [filteredImageUri, setFilteredImageUri] = useState(null); // Store filtered image URI
  const [isApplyingFilter, setIsApplyingFilter] = useState(false); // Track filter application
  const [stickers, setStickers] = useState([]);
  const [texts, setTexts] = useState([]);
  const [drawingPaths, setDrawingPaths] = useState([]);
  const [drawingHistory, setDrawingHistory] = useState([]); // For undo/redo
  const [currentPath, setCurrentPath] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingColor, setDrawingColor] = useState('#FF0000');
  const [drawingWidth, setDrawingWidth] = useState(5);
  const [drawingOpacity, setDrawingOpacity] = useState(1);
  const [brushType, setBrushType] = useState('pen'); // pen, marker, neon, highlight
  const [isEraser, setIsEraser] = useState(false);
  const [videoStartTime, setVideoStartTime] = useState(0);
  const [videoEndTime, setVideoEndTime] = useState(60);
  const [selectedMusic, setSelectedMusic] = useState(null);
  const [videoSpeed, setVideoSpeed] = useState(1.0); // 0.25, 0.5, 1.0, 1.5, 2.0
  const [musicVolume, setMusicVolume] = useState(0.5); // 0 to 1
  const [audioFadeIn, setAudioFadeIn] = useState(false);
  const [audioFadeOut, setAudioFadeOut] = useState(false);
  const [audioDucking, setAudioDucking] = useState(false);
  
  // Phase 3: Video Transitions
  const [videoTransition, setVideoTransition] = useState('none'); // none, fade, crossfade, slide
  const [transitionDuration, setTransitionDuration] = useState(0.5); // 0.1 to 2.0 seconds
  
  // Phase 3: Multiple Video Clips
  const [videoClips, setVideoClips] = useState([]); // Array of video clips
  const [selectedClipIndex, setSelectedClipIndex] = useState(0);
  
  // Phase 3: Interactive Crop
  const [cropArea, setCropArea] = useState(null); // { x, y, width, height }
  const [isCropping, setIsCropping] = useState(false);
  
  const [isExporting, setIsExporting] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false); // Track when capturing to hide UI elements
  
  // Advanced Adjustments
  const [adjustments, setAdjustments] = useState({
    brightness: 0,      // -100 to 100
    contrast: 0,         // -100 to 100
    saturation: 0,       // -100 to 100
    warmth: 0,          // -100 to 100
    shadows: 0,         // -100 to 100
    highlights: 0,      // -100 to 100
    structure: 0,       // -100 to 100
    vignette: 0,       // 0 to 100
  });
  
  // Crop & Rotate
  const [showCrop, setShowCrop] = useState(false);
  const [cropData, setCropData] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [aspectRatio, setAspectRatio] = useState('free'); // free, 1:1, 4:5, 16:9, 4:3
  const [flipHorizontal, setFlipHorizontal] = useState(false);
  const [flipVertical, setFlipVertical] = useState(false);
  const [originalMediaUri, setOriginalMediaUri] = useState(null);
  
  const videoRef = useRef(null);
  const previewRef = useRef(null);
  const [videoDuration, setVideoDuration] = useState(60);
  const [filterThumbnails, setFilterThumbnails] = useState({}); // Cache for filter thumbnails
  const [imageBase64, setImageBase64] = useState(null); // Base64 encoded image for WebView
  const [isLoadingBase64, setIsLoadingBase64] = useState(false); // Track base64 loading state
  
  // Helper function to convert filter ID to ImageManipulator actions (for thumbnails only)
  // Note: ImageManipulator doesn't support brightness/contrast/saturation directly
  // So we use CSS filters via WebView for main preview
  const getFilterActions = useCallback((filterId) => {
    // Return empty array - we'll use CSS filters instead via WebView
    // This function is kept for thumbnail generation which uses a different approach
    return [];
  }, []);
  
  // Convert image to base64 for WebView and generate filter thumbnails
  useEffect(() => {
    const loadImageForWebView = async () => {
      if (!media || !media.uri || mediaType !== 'photo') {
        setFilterThumbnails({});
        setImageBase64(null);
        setIsLoadingBase64(false);
        return;
      }

      setIsLoadingBase64(true);
      try {
        // First, resize the image to a reasonable size for WebView (to reduce base64 size)
        const resized = await ImageManipulator.manipulateAsync(
          media.uri,
          [{ resize: { width: 800 } }], // Resize to max 800px width for performance
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
        );

        // Convert resized image to base64 for WebView
        const base64 = await FileSystem.readAsStringAsync(resized.uri, {
          encoding: 'base64',
        });
        const base64Uri = `data:image/jpeg;base64,${base64}`;
        setImageBase64(base64Uri);

        // For thumbnails, we'll use the base64 URI
        const thumbnails = {};
        FILTERS.forEach(filter => {
          thumbnails[filter.id] = base64Uri;
        });
        setFilterThumbnails(thumbnails);
      } catch (error) {
        console.log('Error converting image to base64:', error);
        // Fallback to original URI
        const thumbnails = {};
        FILTERS.forEach(filter => {
          thumbnails[filter.id] = media.uri;
        });
        setFilterThumbnails(thumbnails);
        setImageBase64(null);
      } finally {
        setIsLoadingBase64(false);
      }
    };

    if (visible && media && media.uri && mediaType === 'photo') {
      loadImageForWebView();
    } else {
      setFilterThumbnails({});
      setImageBase64(null);
      setIsLoadingBase64(false);
    }
  }, [media, mediaType, visible]);

  // Prevent back button from closing the modal
  useEffect(() => {
    if (visible) {
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        // Prevent default back button behavior
        return true;
      });

      return () => backHandler.remove();
    }
  }, [visible]);
  
  // Cleanup adjustment timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(adjustmentTimeoutRef.current).forEach(timeout => {
        if (timeout) clearTimeout(timeout);
      });
    };
  }, []);

  const themedColor = useCallback(
    (darkValue, lightValue) => (isDarkMode ? darkValue : lightValue),
    [isDarkMode]
  );

  // Early return if no media
  if (!media || !media.uri) {
    return null;
  }

  // Sticker position state
  const [selectedSticker, setSelectedSticker] = useState(null);
  const [selectedText, setSelectedText] = useState(null);
  
  // Add sticker
  const addSticker = (emoji) => {
    const newSticker = {
      id: Date.now(),
      emoji,
      x: SCREEN_WIDTH / 2 - 20,
      y: SCREEN_HEIGHT / 2 - 20,
      scale: 1,
      rotation: 0,
    };
    setStickers([...stickers, newSticker]);
    setSelectedSticker(newSticker.id);
  };
  
  // Update sticker position - using functional update to avoid stale state
  const updateStickerPosition = useCallback((stickerId, x, y) => {
    setStickers(prev => prev.map(s => 
      s.id === stickerId 
        ? { ...s, x: Math.max(0, Math.min(SCREEN_WIDTH - 40, x)), y: Math.max(0, Math.min(SCREEN_HEIGHT - 40, y)) }
        : s
    ));
  }, []);
  
  // Update sticker transform
  const updateStickerTransform = useCallback((stickerId, updates) => {
    setStickers(prev => prev.map(s => 
      s.id === stickerId 
        ? { 
            ...s, 
            scale: Math.max(0.5, Math.min(3, updates.scale !== undefined ? updates.scale : s.scale)),
            rotation: updates.rotation !== undefined ? updates.rotation : s.rotation,
          }
        : s
    ));
  }, []);

  // Store start positions for each sticker
  const stickerStartPositions = useRef({});
  
  // Store PanResponders in ref to avoid recreation
  const stickerPanRespondersRef = useRef({});
  
  // Create or get PanResponder for a sticker
  const getStickerPanResponder = useCallback((sticker) => {
    if (!stickerPanRespondersRef.current[sticker.id]) {
      stickerPanRespondersRef.current[sticker.id] = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const { pageX, pageY } = evt.nativeEvent;
          stickerStartPositions.current[sticker.id] = {
            startX: pageX - sticker.x,
            startY: pageY - sticker.y,
          };
          setSelectedSticker(sticker.id);
        },
        onPanResponderMove: (evt) => {
          const { pageX, pageY } = evt.nativeEvent;
          const startPos = stickerStartPositions.current[sticker.id];
          if (startPos) {
            const newX = pageX - startPos.startX;
            const newY = pageY - startPos.startY;
            updateStickerPosition(sticker.id, newX, newY);
          }
        },
        onPanResponderRelease: () => {
          delete stickerStartPositions.current[sticker.id];
          setSelectedSticker(null);
        },
        onPanResponderTerminate: () => {
          delete stickerStartPositions.current[sticker.id];
          setSelectedSticker(null);
        },
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
      });
    }
    return stickerPanRespondersRef.current[sticker.id];
  }, [updateStickerPosition]);
  
  // Clean up PanResponders for deleted stickers
  useEffect(() => {
    const currentIds = new Set(stickers.map(s => s.id));
    Object.keys(stickerPanRespondersRef.current).forEach(id => {
      if (!currentIds.has(parseInt(id))) {
        delete stickerPanRespondersRef.current[id];
      }
    });
  }, [stickers]);
  
  // Update text position - using functional update to avoid stale state
  const updateTextPosition = useCallback((textId, x, y) => {
    setTexts(prev => prev.map(t => 
      t.id === textId 
        ? { ...t, x: Math.max(0, Math.min(SCREEN_WIDTH - 100, x)), y: Math.max(0, Math.min(SCREEN_HEIGHT - 30, y)) }
        : t
    ));
  }, []);
  
  // Update text transform
  const updateTextTransform = useCallback((textId, updates) => {
    setTexts(prev => prev.map(t => 
      t.id === textId 
        ? { 
            ...t, 
            scale: Math.max(0.5, Math.min(3, updates.scale !== undefined ? updates.scale : t.scale)),
            rotation: updates.rotation !== undefined ? updates.rotation : t.rotation,
          }
        : t
    ));
  }, []);

  // Store start positions for each text
  const textStartPositions = useRef({});
  
  // Store PanResponders in ref to avoid recreation
  const textPanRespondersRef = useRef({});
  
  // Create or get PanResponder for a text (EXACTLY like stickers)
  const getTextPanResponder = useCallback((text) => {
    if (!textPanRespondersRef.current[text.id]) {
      textPanRespondersRef.current[text.id] = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          console.log('✅ Text PanResponder GRANT - text id:', text.id);
          const { pageX, pageY } = evt.nativeEvent;
          textStartPositions.current[text.id] = {
            startX: pageX - text.x,
            startY: pageY - text.y,
          };
          setSelectedText(text.id);
        },
        onPanResponderMove: (evt) => {
          console.log('🔄 Text PanResponder MOVE');
          const { pageX, pageY } = evt.nativeEvent;
          const startPos = textStartPositions.current[text.id];
          if (startPos) {
            const newX = pageX - startPos.startX;
            const newY = pageY - startPos.startY;
            console.log('📍 Moving text to:', newX, newY);
            updateTextPosition(text.id, newX, newY);
          }
        },
        onPanResponderRelease: () => {
          delete textStartPositions.current[text.id];
        },
        onPanResponderTerminate: () => {
          delete textStartPositions.current[text.id];
        },
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
      });
    }
    return textPanRespondersRef.current[text.id];
  }, [updateTextPosition]);
  
  // Clean up PanResponders for deleted texts
  useEffect(() => {
    const currentIds = new Set(texts.map(t => t.id));
    Object.keys(textPanRespondersRef.current).forEach(id => {
      if (!currentIds.has(parseInt(id))) {
        delete textPanRespondersRef.current[id];
      }
    });
  }, [texts]);

  // Text styles similar to Instagram
  const TEXT_STYLES = [
    { id: 'classic', name: 'Classic', fontFamily: 'System', fontWeight: 'normal', hasOutline: false, hasShadow: true },
    { id: 'modern', name: 'Modern', fontFamily: 'System', fontWeight: '600', hasOutline: false, hasShadow: false },
    { id: 'neon', name: 'Neon', fontFamily: 'System', fontWeight: 'bold', hasOutline: true, outlineColor: '#00FFFF', hasShadow: true, shadowColor: '#00FFFF' },
    { id: 'typewriter', name: 'Typewriter', fontFamily: 'Courier', fontWeight: 'normal', hasOutline: false, hasShadow: false },
    { id: 'strong', name: 'Strong', fontFamily: 'System', fontWeight: 'bold', hasOutline: false, hasShadow: true },
    { id: 'casual', name: 'Casual', fontFamily: 'System', fontWeight: '300', hasOutline: false, hasShadow: false },
    { id: 'elegant', name: 'Elegant', fontFamily: 'System', fontWeight: '300', hasOutline: false, hasShadow: true, shadowColor: 'rgba(0,0,0,0.3)' },
  ];

  // Add text
  const addText = () => {
    const newText = {
      id: Date.now(),
      text: 'Tap to edit',
      x: SCREEN_WIDTH / 2 - 50,
      y: SCREEN_HEIGHT / 2 - 15,
      fontSize: 24,
      color: '#FFFFFF',
      fontFamily: 'System',
      fontWeight: 'normal',
      textStyle: 'classic', // Track which style is applied
      rotation: 0,
      scale: 1,
      alignment: 'center',
      backgroundColor: null, // null, '#000000', '#FFFFFF', etc.
      backgroundOpacity: 0.5,
      hasOutline: false,
      outlineColor: '#000000',
      outlineWidth: 2,
      hasShadow: true,
      shadowColor: 'rgba(0,0,0,0.5)',
      shadowOffset: { width: 1, height: 1 },
      shadowBlur: 2,
    };
    setTexts([...texts, newText]);
    setSelectedText(newText.id); // Auto-select new text
  };

  // Apply text style
  const applyTextStyle = (textId, styleId) => {
    const style = TEXT_STYLES.find(s => s.id === styleId);
    if (!style) return;
    
    updateText(textId, {
      textStyle: styleId,
      fontFamily: style.fontFamily,
      fontWeight: style.fontWeight,
      hasOutline: style.hasOutline || false,
      outlineColor: style.outlineColor || '#000000',
      hasShadow: style.hasShadow !== undefined ? style.hasShadow : true,
      shadowColor: style.shadowColor || 'rgba(0,0,0,0.5)',
    });
  };

  // Update text
  const updateText = (id, updates) => {
    setTexts(texts.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  // Format time helper for video trimming
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
    }
    return `${secs}.${ms}`;
  };

  // Track activeTab, drawingColor, and drawingWidth in refs to access current values in PanResponder
  const activeTabRef = useRef(activeTab);
  const drawingColorRef = useRef(drawingColor);
  const drawingWidthRef = useRef(drawingWidth);
  const drawingOpacityRef = useRef(drawingOpacity);
  const isEraserRef = useRef(isEraser);
  
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);
  
  useEffect(() => {
    drawingColorRef.current = drawingColor;
  }, [drawingColor]);
  
  useEffect(() => {
    drawingWidthRef.current = drawingWidth;
  }, [drawingWidth]);
  
  useEffect(() => {
    drawingOpacityRef.current = drawingOpacity;
  }, [drawingOpacity]);
  
  useEffect(() => {
    isEraserRef.current = isEraser;
  }, [isEraser]);
  
  // Store original media URI when component mounts or media changes
  useEffect(() => {
    if (media && media.uri) {
      // Always update originalMediaUri when media changes
      setOriginalMediaUri(media.uri);
      setFilteredImageUri(null); // Reset filtered image when media changes
      setSelectedFilter('none'); // Reset filter selection when media changes
      
      // Reset video trim times when media changes
      if (mediaType === 'video') {
        setVideoStartTime(0);
        setVideoEndTime(60); // Will be updated when video loads
      }
    }
  }, [media?.uri]);

  // Get video duration when video loads
  useEffect(() => {
    if (mediaType === 'video' && videoRef.current && visible) {
      const loadVideoDuration = async () => {
        try {
          const status = await videoRef.current.getStatusAsync();
          if (status.isLoaded && status.durationMillis) {
            const durationSeconds = status.durationMillis / 1000;
            setVideoDuration(durationSeconds);
            setVideoEndTime(durationSeconds);
          }
        } catch (error) {
          console.log('Error getting video duration:', error);
        }
      };
      
      // Wait a bit for video to load
      const timer = setTimeout(loadVideoDuration, 500);
      return () => clearTimeout(timer);
    }
  }, [mediaType, visible, videoRef.current]);

  // Filters removed - no filter application needed
  
  // Debounced adjustment update to prevent excessive re-renders
  const adjustmentTimeoutRef = useRef({});
  const updateAdjustment = useCallback((key, value) => {
    // Clear existing timeout for this key
    if (adjustmentTimeoutRef.current[key]) {
      clearTimeout(adjustmentTimeoutRef.current[key]);
    }
    
    // Update immediately for UI feedback
    setAdjustments(prev => ({ ...prev, [key]: value }));
    
    // Debounce the actual processing (if needed for server updates)
    adjustmentTimeoutRef.current[key] = setTimeout(() => {
      // Any server-side updates can go here if needed
    }, 100);
  }, []);
  
  // Reset adjustments
  const resetAdjustments = useCallback(() => {
    setAdjustments({
      brightness: 0,
      contrast: 0,
      saturation: 0,
      warmth: 0,
      shadows: 0,
      highlights: 0,
      structure: 0,
      vignette: 0,
    });
  }, []);
  
  // Crop & Rotate functions
  const handleCrop = useCallback(async () => {
    if (!media || mediaType !== 'photo') return;
    
    try {
      const result = await ImageManipulator.manipulateAsync(
        media.uri,
        [
          { rotate: rotation },
          { flip: flipHorizontal ? ImageManipulator.FlipType.Horizontal : undefined },
          { flip: flipVertical ? ImageManipulator.FlipType.Vertical : undefined },
        ].filter(action => action.rotate !== undefined || action.flip !== undefined),
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );
      
      // Update media URI with cropped/rotated version
      const updatedMedia = { ...media, uri: result.uri };
      setCropData({ rotation, flipHorizontal, flipVertical });
      return updatedMedia;
    } catch (error) {
      console.error('Crop/Rotate error:', error);
      Alert.alert('Error', 'Failed to crop/rotate image');
      return media;
    }
  }, [media, rotation, flipHorizontal, flipVertical, mediaType]);
  
  const rotateImage = useCallback(async (degrees) => {
    if (!media || mediaType !== 'photo') return;
    setRotation(prev => (prev + degrees) % 360);
  }, [media, mediaType]);
  
  const flipImage = useCallback((direction) => {
    if (direction === 'horizontal') {
      setFlipHorizontal(prev => !prev);
    } else {
      setFlipVertical(prev => !prev);
    }
  }, []);
  
  // Drawing undo/redo
  const undoDrawing = useCallback(() => {
    if (drawingPaths.length > 0) {
      const lastPath = drawingPaths[drawingPaths.length - 1];
      setDrawingHistory(prev => [...prev, lastPath]);
      setDrawingPaths(prev => prev.slice(0, -1));
    }
  }, [drawingPaths]);
  
  const redoDrawing = useCallback(() => {
    if (drawingHistory.length > 0) {
      const lastHistory = drawingHistory[drawingHistory.length - 1];
      setDrawingPaths(prev => [...prev, lastHistory]);
      setDrawingHistory(prev => prev.slice(0, -1));
    }
  }, [drawingHistory]);
  
  // Brush types
  const brushTypes = [
    { id: 'pen', name: 'Pen' },
    { id: 'marker', name: 'Marker' },
    { id: 'neon', name: 'Neon' },
    { id: 'highlight', name: 'Highlight' },
  ];

  // Drawing PanResponder - prevents system gesture conflicts
  const drawingPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt, gestureState) => {
        return activeTabRef.current === 'draw';
      },
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return activeTabRef.current === 'draw';
      },
      onPanResponderGrant: (evt) => {
        if (activeTabRef.current === 'draw') {
          const { locationX, locationY } = evt.nativeEvent;
          setIsDrawing(true);
          setCurrentPath(`M${locationX},${locationY}`);
        }
      },
      onPanResponderMove: (evt) => {
        if (activeTabRef.current === 'draw') {
          const { locationX, locationY } = evt.nativeEvent;
          setCurrentPath(prev => {
            if (!prev) {
              return `M${locationX},${locationY}`;
            }
            return `${prev} L${locationX},${locationY}`;
          });
        }
      },
      onPanResponderRelease: () => {
        setCurrentPath(prev => {
          if (activeTabRef.current === 'draw' && prev) {
            const newPath = {
              id: Date.now(),
              path: prev,
              color: isEraserRef.current ? 'transparent' : drawingColorRef.current,
              width: drawingWidthRef.current,
              opacity: drawingOpacityRef.current,
              brushType: brushType,
              isEraser: isEraserRef.current,
            };
            setDrawingPaths(drawingPaths => [...drawingPaths, newPath]);
            setDrawingHistory([]); // Clear redo history when new drawing is made
          }
          setIsDrawing(false);
          return '';
        });
      },
      onPanResponderTerminate: () => {
        setIsDrawing(false);
        setCurrentPath('');
      },
      onPanResponderTerminationRequest: () => false, // Prevent system from taking over
      onShouldBlockNativeResponder: () => true, // Block native responder
    })
  ).current;

  // Delete element
  const deleteElement = (type, id) => {
    if (type === 'sticker') {
      setStickers(stickers.filter(s => s.id !== id));
    } else if (type === 'text') {
      setTexts(texts.filter(t => t.id !== id));
    } else if (type === 'drawing') {
      setDrawingPaths(drawingPaths.filter(d => d.id !== id));
    }
  };

  // Export edited media
  const handleExport = async () => {
    if (!media || !media.uri) {
      Alert.alert('Error', 'No media selected');
      return;
    }
    
    setIsExporting(true);
    try {
      // Use original media (filters removed)
      let finalMedia = media;
      
      // Apply crop/rotate if needed
      if (mediaType === 'photo' && (rotation !== 0 || flipHorizontal || flipVertical)) {
        finalMedia = await handleCrop();
      }
      
      const editedData = {
        media: finalMedia,
        mediaType,
        filter: selectedFilter,
        filterIntensity: 100,
        adjustments,
        crop: mediaType === 'photo' ? { rotation, flipHorizontal, flipVertical, aspectRatio } : null,
        stickers,
        texts,
        drawings: drawingPaths,
        videoTrim: mediaType === 'video' ? { start: videoStartTime, end: videoEndTime } : null,
        videoSpeed: mediaType === 'video' ? videoSpeed : null,
        videoTransition: mediaType === 'video' ? videoTransition : null,
        transitionDuration: mediaType === 'video' ? transitionDuration : null,
        videoClips: mediaType === 'video' && videoClips.length > 0 ? videoClips : null,
        cropArea: mediaType === 'photo' && cropArea ? cropArea : null,
        music: selectedMusic,
        musicVolume,
        audioFadeIn,
        audioFadeOut,
        audioDucking,
      };
      
      // For photos, capture the view with overlays using view-shot
      let captureFunction = null;
      if (mediaType === 'photo' && previewRef.current && (stickers.length > 0 || texts.length > 0 || drawingPaths.length > 0)) {
        captureFunction = async () => {
          try {
            // Hide delete buttons during capture
            setIsCapturing(true);
            
            // Wait for React to update the UI (hide delete buttons)
            // Use requestAnimationFrame to ensure the UI has updated
            await new Promise(resolve => {
              requestAnimationFrame(() => {
                setTimeout(resolve, 150); // Additional delay to ensure render completes
              });
            });
            
            const uri = await captureRef(previewRef, {
              format: 'jpg',
              quality: 0.9,
            });
            
            // Show delete buttons again after capture
            setIsCapturing(false);
            return uri;
          } catch (error) {
            console.log('Capture failed:', error);
            setIsCapturing(false);
            return null;
          }
        };
      }
      
      if (onExport) {
        await onExport(editedData, captureFunction);
      } else {
        // Default export logic
        await onSave(editedData, captureFunction);
      }
      
      Alert.alert('Success', 'Media exported successfully!');
      onClose();
    } catch (error) {
      Alert.alert('Error', 'Failed to export media: ' + error.message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={() => {
        // Only allow closing via Cancel button, not back gesture
        // This prevents accidental closes
      }}
      presentationStyle="fullScreen"
      hardwareAccelerated={true}
      statusBarTranslucent={false}
    >
      <GestureHandlerRootView style={{ flex: 1 }} shouldCancelWhenOutside={false}>
        <View 
          style={[styles.container, { backgroundColor: theme.background }]}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
        >
        {/* Header - Fixed at top with safe area */}
        <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border, paddingTop: 50 }]}>
          <TouchableOpacity onPress={onClose}>
            <Text style={[styles.headerButton, { color: theme.textPrimary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Edit Media</Text>
          <TouchableOpacity onPress={handleExport} disabled={isExporting}>
            {isExporting ? (
              <ActivityIndicator size="small" color={theme.accent} />
            ) : (
              <Text style={[styles.headerButton, { color: theme.accent }]}>Save</Text>
            )}
          </TouchableOpacity>
        </View>
        
        {/* Floating Save Button - Always visible */}
        <TouchableOpacity
          onPress={handleExport}
          disabled={isExporting}
          style={[styles.floatingSaveButton, { backgroundColor: theme.accent }]}
        >
          {isExporting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.floatingSaveButtonText}>Save</Text>
          )}
        </TouchableOpacity>

        {/* Media Preview */}
        <View 
          style={styles.previewContainer} 
          collapsable={false}
          onStartShouldSetResponder={() => false}
          onMoveShouldSetResponder={() => false}
          onResponderTerminationRequest={() => true}
        >
          <View ref={previewRef} collapsable={false} style={styles.previewWrapper}>
            {!media || !media.uri ? (
              <View style={[styles.media, { justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ color: theme.textSecondary }}>No media selected</Text>
              </View>
            ) : mediaType === 'video' ? (
              <Video
                ref={videoRef}
                source={{ uri: media.uri }}
                style={styles.media}
                useNativeControls={false}
                resizeMode={ResizeMode.COVER}
                isLooping
                shouldPlay={false}
                onLoad={(status) => {
                  if (status.isLoaded && status.durationMillis) {
                    const durationSeconds = status.durationMillis / 1000;
                    setVideoDuration(durationSeconds);
                    if (videoEndTime === 60 || videoEndTime > durationSeconds) {
                      setVideoEndTime(durationSeconds);
                    }
                  }
                }}
              />
            ) : (
              <View style={styles.media}>
                {imageBase64 ? (
                  <WebView
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
                              img {
                                width: 100%;
                                height: 100%;
                                object-fit: cover;
                                display: block;
                                filter: none;
                                transform: rotate(${rotation}deg) scaleX(${flipHorizontal ? -1 : 1}) scaleY(${flipVertical ? -1 : 1});
                              }
                            </style>
                          </head>
                          <body>
                            <img src="${imageBase64}" onerror="this.style.display='none'; document.body.innerHTML='<div style=\\'width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#fff;\\'>Image failed to load</div>';" />
                          </body>
                        </html>
                      `,
                    }}
                    style={styles.media}
                    scrollEnabled={false}
                    showsVerticalScrollIndicator={false}
                    showsHorizontalScrollIndicator={false}
                    bounces={false}
                    overScrollMode="never"
                    androidLayerType="hardware"
                    originWhitelist={['*']}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    onError={(syntheticEvent) => {
                      const { nativeEvent } = syntheticEvent;
                      console.log('WebView error: ', nativeEvent);
                    }}
                    onHttpError={(syntheticEvent) => {
                      const { nativeEvent } = syntheticEvent;
                      console.log('WebView HTTP error: ', nativeEvent);
                    }}
                    key={`preview-${selectedFilter}-${activeTab}`}
                  />
                ) : isLoadingBase64 ? (
                  <View style={[styles.media, { justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background }]}>
                    <ActivityIndicator size="large" color={theme.accent} />
                  </View>
                ) : (
                  <Image 
                    source={{ uri: media.uri }} 
                    style={[
                      styles.media,
                      {
                        transform: [
                          { rotate: `${rotation}deg` },
                          { scaleX: flipHorizontal ? -1 : 1 },
                          { scaleY: flipVertical ? -1 : 1 },
                        ],
                      }
                    ]} 
                    resizeMode="cover"
                  />
                )}
              </View>
            )}
            
            {/* Adjustment overlay for real-time preview - only show when adjustments tab is active */}
            {mediaType === 'photo' && activeTab === 'adjust' && Math.abs(adjustments.brightness) > 0 && (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    opacity: Math.abs(adjustments.brightness) / 200,
                    ...(adjustments.brightness > 0 
                      ? { backgroundColor: 'rgba(255, 255, 255, 0.3)' }
                      : { backgroundColor: 'rgba(0, 0, 0, 0.3)' }
                    ),
                  }
                ]}
                pointerEvents="none"
              />
            )}
          
          {/* Overlay for stickers, text, drawings */}
          <View
            style={styles.overlay}
            pointerEvents="box-none"
          >
            <GestureHandlerRootView 
              style={StyleSheet.absoluteFill} 
              pointerEvents="box-none"
              shouldCancelWhenOutside={false}
            >
            {/* Stickers - Draggable using PanResponder with Transform Gestures */}
            {stickers.map(sticker => {
              const panResponder = getStickerPanResponder(sticker);
              
              return (
                <Animated.View
                  key={sticker.id}
                  {...panResponder.panHandlers}
                  style={[
                    styles.stickerContainer,
                    {
                      left: sticker.x,
                      top: sticker.y,
                      transform: [
                        { scale: sticker.scale },
                        { rotate: `${sticker.rotation}deg` }
                      ],
                      zIndex: selectedSticker === sticker.id ? 1000 : 1,
                    }
                  ]}
                >
                  <Text style={styles.stickerEmoji}>{sticker.emoji}</Text>
                  {!isCapturing && selectedSticker === sticker.id && (
                    <>
                      <TouchableOpacity
                        style={[styles.transformButton, { top: -30, right: 0 }]}
                        onPress={() => updateStickerTransform(sticker.id, { scale: Math.min(3, sticker.scale + 0.1) })}
                      >
                        <Text style={styles.transformButtonText}>+</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.transformButton, { top: -30, right: 25 }]}
                        onPress={() => updateStickerTransform(sticker.id, { scale: Math.max(0.5, sticker.scale - 0.1) })}
                      >
                        <Text style={styles.transformButtonText}>−</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.transformButton, { top: -30, right: 50 }]}
                        onPress={() => updateStickerTransform(sticker.id, { rotation: sticker.rotation + 15 })}
                      >
                        <Text style={styles.transformButtonText}>↻</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          deleteElement('sticker', sticker.id);
                        }}
                      >
                        <Text style={styles.deleteButtonText}>×</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </Animated.View>
              );
            })}
            
            {/* Texts - Draggable using PanResponder (same as stickers) */}
            {texts.map(text => {
              const panResponder = getTextPanResponder(text);
              
              return (
                <Animated.View
                  key={text.id}
                  {...panResponder.panHandlers}
                  style={[
                    styles.textContainer,
                    {
                      left: text.x,
                      top: text.y,
                      transform: [
                        { scale: text.scale },
                        { rotate: `${text.rotation}deg` }
                      ],
                      zIndex: selectedText === text.id ? 1000 : 1,
                    }
                  ]}
                >
                  <View 
                    style={[
                      {
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        minHeight: 30,
                        width: '100%',
                      },
                      text.backgroundColor && {
                        backgroundColor: text.backgroundColor,
                        opacity: text.backgroundOpacity || 0.5,
                        borderRadius: 4,
                      }
                    ]}
                  >
                      {/* Outline layer (rendered behind main text) */}
                      {text.hasOutline && (
                        <Text
                          pointerEvents="none"
                          style={[
                            styles.textOverlay,
                            {
                              position: 'absolute',
                              fontSize: text.fontSize,
                              fontFamily: text.fontFamily,
                              textAlign: text.alignment || 'center',
                              color: text.outlineColor || '#000000',
                              textShadowColor: text.outlineColor || '#000000',
                              textShadowOffset: { width: (text.outlineWidth || 2) * 0.5, height: (text.outlineWidth || 2) * 0.5 },
                              textShadowRadius: (text.outlineWidth || 2) * 2,
                            }
                          ]}
                        >
                          {text.text}
                        </Text>
                      )}
                      {/* Main text */}
                      <Text
                        pointerEvents="none"
                        style={[
                          styles.textOverlay,
                          {
                            fontSize: text.fontSize,
                            color: text.color,
                            fontFamily: text.fontFamily || 'System',
                            fontWeight: text.fontWeight || 'normal',
                            textAlign: text.alignment || 'center',
                            // Text shadow
                            textShadowColor: text.hasShadow !== false ? (text.shadowColor || 'rgba(0,0,0,0.5)') : 'transparent',
                            textShadowOffset: text.hasShadow !== false ? (text.shadowOffset || { width: 1, height: 1 }) : { width: 0, height: 0 },
                            textShadowRadius: text.hasShadow !== false ? (text.shadowBlur || 2) : 0,
                          }
                        ]}
                      >
                        {text.text}
                      </Text>
                    </View>
                  {!isCapturing && selectedText === text.id && (
                    <>
                      <TouchableOpacity
                        style={[styles.transformButton, { top: -30, right: 0 }]}
                        onPress={() => updateTextTransform(text.id, { scale: Math.min(3, text.scale + 0.1) })}
                      >
                        <Text style={styles.transformButtonText}>+</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.transformButton, { top: -30, right: 25 }]}
                        onPress={() => updateTextTransform(text.id, { scale: Math.max(0.5, text.scale - 0.1) })}
                      >
                        <Text style={styles.transformButtonText}>−</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.transformButton, { top: -30, right: 50 }]}
                        onPress={() => updateTextTransform(text.id, { rotation: text.rotation + 15 })}
                      >
                        <Text style={styles.transformButtonText}>↻</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          deleteElement('text', text.id);
                        }}
                      >
                        <Text style={styles.deleteButtonText}>×</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </Animated.View>
              );
            })}
            
            {/* Drawings */}
            {mediaType === 'photo' && (
              <View
                style={StyleSheet.absoluteFill}
                pointerEvents={activeTab === 'draw' ? 'auto' : 'none'}
                {...drawingPanResponder.panHandlers}
              >
                <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
                  {drawingPaths.map(drawing => (
                    <Path
                      key={drawing.id}
                      d={drawing.path}
                      stroke={drawing.isEraser ? 'transparent' : drawing.color}
                      strokeWidth={drawing.width}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={drawing.opacity || 1}
                      strokeDasharray={drawing.brushType === 'neon' ? '5,5' : undefined}
                    />
                  ))}
                  {currentPath && (
                    <Path
                      d={currentPath}
                      stroke={isEraser ? 'transparent' : drawingColor}
                      strokeWidth={drawingWidth}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={drawingOpacity}
                      strokeDasharray={brushType === 'neon' ? '5,5' : undefined}
                    />
                  )}
                </Svg>
              </View>
            )}
            </GestureHandlerRootView>
          </View>
          </View>
        </View>

        {/* Toolbar - Instagram-style with icons */}
        <View style={[styles.toolbar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            contentContainerStyle={styles.toolbarContent}
          >
            <TouchableOpacity
              style={[
                styles.toolButtonNew, 
                activeTab === 'adjust' && { 
                  backgroundColor: theme.accent,
                  borderColor: theme.accent,
                },
                { borderColor: theme.border }
              ]}
              onPress={() => setActiveTab('adjust')}
            >
              <MaterialCommunityIcons 
                name="tune" 
                size={24} 
                color={activeTab === 'adjust' ? '#fff' : theme.textPrimary} 
              />
              <Text style={[
                styles.toolButtonTextNew, 
                { color: activeTab === 'adjust' ? '#fff' : theme.textPrimary }
              ]}>
                Adjust
              </Text>
            </TouchableOpacity>
            
            {mediaType === 'photo' && (
              <TouchableOpacity
                style={[
                  styles.toolButtonNew, 
                  activeTab === 'crop' && { 
                    backgroundColor: theme.accent,
                    borderColor: theme.accent,
                  },
                  { borderColor: theme.border }
                ]}
                onPress={() => setActiveTab('crop')}
              >
                <MaterialCommunityIcons 
                  name="crop" 
                  size={24} 
                  color={activeTab === 'crop' ? '#fff' : theme.textPrimary} 
                />
                <Text style={[
                  styles.toolButtonTextNew, 
                  { color: activeTab === 'crop' ? '#fff' : theme.textPrimary }
                ]}>
                  Crop
                </Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity
              style={[
                styles.toolButtonNew, 
                activeTab === 'stickers' && { 
                  backgroundColor: theme.accent,
                  borderColor: theme.accent,
                },
                { borderColor: theme.border }
              ]}
              onPress={() => setActiveTab('stickers')}
            >
              <MaterialCommunityIcons 
                name="emoticon-happy" 
                size={24} 
                color={activeTab === 'stickers' ? '#fff' : theme.textPrimary} 
              />
              <Text style={[
                styles.toolButtonTextNew, 
                { color: activeTab === 'stickers' ? '#fff' : theme.textPrimary }
              ]}>
                Stickers
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.toolButtonNew, 
                activeTab === 'text' && { 
                  backgroundColor: theme.accent,
                  borderColor: theme.accent,
                },
                { borderColor: theme.border }
              ]}
              onPress={() => setActiveTab('text')}
            >
              <MaterialCommunityIcons 
                name="format-text" 
                size={24} 
                color={activeTab === 'text' ? '#fff' : theme.textPrimary} 
              />
              <Text style={[
                styles.toolButtonTextNew, 
                { color: activeTab === 'text' ? '#fff' : theme.textPrimary }
              ]}>
                Text
              </Text>
            </TouchableOpacity>
            
            {mediaType === 'photo' && (
              <TouchableOpacity
                style={[
                  styles.toolButtonNew, 
                  activeTab === 'draw' && { 
                    backgroundColor: theme.accent,
                    borderColor: theme.accent,
                  },
                  { borderColor: theme.border }
                ]}
                onPress={() => setActiveTab('draw')}
              >
                <MaterialCommunityIcons 
                  name="draw-pen" 
                  size={24} 
                  color={activeTab === 'draw' ? '#fff' : theme.textPrimary} 
                />
                <Text style={[
                  styles.toolButtonTextNew, 
                  { color: activeTab === 'draw' ? '#fff' : theme.textPrimary }
                ]}>
                  Draw
                </Text>
              </TouchableOpacity>
            )}
            
            {mediaType === 'video' && (
              <>
                <TouchableOpacity
                  style={[
                    styles.toolButtonNew, 
                    activeTab === 'trim' && { 
                      backgroundColor: theme.accent,
                      borderColor: theme.accent,
                    },
                    { borderColor: theme.border }
                  ]}
                  onPress={() => setActiveTab('trim')}
                >
                  <MaterialCommunityIcons 
                    name="scissors-cutting" 
                    size={24} 
                    color={activeTab === 'trim' ? '#fff' : theme.textPrimary} 
                  />
                  <Text style={[
                    styles.toolButtonTextNew, 
                    { color: activeTab === 'trim' ? '#fff' : theme.textPrimary }
                  ]}>
                    Trim
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[
                    styles.toolButtonNew, 
                    activeTab === 'transitions' && { 
                      backgroundColor: theme.accent,
                      borderColor: theme.accent,
                    },
                    { borderColor: theme.border }
                  ]}
                  onPress={() => setActiveTab('transitions')}
                >
                  <MaterialCommunityIcons 
                    name="transition" 
                    size={24} 
                    color={activeTab === 'transitions' ? '#fff' : theme.textPrimary} 
                  />
                  <Text style={[
                    styles.toolButtonTextNew, 
                    { color: activeTab === 'transitions' ? '#fff' : theme.textPrimary }
                  ]}>
                    Transitions
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[
                    styles.toolButtonNew, 
                    activeTab === 'clips' && { 
                      backgroundColor: theme.accent,
                      borderColor: theme.accent,
                    },
                    { borderColor: theme.border }
                  ]}
                  onPress={() => setActiveTab('clips')}
                >
                  <MaterialCommunityIcons 
                    name="filmstrip" 
                    size={24} 
                    color={activeTab === 'clips' ? '#fff' : theme.textPrimary} 
                  />
                  <Text style={[
                    styles.toolButtonTextNew, 
                    { color: activeTab === 'clips' ? '#fff' : theme.textPrimary }
                  ]}>
                    Clips
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[
                    styles.toolButtonNew, 
                    activeTab === 'music' && { 
                      backgroundColor: theme.accent,
                      borderColor: theme.accent,
                    },
                    { borderColor: theme.border }
                  ]}
                  onPress={() => setActiveTab('music')}
                >
                  <MaterialCommunityIcons 
                    name="music" 
                    size={24} 
                    color={activeTab === 'music' ? '#fff' : theme.textPrimary} 
                  />
                  <Text style={[
                    styles.toolButtonTextNew, 
                    { color: activeTab === 'music' ? '#fff' : theme.textPrimary }
                  ]}>
                    Music
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>

        {/* Tool Panels */}
        <View style={[styles.panel, { backgroundColor: theme.surface }]}>
          {/* Active Tab Indicator */}
          <View style={styles.activeTabIndicator}>
            <View style={[styles.activeTabLine, { backgroundColor: theme.accent }]} />
          </View>
          {activeTab === 'adjust' && (
            <ScrollView style={styles.adjustPanel} showsVerticalScrollIndicator={false}>
              <View style={styles.adjustRow}>
                <View style={styles.adjustLabelContainer}>
                  <MaterialCommunityIcons name="brightness-6" size={20} color={theme.textPrimary} />
                  <Text style={[styles.adjustLabel, { color: theme.textPrimary }]}>Brightness</Text>
                </View>
                <View style={styles.sliderContainer}>
                  <Slider
                    style={styles.slider}
                    minimumValue={-100}
                    maximumValue={100}
                    value={adjustments.brightness}
                    onValueChange={(value) => updateAdjustment('brightness', value)}
                    minimumTrackTintColor={theme.accent}
                    maximumTrackTintColor={theme.border}
                    thumbTintColor={theme.accent}
                    thumbStyle={styles.sliderThumb}
                  />
                  <View style={styles.sliderValueContainer}>
                    <Text style={[styles.sliderValue, { color: theme.textPrimary }]}>
                      {Math.round(adjustments.brightness)}
                    </Text>
                  </View>
                </View>
              </View>
              
              <View style={styles.adjustRow}>
                <View style={styles.adjustLabelContainer}>
                  <MaterialCommunityIcons name="contrast-circle" size={20} color={theme.textPrimary} />
                  <Text style={[styles.adjustLabel, { color: theme.textPrimary }]}>Contrast</Text>
                </View>
                <View style={styles.sliderContainer}>
                  <Slider
                    style={styles.slider}
                    minimumValue={-100}
                    maximumValue={100}
                    value={adjustments.contrast}
                    onValueChange={(value) => updateAdjustment('contrast', value)}
                    minimumTrackTintColor={theme.accent}
                    maximumTrackTintColor={theme.border}
                    thumbTintColor={theme.accent}
                    thumbStyle={styles.sliderThumb}
                  />
                  <View style={styles.sliderValueContainer}>
                    <Text style={[styles.sliderValue, { color: theme.textPrimary }]}>
                      {Math.round(adjustments.contrast)}
                    </Text>
                  </View>
                </View>
              </View>
              
              <View style={styles.adjustRow}>
                <View style={styles.adjustLabelContainer}>
                  <MaterialCommunityIcons name="palette" size={20} color={theme.textPrimary} />
                  <Text style={[styles.adjustLabel, { color: theme.textPrimary }]}>Saturation</Text>
                </View>
                <View style={styles.sliderContainer}>
                  <Slider
                    style={styles.slider}
                    minimumValue={-100}
                    maximumValue={100}
                    value={adjustments.saturation}
                    onValueChange={(value) => updateAdjustment('saturation', value)}
                    minimumTrackTintColor={theme.accent}
                    maximumTrackTintColor={theme.border}
                    thumbTintColor={theme.accent}
                    thumbStyle={styles.sliderThumb}
                  />
                  <View style={styles.sliderValueContainer}>
                    <Text style={[styles.sliderValue, { color: theme.textPrimary }]}>
                      {Math.round(adjustments.saturation)}
                    </Text>
                  </View>
                </View>
              </View>
              
              <View style={styles.adjustRow}>
                <View style={styles.adjustLabelContainer}>
                  <MaterialCommunityIcons name="thermometer" size={20} color={theme.textPrimary} />
                  <Text style={[styles.adjustLabel, { color: theme.textPrimary }]}>Warmth</Text>
                </View>
                <View style={styles.sliderContainer}>
                  <Slider
                    style={styles.slider}
                    minimumValue={-100}
                    maximumValue={100}
                    value={adjustments.warmth}
                    onValueChange={(value) => updateAdjustment('warmth', value)}
                    minimumTrackTintColor={theme.accent}
                    maximumTrackTintColor={theme.border}
                    thumbTintColor={theme.accent}
                    thumbStyle={styles.sliderThumb}
                  />
                  <View style={styles.sliderValueContainer}>
                    <Text style={[styles.sliderValue, { color: theme.textPrimary }]}>
                      {Math.round(adjustments.warmth)}
                    </Text>
                  </View>
                </View>
              </View>
              
              <View style={styles.adjustRow}>
                <View style={styles.adjustLabelContainer}>
                  <MaterialCommunityIcons name="weather-night" size={20} color={theme.textPrimary} />
                  <Text style={[styles.adjustLabel, { color: theme.textPrimary }]}>Shadows</Text>
                </View>
                <View style={styles.sliderContainer}>
                  <Slider
                    style={styles.slider}
                    minimumValue={-100}
                    maximumValue={100}
                    value={adjustments.shadows}
                    onValueChange={(value) => updateAdjustment('shadows', value)}
                    minimumTrackTintColor={theme.accent}
                    maximumTrackTintColor={theme.border}
                    thumbTintColor={theme.accent}
                    thumbStyle={styles.sliderThumb}
                  />
                  <View style={styles.sliderValueContainer}>
                    <Text style={[styles.sliderValue, { color: theme.textPrimary }]}>
                      {Math.round(adjustments.shadows)}
                    </Text>
                  </View>
                </View>
              </View>
              
              <View style={styles.adjustRow}>
                <View style={styles.adjustLabelContainer}>
                  <MaterialCommunityIcons name="white-balance-sunny" size={20} color={theme.textPrimary} />
                  <Text style={[styles.adjustLabel, { color: theme.textPrimary }]}>Highlights</Text>
                </View>
                <View style={styles.sliderContainer}>
                  <Slider
                    style={styles.slider}
                    minimumValue={-100}
                    maximumValue={100}
                    value={adjustments.highlights}
                    onValueChange={(value) => updateAdjustment('highlights', value)}
                    minimumTrackTintColor={theme.accent}
                    maximumTrackTintColor={theme.border}
                    thumbTintColor={theme.accent}
                    thumbStyle={styles.sliderThumb}
                  />
                  <View style={styles.sliderValueContainer}>
                    <Text style={[styles.sliderValue, { color: theme.textPrimary }]}>
                      {Math.round(adjustments.highlights)}
                    </Text>
                  </View>
                </View>
              </View>
              
              <View style={styles.adjustRow}>
                <View style={styles.adjustLabelContainer}>
                  <MaterialCommunityIcons name="image-edit" size={20} color={theme.textPrimary} />
                  <Text style={[styles.adjustLabel, { color: theme.textPrimary }]}>Structure</Text>
                </View>
                <View style={styles.sliderContainer}>
                  <Slider
                    style={styles.slider}
                    minimumValue={-100}
                    maximumValue={100}
                    value={adjustments.structure}
                    onValueChange={(value) => updateAdjustment('structure', value)}
                    minimumTrackTintColor={theme.accent}
                    maximumTrackTintColor={theme.border}
                    thumbTintColor={theme.accent}
                    thumbStyle={styles.sliderThumb}
                  />
                  <View style={styles.sliderValueContainer}>
                    <Text style={[styles.sliderValue, { color: theme.textPrimary }]}>
                      {Math.round(adjustments.structure)}
                    </Text>
                  </View>
                </View>
              </View>
              
              <View style={styles.adjustRow}>
                <View style={styles.adjustLabelContainer}>
                  <MaterialCommunityIcons name="circle-outline" size={20} color={theme.textPrimary} />
                  <Text style={[styles.adjustLabel, { color: theme.textPrimary }]}>Vignette</Text>
                </View>
                <View style={styles.sliderContainer}>
                  <Slider
                    style={styles.slider}
                    minimumValue={0}
                    maximumValue={100}
                    value={adjustments.vignette}
                    onValueChange={(value) => updateAdjustment('vignette', value)}
                    minimumTrackTintColor={theme.accent}
                    maximumTrackTintColor={theme.border}
                    thumbTintColor={theme.accent}
                    thumbStyle={styles.sliderThumb}
                  />
                  <View style={styles.sliderValueContainer}>
                    <Text style={[styles.sliderValue, { color: theme.textPrimary }]}>
                      {Math.round(adjustments.vignette)}
                    </Text>
                  </View>
                </View>
              </View>
              
              <TouchableOpacity
                style={[styles.resetButton, { backgroundColor: theme.cardSoft, borderColor: theme.border }]}
                onPress={resetAdjustments}
              >
                <MaterialCommunityIcons name="restore" size={18} color={theme.textPrimary} />
                <Text style={[styles.resetButtonText, { color: theme.textPrimary }]}>Reset All</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {activeTab === 'crop' && mediaType === 'photo' && (
            <View style={styles.cropPanel}>
              <View style={styles.cropControls}>
                <TouchableOpacity
                  style={[styles.cropButton, { backgroundColor: theme.cardSoft }]}
                  onPress={() => rotateImage(-90)}
                >
                  <Text style={[styles.cropButtonText, { color: theme.textPrimary }]}>↺ Rotate Left</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.cropButton, { backgroundColor: theme.cardSoft }]}
                  onPress={() => rotateImage(90)}
                >
                  <Text style={[styles.cropButtonText, { color: theme.textPrimary }]}>↻ Rotate Right</Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.cropControls}>
                <TouchableOpacity
                  style={[styles.cropButton, { backgroundColor: theme.cardSoft }]}
                  onPress={() => flipImage('horizontal')}
                >
                  <Text style={[styles.cropButtonText, { color: theme.textPrimary }]}>↔ Flip H</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.cropButton, { backgroundColor: theme.cardSoft }]}
                  onPress={() => flipImage('vertical')}
                >
                  <Text style={[styles.cropButtonText, { color: theme.textPrimary }]}>↕ Flip V</Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.aspectRatioContainer}>
                <Text style={[styles.aspectRatioLabel, { color: theme.textSecondary }]}>Aspect Ratio:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.aspectRatioScroll}>
                  {['free', '1:1', '4:5', '16:9', '4:3'].map(ratio => (
                    <TouchableOpacity
                      key={ratio}
                      style={[
                        styles.aspectRatioButton,
                        { backgroundColor: aspectRatio === ratio ? theme.accent : theme.cardSoft },
                      ]}
                      onPress={() => setAspectRatio(ratio)}
                    >
                      <Text style={[
                        styles.aspectRatioButtonText,
                        { color: aspectRatio === ratio ? '#fff' : theme.textPrimary }
                      ]}>
                        {ratio}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              
              <Text style={[styles.cropInfo, { color: theme.textSecondary }]}>
                Rotation: {rotation}° | H: {flipHorizontal ? 'Yes' : 'No'} | V: {flipVertical ? 'Yes' : 'No'}
              </Text>
              
              {/* Interactive Crop Area Selection */}
              <View style={styles.interactiveCropSection}>
                <Text style={[styles.controlLabel, { color: theme.textPrimary, marginTop: 16, marginBottom: 8 }]}>
                  Crop Area
                </Text>
                <TouchableOpacity
                  style={[
                    styles.cropAreaToggle,
                    { backgroundColor: isCropping ? theme.accent : theme.cardSoft }
                  ]}
                  onPress={() => setIsCropping(!isCropping)}
                >
                  <Text style={[
                    styles.cropAreaToggleText,
                    { color: isCropping ? '#fff' : theme.textPrimary }
                  ]}>
                    {isCropping ? '✓ Crop Mode On' : 'Enable Crop Selection'}
                  </Text>
                </TouchableOpacity>
                {isCropping && (
                  <Text style={[styles.cropAreaInfo, { color: theme.textSecondary, fontSize: 12, marginTop: 8 }]}>
                    Drag on image to select crop area. Aspect ratio will be maintained.
                  </Text>
                )}
              </View>
            </View>
          )}

          {activeTab === 'stickers' && (
            <View>
              <View style={styles.sectionHeader}>
                <MaterialCommunityIcons name="emoticon-happy" size={20} color={theme.textPrimary} />
                <Text style={[styles.sectionHeaderText, { color: theme.textPrimary }]}>
                  Choose a Sticker
                </Text>
              </View>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.stickerScrollContent}
              >
                <View style={styles.stickerGrid}>
                  {STICKERS.map((emoji, index) => (
                    <StickerItem
                      key={index}
                      emoji={emoji}
                      onPress={() => addSticker(emoji)}
                    />
                  ))}
                </View>
              </ScrollView>
            </View>
          )}

          {activeTab === 'text' && (
            <ScrollView style={styles.textPanel} showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                style={[styles.addTextButton, { backgroundColor: theme.accent }]}
                onPress={addText}
              >
                <MaterialCommunityIcons name="format-text" size={20} color="#fff" />
                <Text style={styles.addTextButtonText}>Add Text</Text>
              </TouchableOpacity>
              
              {texts.map(text => (
                <View key={text.id} style={[styles.textEditor, { backgroundColor: theme.cardSoft, borderRadius: 12, padding: 12, marginBottom: 12 }]}>
                  <View style={styles.textEditorHeader}>
                    <Text style={[styles.textEditorTitle, { color: theme.textPrimary }]}>
                      Text {texts.indexOf(text) + 1}
                    </Text>
                    <TouchableOpacity
                      onPress={() => deleteElement('text', text.id)}
                      style={[styles.deleteTextButton, { backgroundColor: theme.error || '#FF3B30' }]}
                    >
                      <MaterialCommunityIcons name="delete" size={18} color="#fff" />
                    </TouchableOpacity>
                  </View>
                  
                  {/* Text Input - Large and visible */}
                  <TextInput
                    value={text.text}
                    onChangeText={(newText) => updateText(text.id, { text: newText })}
                    style={[
                      styles.textInputLarge, 
                      { 
                        color: theme.textPrimary, 
                        borderColor: theme.border,
                        backgroundColor: theme.background,
                        fontSize: 18,
                        minHeight: 50,
                        padding: 12,
                        borderRadius: 8,
                        marginBottom: 12,
                      }
                    ]}
                    placeholder="Type your text here..."
                    placeholderTextColor={theme.textSecondary}
                    multiline
                    autoFocus={selectedText === text.id}
                  />
                  
                  {/* Text Styles - Instagram-like */}
                  <View style={styles.textStylesSection}>
                    <Text style={[styles.controlLabel, { color: theme.textPrimary, marginBottom: 8 }]}>Style</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.textStylesScroll}>
                      {TEXT_STYLES.map(style => (
                        <TouchableOpacity
                          key={style.id}
                          style={[
                            styles.textStyleButton,
                            { 
                              backgroundColor: (text.textStyle || 'classic') === style.id ? theme.accent : theme.card,
                              borderColor: (text.textStyle || 'classic') === style.id ? theme.accent : theme.border,
                            }
                          ]}
                          onPress={() => applyTextStyle(text.id, style.id)}
                        >
                          <Text style={[
                            styles.textStyleButtonText,
                            { 
                              color: (text.textStyle || 'classic') === style.id ? '#fff' : theme.textPrimary,
                              fontFamily: style.fontFamily,
                              fontWeight: style.fontWeight,
                            }
                          ]}>
                            {style.name || style.id}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                  
                  {/* Color Picker */}
                  <View style={styles.colorPickerSection}>
                    <Text style={[styles.controlLabel, { color: theme.textPrimary, marginBottom: 8 }]}>Color</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.colorPickerScroll}>
                      {['#FFFFFF', '#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#FF69B4', '#8A2BE2', '#FF1493'].map(color => (
                        <TouchableOpacity
                          key={color}
                          style={[
                            styles.colorOption,
                            { backgroundColor: color },
                            text.color === color && styles.colorOptionSelected,
                            { borderColor: text.color === color ? theme.accent : theme.border }
                          ]}
                          onPress={() => updateText(text.id, { color })}
                        />
                      ))}
                    </ScrollView>
                  </View>
                  
                  {/* Font Size Control */}
                  <View style={styles.textControlRow}>
                    <Text style={[styles.controlLabel, { color: theme.textPrimary }]}>Size: {text.fontSize}</Text>
                    <Slider
                      style={styles.slider}
                      minimumValue={12}
                      maximumValue={72}
                      value={text.fontSize}
                      onValueChange={(size) => updateText(text.id, { fontSize: Math.round(size) })}
                      minimumTrackTintColor={theme.accent}
                      maximumTrackTintColor={theme.border}
                      thumbTintColor={theme.accent}
                    />
                  </View>
                  
                  {/* Alignment Options */}
                  <View style={styles.alignmentSection}>
                    <Text style={[styles.controlLabel, { color: theme.textPrimary, marginBottom: 8 }]}>Alignment</Text>
                    <View style={styles.alignmentButtons}>
                      {['left', 'center', 'right'].map(align => (
                        <TouchableOpacity
                          key={align}
                          style={[
                            styles.alignmentButton,
                            { 
                              backgroundColor: text.alignment === align ? theme.accent : theme.card,
                              borderColor: text.alignment === align ? theme.accent : theme.border,
                            }
                          ]}
                          onPress={() => updateText(text.id, { alignment: align })}
                        >
                          <MaterialCommunityIcons 
                            name={`format-align-${align}`} 
                            size={20} 
                            color={text.alignment === align ? '#fff' : theme.textPrimary} 
                          />
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  
                  {/* Background Toggle */}
                  <TouchableOpacity
                    style={[
                      styles.toggleButton,
                      { backgroundColor: text.backgroundColor ? theme.accent : theme.cardSoft }
                    ]}
                    onPress={() => updateText(text.id, { 
                      backgroundColor: text.backgroundColor ? null : '#000000',
                      backgroundOpacity: text.backgroundColor ? 0 : 0.5
                    })}
                  >
                    <MaterialCommunityIcons 
                      name={text.backgroundColor ? "format-color-fill" : "format-color-text"} 
                      size={18} 
                      color={text.backgroundColor ? '#fff' : theme.textPrimary} 
                    />
                    <Text style={[
                      styles.toggleButtonText,
                      { color: text.backgroundColor ? '#fff' : theme.textPrimary }
                    ]}>
                      {text.backgroundColor ? 'Background On' : 'Background Off'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}

          {activeTab === 'draw' && mediaType === 'photo' && (
            <ScrollView style={styles.drawPanel} showsVerticalScrollIndicator={false}>
              <View style={styles.brushTypeContainer}>
                <Text style={[styles.controlLabel, { color: theme.textSecondary }]}>Brush Type:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {brushTypes.map(type => (
                    <TouchableOpacity
                      key={type.id}
                      style={[
                        styles.brushTypeButton,
                        { backgroundColor: brushType === type.id ? theme.accent : theme.cardSoft },
                      ]}
                      onPress={() => {
                        setBrushType(type.id);
                        setIsEraser(false);
                      }}
                    >
                      <Text style={[
                        styles.brushTypeButtonText,
                        { color: brushType === type.id ? '#fff' : theme.textPrimary }
                      ]}>
                        {type.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              
              <TouchableOpacity
                style={[
                  styles.eraserButton,
                  { backgroundColor: isEraser ? theme.accent : theme.cardSoft },
                ]}
                onPress={() => {
                  setIsEraser(!isEraser);
                  if (!isEraser) setBrushType('pen');
                }}
              >
                <Text style={[
                  styles.eraserButtonText,
                  { color: isEraser ? '#fff' : theme.textPrimary }
                ]}>
                  {isEraser ? '✓ Eraser' : 'Eraser'}
                </Text>
              </TouchableOpacity>
              
              <View style={styles.colorPicker}>
                <Text style={[styles.controlLabel, { color: theme.textSecondary, marginBottom: 8 }]}>Colors:</Text>
                {['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#000000', '#FFFFFF', '#FFA500', '#800080'].map(color => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color },
                      drawingColor === color && !isEraser && styles.colorOptionSelected
                    ]}
                    onPress={() => {
                      setDrawingColor(color);
                      setIsEraser(false);
                    }}
                  />
                ))}
              </View>
              
              <View style={styles.widthControl}>
                <Text style={[styles.controlLabel, { color: theme.textSecondary }]}>Width: {drawingWidth}px</Text>
                <Slider
                  style={styles.slider}
                  minimumValue={1}
                  maximumValue={50}
                  value={drawingWidth}
                  onValueChange={setDrawingWidth}
                  minimumTrackTintColor={theme.accent}
                  maximumTrackTintColor={theme.border}
                  thumbTintColor={theme.accent}
                />
              </View>
              
              <View style={styles.widthControl}>
                <Text style={[styles.controlLabel, { color: theme.textSecondary }]}>Opacity: {Math.round(drawingOpacity * 100)}%</Text>
                <Slider
                  style={styles.slider}
                  minimumValue={0.1}
                  maximumValue={1}
                  value={drawingOpacity}
                  onValueChange={setDrawingOpacity}
                  minimumTrackTintColor={theme.accent}
                  maximumTrackTintColor={theme.border}
                  thumbTintColor={theme.accent}
                />
              </View>
              
              <View style={styles.drawActions}>
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: theme.cardSoft }]}
                  onPress={undoDrawing}
                  disabled={drawingPaths.length === 0}
                >
                  <Text style={[
                    styles.actionButtonText,
                    { color: drawingPaths.length === 0 ? theme.textSecondary : theme.textPrimary }
                  ]}>
                    Undo
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: theme.cardSoft }]}
                  onPress={redoDrawing}
                  disabled={drawingHistory.length === 0}
                >
                  <Text style={[
                    styles.actionButtonText,
                    { color: drawingHistory.length === 0 ? theme.textSecondary : theme.textPrimary }
                  ]}>
                    Redo
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: '#FF4444' }]}
                  onPress={() => {
                    setDrawingPaths([]);
                    setDrawingHistory([]);
                  }}
                >
                  <Text style={styles.actionButtonText}>Clear All</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

          {activeTab === 'trim' && mediaType === 'video' && (
            <ScrollView style={styles.trimPanel} showsVerticalScrollIndicator={false}>
              <Text style={[styles.controlLabel, { color: theme.textPrimary, marginBottom: 16, fontSize: 18, fontWeight: 'bold' }]}>
                Trim Video
              </Text>
              
              {/* Video Timeline Scrubber */}
              <View style={[styles.timelineContainer, { backgroundColor: theme.cardSoft, borderRadius: 12, padding: 16 }]}>
                <View style={styles.timelineWrapper}>
                  <View style={styles.timelineTrack}>
                    {/* Start handle */}
                    <View 
                      style={[
                        styles.timelineHandle, 
                        styles.timelineHandleStart,
                        { backgroundColor: theme.accent }
                      ]}
                    />
                    {/* Selected range */}
                    <View 
                      style={[
                        styles.timelineSelectedRange,
                        { 
                          backgroundColor: theme.accent + '40',
                          left: `${(videoStartTime / videoDuration) * 100}%`,
                          width: `${((videoEndTime - videoStartTime) / videoDuration) * 100}%`,
                        }
                      ]}
                    />
                    {/* End handle */}
                    <View 
                      style={[
                        styles.timelineHandle, 
                        styles.timelineHandleEnd,
                        { backgroundColor: theme.accent }
                      ]}
                    />
                  </View>
                </View>
                
                {/* Time labels */}
                <View style={styles.timelineLabels}>
                  <Text style={[styles.timelineLabel, { color: theme.textSecondary }]}>
                    {formatTime(videoStartTime)}
                  </Text>
                  <Text style={[styles.timelineLabel, { color: theme.textSecondary }]}>
                    {formatTime(videoEndTime)} / {formatTime(videoDuration)}
                  </Text>
                </View>
                
                {/* Duration display */}
                <View style={[styles.trimInfo, { backgroundColor: theme.background, marginTop: 12 }]}>
                  <Text style={[styles.controlLabel, { color: theme.textPrimary }]}>
                    Selected Duration: {formatTime(videoEndTime - videoStartTime)}
                  </Text>
                </View>
              </View>
              
              {/* Fine-tune controls */}
              <View style={styles.trimControls}>
                <View style={styles.trimControlRow}>
                  <View style={styles.trimControlLabel}>
                    <MaterialCommunityIcons name="play-circle-outline" size={20} color={theme.textPrimary} />
                    <Text style={[styles.controlLabel, { color: theme.textPrimary, marginLeft: 8 }]}>
                      Start Time: {formatTime(videoStartTime)}
                    </Text>
                  </View>
                  <View style={styles.trimButtons}>
                    <TouchableOpacity
                      style={[styles.trimButton, { backgroundColor: theme.cardSoft }]}
                      onPress={() => setVideoStartTime(Math.max(0, videoStartTime - 0.5))}
                    >
                      <Text style={{ color: theme.textPrimary }}>−0.5s</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.trimButton, { backgroundColor: theme.cardSoft }]}
                      onPress={() => setVideoStartTime(Math.max(0, videoStartTime - 0.1))}
                    >
                      <Text style={{ color: theme.textPrimary }}>−0.1s</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.trimButton, { backgroundColor: theme.cardSoft }]}
                      onPress={() => setVideoStartTime(Math.min(videoEndTime - 0.1, videoStartTime + 0.1))}
                    >
                      <Text style={{ color: theme.textPrimary }}>+0.1s</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.trimButton, { backgroundColor: theme.cardSoft }]}
                      onPress={() => setVideoStartTime(Math.min(videoEndTime - 0.5, videoStartTime + 0.5))}
                    >
                      <Text style={{ color: theme.textPrimary }}>+0.5s</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.trimControlRow}>
                  <View style={styles.trimControlLabel}>
                    <MaterialCommunityIcons name="stop-circle-outline" size={20} color={theme.textPrimary} />
                    <Text style={[styles.controlLabel, { color: theme.textPrimary, marginLeft: 8 }]}>
                      End Time: {formatTime(videoEndTime)}
                    </Text>
                  </View>
                  <View style={styles.trimButtons}>
                    <TouchableOpacity
                      style={[styles.trimButton, { backgroundColor: theme.cardSoft }]}
                      onPress={() => setVideoEndTime(Math.max(videoStartTime + 0.1, videoEndTime - 0.5))}
                    >
                      <Text style={{ color: theme.textPrimary }}>−0.5s</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.trimButton, { backgroundColor: theme.cardSoft }]}
                      onPress={() => setVideoEndTime(Math.max(videoStartTime + 0.1, videoEndTime - 0.1))}
                    >
                      <Text style={{ color: theme.textPrimary }}>−0.1s</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.trimButton, { backgroundColor: theme.cardSoft }]}
                      onPress={() => setVideoEndTime(Math.min(videoDuration, videoEndTime + 0.1))}
                    >
                      <Text style={{ color: theme.textPrimary }}>+0.1s</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.trimButton, { backgroundColor: theme.cardSoft }]}
                      onPress={() => setVideoEndTime(Math.min(videoDuration, videoEndTime + 0.5))}
                    >
                      <Text style={{ color: theme.textPrimary }}>+0.5s</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
              
              {/* Video Speed Control */}
              <View style={styles.speedControl}>
                <Text style={[styles.controlLabel, { color: theme.textPrimary, marginTop: 16, marginBottom: 8 }]}>
                  Playback Speed
                </Text>
                <View style={styles.speedButtons}>
                  {[0.25, 0.5, 1.0, 1.5, 2.0].map(speed => (
                    <TouchableOpacity
                      key={speed}
                      style={[
                        styles.speedButton,
                        { backgroundColor: videoSpeed === speed ? theme.accent : theme.cardSoft }
                      ]}
                      onPress={() => setVideoSpeed(speed)}
                    >
                      <Text style={[
                        styles.speedButtonText,
                        { color: videoSpeed === speed ? '#fff' : theme.textPrimary }
                      ]}>
                        {speed}x
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[styles.speedInfo, { color: theme.textSecondary }]}>
                  Current: {videoSpeed}x {videoSpeed < 1 ? '(Slow Motion)' : videoSpeed > 1 ? '(Fast Forward)' : '(Normal)'}
                </Text>
              </View>
            </ScrollView>
          )}

          {activeTab === 'music' && mediaType === 'video' && (
            <ScrollView style={styles.musicPanel} showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                style={[styles.musicButton, { backgroundColor: theme.accent }]}
                onPress={() => {
                  // Open music picker
                  Alert.alert('Music', 'Music selection will be implemented');
                }}
              >
                <Text style={styles.musicButtonText}>
                  {selectedMusic ? 'Change Music' : 'Add Music'}
                </Text>
              </TouchableOpacity>
              {selectedMusic && (
                <Text style={[styles.musicInfo, { color: theme.textSecondary, marginBottom: 16 }]}>
                  {selectedMusic.name}
                </Text>
              )}
              
              {/* Music Volume Control */}
              <View style={styles.audioControlRow}>
                <Text style={[styles.controlLabel, { color: theme.textPrimary }]}>Music Volume</Text>
                <View style={styles.sliderContainer}>
                  <Slider
                    style={styles.slider}
                    minimumValue={0}
                    maximumValue={1}
                    value={musicVolume}
                    onValueChange={setMusicVolume}
                    minimumTrackTintColor={theme.accent}
                    maximumTrackTintColor={theme.border}
                    thumbTintColor={theme.accent}
                  />
                  <Text style={[styles.sliderValue, { color: theme.textSecondary }]}>
                    {Math.round(musicVolume * 100)}%
                  </Text>
                </View>
              </View>
              
              {/* Audio Effects */}
              <View style={styles.audioEffects}>
                <Text style={[styles.controlLabel, { color: theme.textPrimary, marginBottom: 8 }]}>Audio Effects</Text>
                
                <TouchableOpacity
                  style={[
                    styles.audioEffectToggle,
                    { backgroundColor: audioFadeIn ? theme.accent : theme.cardSoft }
                  ]}
                  onPress={() => setAudioFadeIn(!audioFadeIn)}
                >
                  <Text style={[
                    styles.audioEffectToggleText,
                    { color: audioFadeIn ? '#fff' : theme.textPrimary }
                  ]}>
                    {audioFadeIn ? '✓ Fade In' : 'Fade In'}
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[
                    styles.audioEffectToggle,
                    { backgroundColor: audioFadeOut ? theme.accent : theme.cardSoft }
                  ]}
                  onPress={() => setAudioFadeOut(!audioFadeOut)}
                >
                  <Text style={[
                    styles.audioEffectToggleText,
                    { color: audioFadeOut ? '#fff' : theme.textPrimary }
                  ]}>
                    {audioFadeOut ? '✓ Fade Out' : 'Fade Out'}
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[
                    styles.audioEffectToggle,
                    { backgroundColor: audioDucking ? theme.accent : theme.cardSoft }
                  ]}
                  onPress={() => setAudioDucking(!audioDucking)}
                >
                  <Text style={[
                    styles.audioEffectToggleText,
                    { color: audioDucking ? '#fff' : theme.textPrimary }
                  ]}>
                    {audioDucking ? '✓ Audio Ducking' : 'Audio Ducking'}
                  </Text>
                </TouchableOpacity>
                
                {audioDucking && (
                  <Text style={[styles.audioEffectInfo, { color: theme.textSecondary }]}>
                    Original audio will be lowered when music plays
                  </Text>
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </View>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  headerButton: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  previewContainer: {
    flex: 1,
    position: 'relative',
  },
  previewWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  media: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  stickerContainer: {
    position: 'absolute',
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stickerEmoji: {
    fontSize: 30,
  },
  stickerEmojiLarge: {
    fontSize: 40,
  },
  textContainer: {
    position: 'absolute',
    minWidth: 100,
    minHeight: 30,
    padding: 8,
    backgroundColor: 'transparent',
  },
  textOverlay: {
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  deleteButton: {
    position: 'absolute',
    top: -10,
    right: -10,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FF0000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  toolbar: {
    borderTopWidth: 1,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  toolbarContent: {
    paddingHorizontal: 16,
    gap: 12,
    alignItems: 'center',
  },
  toolButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  toolButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  toolButtonNew: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    marginRight: 10,
    borderWidth: 2,
    backgroundColor: 'transparent',
    minWidth: 100,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  toolButtonTextNew: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 0,
  },
  panel: {
    padding: 20,
    maxHeight: 250,
    backgroundColor: 'transparent',
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  filterScrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  filterButtonNew: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginRight: 12,
    borderWidth: 2,
    backgroundColor: 'transparent',
    minWidth: 90,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  filterPreview: {
    width: 60,
    height: 60,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  filterButtonTextNew: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  filterButtonInstagram: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    paddingBottom: 8,
  },
  filterThumbnailContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'transparent',
    marginBottom: 8,
    position: 'relative',
    backgroundColor: '#f0f0f0',
  },
  filterThumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: 40,
  },
  filterSelectedIndicator: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  filterButtonTextInstagram: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 4,
  },
  filterPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  filterPlaceholderText: {
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
  },
  // Instagram-style filter UI
  instagramFilterContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  instagramFilterCarousel: {
    maxHeight: 120,
    marginBottom: 8,
  },
  instagramFilterScroll: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  instagramFilterItem: {
    alignItems: 'center',
    marginRight: 12,
    minWidth: 70,
  },
  instagramFilterThumbnail: {
    width: 70,
    height: 70,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    marginBottom: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  instagramFilterThumbnailSelected: {
    borderColor: '#0095F6',
    borderWidth: 3,
  },
  instagramFilterThumbnailImage: {
    width: '100%',
    height: '100%',
  },
  instagramFilterLabel: {
    fontSize: 12,
    fontWeight: '400',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  instagramFilterPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  instagramFilterActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  instagramFilterActionButton: {
    minWidth: 60,
  },
  instagramFilterActionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Poppins-SemiBold',
  },
  instagramFilterActionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Poppins-SemiBold',
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
  },
  stickerScrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  stickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  stickerItem: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  sectionHeaderText: {
    fontSize: 16,
    fontWeight: '600',
  },
  textPanel: {
    gap: 12,
    paddingBottom: 20,
  },
  addTextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  addTextButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  textEditor: {
    gap: 8,
  },
  textEditorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  textEditorTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  deleteTextButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    fontSize: 16,
  },
  textInputLarge: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 18,
    minHeight: 50,
  },
  textStylesSection: {
    marginBottom: 16,
  },
  textStylesScroll: {
    marginTop: 8,
  },
  textStyleButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 2,
    minWidth: 80,
    alignItems: 'center',
  },
  textStyleButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  colorPickerSection: {
    marginBottom: 16,
  },
  colorPickerScroll: {
    marginTop: 8,
    flexDirection: 'row',
  },
  textControlRow: {
    marginBottom: 16,
  },
  alignmentSection: {
    marginBottom: 16,
  },
  alignmentButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  alignmentButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 2,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  textControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  controlLabel: {
    fontSize: 14,
  },
  sizeInput: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 4,
    width: 60,
    textAlign: 'center',
  },
  drawPanel: {
    gap: 16,
  },
  colorPicker: {
    flexDirection: 'row',
    gap: 12,
  },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#fff',
  },
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: '#000',
  },
  widthControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clearButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  trimPanel: {
    gap: 12,
    paddingBottom: 20,
  },
  timelineContainer: {
    marginBottom: 20,
  },
  timelineWrapper: {
    width: '100%',
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineTrack: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    position: 'relative',
  },
  timelineSelectedRange: {
    position: 'absolute',
    height: 4,
    borderRadius: 2,
    top: 0,
  },
  timelineHandle: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    top: -8,
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  timelineHandleStart: {
    left: 0,
    transform: [{ translateX: -10 }],
  },
  timelineHandleEnd: {
    right: 0,
    transform: [{ translateX: 10 }],
  },
  timelineLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timelineLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  trimControls: {
    gap: 16,
  },
  trimControlRow: {
    gap: 12,
  },
  trimControlLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  musicPanel: {
    gap: 12,
  },
  musicButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  musicButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  musicInfo: {
    fontSize: 14,
    textAlign: 'center',
  },
  floatingSaveButton: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    zIndex: 1000,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  floatingSaveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  adjustPanel: {
    maxHeight: 300,
  },
  adjustRow: {
    marginBottom: 16,
  },
  adjustLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  adjustLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  slider: {
    flex: 1,
    height: 40,
  },
  sliderValueContainer: {
    minWidth: 50,
    alignItems: 'flex-end',
  },
  sliderValue: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
    marginTop: 12,
    borderWidth: 2,
    gap: 8,
  },
  resetButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  cropPanel: {
    gap: 16,
  },
  cropControls: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-around',
  },
  cropButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cropButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  aspectRatioContainer: {
    gap: 8,
  },
  aspectRatioLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  aspectRatioScroll: {
    marginTop: 8,
  },
  aspectRatioButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  aspectRatioButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  cropInfo: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  brushTypeContainer: {
    marginBottom: 16,
  },
  brushTypeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  brushTypeButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  eraserButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  eraserButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  drawActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  transformButton: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#7f5af0',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1001,
  },
  transformButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  filterIntensityContainer: {
    marginTop: 16,
    paddingTop: 16,
    paddingHorizontal: 16,
    borderTopWidth: 1,
  },
  filterIntensityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  filterIntensityLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  sliderThumb: {
    width: 20,
    height: 20,
  },
  fontScroll: {
    marginTop: 8,
  },
  fontButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
  },
  fontButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
  alignmentContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  alignmentButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  alignmentButtonText: {
    fontSize: 16,
  },
  colorScroll: {
    marginTop: 8,
    flexDirection: 'row',
  },
  colorOptionSmall: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#fff',
    marginRight: 8,
  },
  backgroundControls: {
    flexDirection: 'column',
    gap: 8,
    marginTop: 8,
  },
  backgroundToggle: {
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    width: 100,
  },
  backgroundToggleText: {
    fontSize: 14,
    fontWeight: '600',
  },
  outlineControls: {
    marginTop: 8,
    gap: 8,
  },
  effectToggle: {
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    width: 120,
    marginRight: 8,
  },
  effectToggleText: {
    fontSize: 14,
    fontWeight: '600',
  },
  speedControl: {
    marginTop: 16,
  },
  speedButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  speedButton: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  speedButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  speedInfo: {
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  audioControlRow: {
    marginTop: 16,
    marginBottom: 16,
  },
  audioEffects: {
    gap: 12,
  },
  audioEffectToggle: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  audioEffectToggleText: {
    fontSize: 14,
    fontWeight: '600',
  },
  audioEffectInfo: {
    fontSize: 12,
    marginTop: 4,
    fontStyle: 'italic',
  },
  transitionsPanel: {
    maxHeight: 300,
  },
  transitionOptions: {
    marginBottom: 16,
  },
  transitionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  transitionButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  transitionDurationControl: {
    marginTop: 16,
  },
  transitionInfo: {
    marginTop: 4,
  },
  transitionPreview: {
    marginTop: 16,
  },
  transitionPreviewText: {
    fontSize: 12,
    textAlign: 'center',
  },
  clipsPanel: {
    maxHeight: 300,
  },
  addClipButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  addClipButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  clipsList: {
    marginTop: 16,
  },
  clipItem: {
    borderRadius: 8,
    marginBottom: 8,
    overflow: 'hidden',
  },
  clipItemContent: {
    padding: 12,
  },
  clipItemText: {
    fontSize: 14,
    fontWeight: '500',
  },
  clipTrimControls: {
    marginTop: 8,
    gap: 8,
  },
  clipTrimLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  clipTrimButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  clipTrimButton: {
    padding: 6,
    borderRadius: 4,
  },
  clipDeleteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FF4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clipDeleteButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  clipsInfo: {
    marginTop: 16,
  },
  clipsInfoText: {
    fontSize: 12,
    textAlign: 'center',
  },
  interactiveCropSection: {
    marginTop: 16,
  },
  cropAreaToggle: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cropAreaToggleText: {
    fontSize: 14,
    fontWeight: '600',
  },
  cropAreaInfo: {
    marginTop: 8,
  },
  activeTabIndicator: {
    alignItems: 'center',
    marginBottom: 12,
  },
  activeTabLine: {
    width: 40,
    height: 3,
    borderRadius: 2,
  },
});

export default MediaEditor;

