import React, { useState, useRef, useCallback, useEffect } from 'react';
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
  
  const videoRef = useRef(null);
  const previewRef = useRef(null);
  const [videoDuration, setVideoDuration] = useState(60);

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
  
  // Update text position - using functional update to avoid stale state
  const updateTextPosition = useCallback((textId, x, y) => {
    setTexts(prev => prev.map(t => 
      t.id === textId 
        ? { ...t, x: Math.max(0, Math.min(SCREEN_WIDTH - 100, x)), y: Math.max(0, Math.min(SCREEN_HEIGHT - 30, y)) }
        : t
    ));
  }, []);

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

  // Drawing gesture
  const drawingGesture = Gesture.Pan()
    .onStart((e) => {
      setIsDrawing(true);
      setCurrentPath(`M${e.x},${e.y}`);
    })
    .onUpdate((e) => {
      setCurrentPath(prev => `${prev} L${e.x},${e.y}`);
    })
    .onEnd(() => {
      if (currentPath) {
        setDrawingPaths([
          ...drawingPaths,
          {
            id: Date.now(),
            path: currentPath,
            color: drawingColor,
            width: drawingWidth,
          }
        ]);
        setCurrentPath('');
      }
      setIsDrawing(false);
    });

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
            const uri = await captureRef(previewRef, {
              format: 'jpg',
              quality: 0.9,
            });
            return uri;
          } catch (error) {
            console.log('Capture failed:', error);
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
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: theme.background }]}>
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
        <View style={styles.previewContainer} collapsable={false}>
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
          <GestureHandlerRootView style={styles.overlay} pointerEvents="box-none">
            {/* Stickers - Draggable */}
            {stickers.map(sticker => {
              const panGesture = Gesture.Pan()
                .onStart(() => {
                  setSelectedSticker(sticker.id);
                })
                .onUpdate((e) => {
                  updateStickerPosition(sticker.id, e.x - 20, e.y - 20);
                })
                .onEnd(() => {
                  setSelectedSticker(null);
                });
              
              return (
                <GestureDetector key={sticker.id} gesture={panGesture}>
                  <Animated.View
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
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => deleteElement('sticker', sticker.id)}
                    >
                      <Text style={styles.deleteButtonText}>×</Text>
                    </TouchableOpacity>
                  </Animated.View>
                </GestureDetector>
              );
            })}
            
            {/* Texts - Draggable */}
            {texts.map(text => {
              const textPanGesture = Gesture.Pan()
                .onStart(() => {
                  setSelectedText(text.id);
                })
                .onUpdate((e) => {
                  updateTextPosition(text.id, e.x - 50, e.y - 15);
                })
                .onEnd(() => {
                  setSelectedText(null);
                });
              
              return (
                <GestureDetector key={text.id} gesture={textPanGesture}>
                  <Animated.View
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
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => deleteElement('text', text.id)}
                    >
                      <Text style={styles.deleteButtonText}>×</Text>
                    </TouchableOpacity>
                  </Animated.View>
                </GestureDetector>
              );
            })}
            
            {/* Drawings */}
            {mediaType === 'photo' && (
              <GestureHandlerRootView style={StyleSheet.absoluteFill} pointerEvents="box-none">
                <GestureDetector gesture={drawingGesture}>
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
                </GestureDetector>
              </GestureHandlerRootView>
            )}
          </GestureHandlerRootView>
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
});

export default MediaEditor;

