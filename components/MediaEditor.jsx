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
import { ResizeMode, Video } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import { captureRef } from 'react-native-view-shot';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useGlobalContext } from '../context/GlobalProvider';
import { useTranslation } from 'react-i18next';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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

const STICKERS = [
  '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂',
  '❤️', '💕', '💖', '💗', '💓', '💞', '💝', '💘',
  '⭐', '🌟', '✨', '💫', '🔥', '💯', '👍', '👏',
  '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🥈', '🥉',
];

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
  
  const [activeTab, setActiveTab] = useState('filters'); // filters, stickers, text, draw, trim, music
  const [selectedFilter, setSelectedFilter] = useState('none');
  const [stickers, setStickers] = useState([]);
  const [texts, setTexts] = useState([]);
  const [drawingPaths, setDrawingPaths] = useState([]);
  const [currentPath, setCurrentPath] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingColor, setDrawingColor] = useState('#FF0000');
  const [drawingWidth, setDrawingWidth] = useState(5);
  const [videoStartTime, setVideoStartTime] = useState(0);
  const [videoEndTime, setVideoEndTime] = useState(60);
  const [selectedMusic, setSelectedMusic] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false); // Track when capturing to hide UI elements
  
  const videoRef = useRef(null);
  const previewRef = useRef(null);
  const [videoDuration, setVideoDuration] = useState(60);

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

  // Store start positions for each sticker
  const stickerStartPositions = useRef({});
  
  // Create PanResponder for stickers - this prevents system gesture conflicts
  const createStickerPanResponder = useCallback((sticker) => {
    return PanResponder.create({
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
      onPanResponderMove: (evt, gestureState) => {
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
      onPanResponderTerminationRequest: () => false, // Prevent system from taking over
      onShouldBlockNativeResponder: () => true, // Block native responder
    });
  }, [updateStickerPosition]);
  
  // Update text position - using functional update to avoid stale state
  const updateTextPosition = useCallback((textId, x, y) => {
    setTexts(prev => prev.map(t => 
      t.id === textId 
        ? { ...t, x: Math.max(0, Math.min(SCREEN_WIDTH - 100, x)), y: Math.max(0, Math.min(SCREEN_HEIGHT - 30, y)) }
        : t
    ));
  }, []);

  // Store start positions for each text
  const textStartPositions = useRef({});
  
  // Create PanResponder for texts - this prevents system gesture conflicts
  const createTextPanResponder = useCallback((text) => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { pageX, pageY } = evt.nativeEvent;
        textStartPositions.current[text.id] = {
          startX: pageX - text.x,
          startY: pageY - text.y,
        };
        setSelectedText(text.id);
      },
      onPanResponderMove: (evt, gestureState) => {
        const { pageX, pageY } = evt.nativeEvent;
        const startPos = textStartPositions.current[text.id];
        if (startPos) {
          const newX = pageX - startPos.startX;
          const newY = pageY - startPos.startY;
          updateTextPosition(text.id, newX, newY);
        }
      },
      onPanResponderRelease: () => {
        delete textStartPositions.current[text.id];
        setSelectedText(null);
      },
      onPanResponderTerminate: () => {
        delete textStartPositions.current[text.id];
        setSelectedText(null);
      },
      onPanResponderTerminationRequest: () => false, // Prevent system from taking over
      onShouldBlockNativeResponder: () => true, // Block native responder
    });
  }, [updateTextPosition]);

  // Add text
  const addText = () => {
    const newText = {
      id: Date.now(),
      text: 'Tap to edit',
      x: SCREEN_WIDTH / 2 - 50,
      y: SCREEN_HEIGHT / 2 - 15,
      fontSize: 24,
      color: '#FFFFFF',
      fontFamily: 'Poppins-Bold',
      rotation: 0,
      scale: 1,
    };
    setTexts([...texts, newText]);
  };

  // Update text
  const updateText = (id, updates) => {
    setTexts(texts.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  // Track activeTab, drawingColor, and drawingWidth in refs to access current values in PanResponder
  const activeTabRef = useRef(activeTab);
  const drawingColorRef = useRef(drawingColor);
  const drawingWidthRef = useRef(drawingWidth);
  
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);
  
  useEffect(() => {
    drawingColorRef.current = drawingColor;
  }, [drawingColor]);
  
  useEffect(() => {
    drawingWidthRef.current = drawingWidth;
  }, [drawingWidth]);

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
            setDrawingPaths(drawingPaths => [
              ...drawingPaths,
              {
                id: Date.now(),
                path: prev,
                color: drawingColorRef.current,
                width: drawingWidthRef.current,
              }
            ]);
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
      const editedData = {
        media,
        mediaType,
        filter: selectedFilter,
        stickers,
        texts,
        drawings: drawingPaths,
        videoTrim: mediaType === 'video' ? { start: videoStartTime, end: videoEndTime } : null,
        music: selectedMusic,
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
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={() => {
            // Prevent system gestures when touching preview area
          }}
          onResponderTerminationRequest={() => false}
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
              />
            ) : (
              <Image source={{ uri: media.uri }} style={styles.media} resizeMode="cover" />
            )}
          
          {/* Overlay for stickers, text, drawings */}
          <View
            style={styles.overlay}
            pointerEvents="box-none"
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderTerminationRequest={() => false}
            onShouldBlockNativeResponder={() => true}
          >
            <GestureHandlerRootView 
              style={StyleSheet.absoluteFill} 
              pointerEvents="box-none"
              shouldCancelWhenOutside={false}
            >
            {/* Stickers - Draggable using PanResponder */}
            {stickers.map(sticker => {
              const panResponder = createStickerPanResponder(sticker);
              
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
                  {!isCapturing && (
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        deleteElement('sticker', sticker.id);
                      }}
                    >
                      <Text style={styles.deleteButtonText}>×</Text>
                    </TouchableOpacity>
                  )}
                </Animated.View>
              );
            })}
            
            {/* Texts - Draggable using PanResponder */}
            {texts.map(text => {
              const textPanResponder = createTextPanResponder(text);
              
              return (
                <Animated.View
                  key={text.id}
                  {...textPanResponder.panHandlers}
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
                  <Text
                    style={[
                      styles.textOverlay,
                      {
                        fontSize: text.fontSize,
                        color: text.color,
                        fontFamily: text.fontFamily,
                      }
                    ]}
                  >
                    {text.text}
                  </Text>
                  {!isCapturing && (
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        deleteElement('text', text.id);
                      }}
                    >
                      <Text style={styles.deleteButtonText}>×</Text>
                    </TouchableOpacity>
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
                      stroke={drawing.color}
                      strokeWidth={drawing.width}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                  {currentPath && (
                    <Path
                      d={currentPath}
                      stroke={drawingColor}
                      strokeWidth={drawingWidth}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                </Svg>
              </View>
            )}
            </GestureHandlerRootView>
          </View>
          </View>
        </View>

        {/* Toolbar */}
        <View style={[styles.toolbar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbarContent}>
            <TouchableOpacity
              style={[styles.toolButton, activeTab === 'filters' && { backgroundColor: theme.accent }]}
              onPress={() => setActiveTab('filters')}
            >
              <Text style={[styles.toolButtonText, { color: activeTab === 'filters' ? '#fff' : theme.textPrimary }]}>
                Filters
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.toolButton, activeTab === 'stickers' && { backgroundColor: theme.accent }]}
              onPress={() => setActiveTab('stickers')}
            >
              <Text style={[styles.toolButtonText, { color: activeTab === 'stickers' ? '#fff' : theme.textPrimary }]}>
                Stickers
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.toolButton, activeTab === 'text' && { backgroundColor: theme.accent }]}
              onPress={() => setActiveTab('text')}
            >
              <Text style={[styles.toolButtonText, { color: activeTab === 'text' ? '#fff' : theme.textPrimary }]}>
                Text
              </Text>
            </TouchableOpacity>
            
            {mediaType === 'photo' && (
              <TouchableOpacity
                style={[styles.toolButton, activeTab === 'draw' && { backgroundColor: theme.accent }]}
                onPress={() => setActiveTab('draw')}
              >
                <Text style={[styles.toolButtonText, { color: activeTab === 'draw' ? '#fff' : theme.textPrimary }]}>
                  Draw
                </Text>
              </TouchableOpacity>
            )}
            
            {mediaType === 'video' && (
              <>
                <TouchableOpacity
                  style={[styles.toolButton, activeTab === 'trim' && { backgroundColor: theme.accent }]}
                  onPress={() => setActiveTab('trim')}
                >
                  <Text style={[styles.toolButtonText, { color: activeTab === 'trim' ? '#fff' : theme.textPrimary }]}>
                    Trim
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.toolButton, activeTab === 'music' && { backgroundColor: theme.accent }]}
                  onPress={() => setActiveTab('music')}
                >
                  <Text style={[styles.toolButtonText, { color: activeTab === 'music' ? '#fff' : theme.textPrimary }]}>
                    Music
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>

        {/* Tool Panels */}
        <View style={[styles.panel, { backgroundColor: theme.surface }]}>
          {activeTab === 'filters' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {FILTERS.map(filter => (
                <TouchableOpacity
                  key={filter.id}
                  style={[
                    styles.filterButton,
                    selectedFilter === filter.id && { backgroundColor: theme.accent }
                  ]}
                  onPress={() => setSelectedFilter(filter.id)}
                >
                  <Text style={[
                    styles.filterButtonText,
                    { color: selectedFilter === filter.id ? '#fff' : theme.textPrimary }
                  ]}>
                    {filter.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {activeTab === 'stickers' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.stickerGrid}>
                {STICKERS.map((emoji, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.stickerItem}
                    onPress={() => addSticker(emoji)}
                  >
                    <Text style={styles.stickerEmojiLarge}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          )}

          {activeTab === 'text' && (
            <View style={styles.textPanel}>
              <TouchableOpacity
                style={[styles.addTextButton, { backgroundColor: theme.accent }]}
                onPress={addText}
              >
                <Text style={styles.addTextButtonText}>Add Text</Text>
              </TouchableOpacity>
              {texts.map(text => (
                <View key={text.id} style={styles.textEditor}>
                  <TextInput
                    value={text.text}
                    onChangeText={(newText) => updateText(text.id, { text: newText })}
                    style={[styles.textInput, { color: theme.textPrimary, borderColor: theme.border }]}
                    placeholder="Enter text"
                    placeholderTextColor={theme.textSecondary}
                  />
                  <View style={styles.textControls}>
                    <Text style={[styles.controlLabel, { color: theme.textSecondary }]}>Size:</Text>
                    <TextInput
                      value={text.fontSize.toString()}
                      onChangeText={(size) => updateText(text.id, { fontSize: parseInt(size) || 24 })}
                      style={[styles.sizeInput, { color: theme.textPrimary, borderColor: theme.border }]}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              ))}
            </View>
          )}

          {activeTab === 'draw' && mediaType === 'photo' && (
            <View style={styles.drawPanel}>
              <View style={styles.colorPicker}>
                {['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#000000', '#FFFFFF'].map(color => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color },
                      drawingColor === color && styles.colorOptionSelected
                    ]}
                    onPress={() => setDrawingColor(color)}
                  />
                ))}
              </View>
              <View style={styles.widthControl}>
                <Text style={[styles.controlLabel, { color: theme.textSecondary }]}>Width:</Text>
                <TextInput
                  value={drawingWidth.toString()}
                  onChangeText={(width) => setDrawingWidth(parseInt(width) || 5)}
                  style={[styles.sizeInput, { color: theme.textPrimary, borderColor: theme.border }]}
                  keyboardType="numeric"
                />
              </View>
              <TouchableOpacity
                style={[styles.clearButton, { backgroundColor: theme.cardSoft }]}
                onPress={() => setDrawingPaths([])}
              >
                <Text style={[styles.clearButtonText, { color: theme.textPrimary }]}>Clear All</Text>
              </TouchableOpacity>
            </View>
          )}

          {activeTab === 'trim' && mediaType === 'video' && (
            <View style={styles.trimPanel}>
              <Text style={[styles.controlLabel, { color: theme.textPrimary, marginBottom: 8 }]}>
                Trim Video
              </Text>
              <View style={styles.trimControls}>
                <View style={styles.trimControlRow}>
                  <Text style={[styles.controlLabel, { color: theme.textSecondary, fontSize: 12 }]}>
                    Start: {videoStartTime.toFixed(1)}s
                  </Text>
                  <View style={styles.trimButtons}>
                    <TouchableOpacity
                      style={[styles.trimButton, { backgroundColor: theme.cardSoft }]}
                      onPress={() => setVideoStartTime(Math.max(0, videoStartTime - 1))}
                    >
                      <Text style={{ color: theme.textPrimary }}>−1s</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.trimButton, { backgroundColor: theme.cardSoft }]}
                      onPress={() => setVideoStartTime(Math.min(videoEndTime - 1, videoStartTime + 1))}
                    >
                      <Text style={{ color: theme.textPrimary }}>+1s</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.trimControlRow}>
                  <Text style={[styles.controlLabel, { color: theme.textSecondary, fontSize: 12 }]}>
                    End: {videoEndTime.toFixed(1)}s
                  </Text>
                  <View style={styles.trimButtons}>
                    <TouchableOpacity
                      style={[styles.trimButton, { backgroundColor: theme.cardSoft }]}
                      onPress={() => setVideoEndTime(Math.max(videoStartTime + 1, videoEndTime - 1))}
                    >
                      <Text style={{ color: theme.textPrimary }}>−1s</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.trimButton, { backgroundColor: theme.cardSoft }]}
                      onPress={() => setVideoEndTime(Math.min(videoDuration, videoEndTime + 1))}
                    >
                      <Text style={{ color: theme.textPrimary }}>+1s</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={[styles.trimInfo, { backgroundColor: theme.cardSoft }]}>
                  <Text style={[styles.controlLabel, { color: theme.textPrimary }]}>
                    Duration: {(videoEndTime - videoStartTime).toFixed(1)}s
                  </Text>
                </View>
              </View>
            </View>
          )}

          {activeTab === 'music' && mediaType === 'video' && (
            <View style={styles.musicPanel}>
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
                <Text style={[styles.musicInfo, { color: theme.textSecondary }]}>
                  {selectedMusic.name}
                </Text>
              )}
            </View>
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
    padding: 8,
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
    paddingVertical: 12,
  },
  toolbarContent: {
    paddingHorizontal: 16,
    gap: 12,
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
  panel: {
    padding: 16,
    maxHeight: 200,
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
  stickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  stickerItem: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  textPanel: {
    gap: 12,
  },
  addTextButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  addTextButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  textEditor: {
    gap: 8,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    fontSize: 16,
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
});

export default MediaEditor;

