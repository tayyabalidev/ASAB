import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  BackHandler,
  ScrollView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import Slider from '@react-native-community/slider';
import { Feather } from '@expo/vector-icons';
import { useGlobalContext } from '../context/GlobalProvider';
import * as FileSystem from 'expo-file-system/legacy';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Instagram-style adjustment tools
const ADJUSTMENT_TOOLS = [
  { id: 'lux', name: 'Lux', icon: 'sun', min: -100, max: 100, default: 0 },
  { id: 'brightness', name: 'Brightness', icon: 'sun', min: -100, max: 100, default: 0 },
  { id: 'contrast', name: 'Contrast', icon: 'layers', min: -100, max: 100, default: 0 },
  { id: 'structure', name: 'Structure', icon: 'grid', min: -100, max: 100, default: 0 },
  { id: 'warmth', name: 'Warmth', icon: 'thermometer', min: -100, max: 100, default: 0 },
  { id: 'saturation', name: 'Saturation', icon: 'droplet', min: -100, max: 100, default: 0 },
  { id: 'color', name: 'Color', icon: 'droplet', min: -100, max: 100, default: 0 },
  { id: 'fade', name: 'Fade', icon: 'minus-circle', min: 0, max: 100, default: 0 },
  { id: 'highlights', name: 'Highlights', icon: 'circle', min: -100, max: 100, default: 0 },
  { id: 'shadows', name: 'Shadows', icon: 'moon', min: -100, max: 100, default: 0 },
  { id: 'vignette', name: 'Vignette', icon: 'radio', min: 0, max: 100, default: 0 },
  { id: 'tiltShift', name: 'Tilt Shift', icon: 'target', min: 0, max: 100, default: 0 },
  { id: 'sharpen', name: 'Sharpen', icon: 'zap', min: 0, max: 100, default: 0 },
];

const PhotoEditor = ({ visible, onClose, imageUri, onSave }) => {
  const { theme, isDarkMode } = useGlobalContext();
  const webViewRef = useRef(null);
  const [selectedTool, setSelectedTool] = useState(null);
  const [adjustments, setAdjustments] = useState(() => {
    const defaults = {};
    ADJUSTMENT_TOOLS.forEach(tool => {
      defaults[tool.id] = tool.default;
    });
    return defaults;
  });
  const [processing, setProcessing] = useState(false);
  const [imageBase64, setImageBase64] = useState(null);

  // Load image as base64
  useEffect(() => {
    if (visible && imageUri) {
      loadImageAsBase64();
    } else {
      setImageBase64(null);
      setAdjustments(() => {
        const defaults = {};
        ADJUSTMENT_TOOLS.forEach(tool => {
          defaults[tool.id] = tool.default;
        });
        return defaults;
      });
      setSelectedTool(null);
    }
  }, [visible, imageUri]);

  const loadImageAsBase64 = async () => {
    try {
      setProcessing(true);
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      setImageBase64(base64);
    } catch (error) {
      console.error('Error loading image:', error);
      Alert.alert('Error', 'Failed to load image');
      onClose();
    } finally {
      setProcessing(false);
    }
  };

  // Generate CSS filter string from adjustments
  const generateFilterCSS = useCallback(() => {
    const parts = [];
    
    // Brightness: -100 to +100 -> 0.5 to 1.5
    if (adjustments.brightness !== 0) {
      const brightness = 1 + (adjustments.brightness / 200);
      parts.push(`brightness(${brightness.toFixed(2)})`);
    }
    
    // Contrast: -100 to +100 -> 0.5 to 1.5
    if (adjustments.contrast !== 0) {
      const contrast = 0.5 + ((adjustments.contrast + 100) / 200) * 1.0;
      parts.push(`contrast(${contrast.toFixed(2)})`);
    }
    
    // Saturation: -100 to +100 -> 0 to 2
    if (adjustments.saturation !== 0) {
      const saturation = 1 + (adjustments.saturation / 100);
      parts.push(`saturate(${saturation.toFixed(2)})`);
    }
    
    // Warmth (hue-rotate): -100 to +100 -> -30deg to +30deg
    if (adjustments.warmth !== 0) {
      const hue = (adjustments.warmth / 100) * 30;
      parts.push(`hue-rotate(${hue.toFixed(1)}deg)`);
    }
    
    // Color (hue-rotate): -100 to +100 -> -60deg to +60deg
    if (adjustments.color !== 0) {
      const hue = (adjustments.color / 100) * 60;
      parts.push(`hue-rotate(${hue.toFixed(1)}deg)`);
    }
    
    // Fade (opacity + desaturate): 0 to 100
    if (adjustments.fade !== 0) {
      const fade = adjustments.fade / 100;
      parts.push(`opacity(${(1 - fade * 0.3).toFixed(2)})`);
      parts.push(`saturate(${(1 - fade * 0.3).toFixed(2)})`);
    }
    
    // Lux (brightness boost): -100 to +100
    if (adjustments.lux !== 0) {
      const lux = 1 + (adjustments.lux / 300);
      parts.push(`brightness(${lux.toFixed(2)})`);
    }
    
    return parts.length > 0 ? parts.join(' ') : 'none';
  }, [adjustments]);

  // Generate HTML with img tag and CSS filters (like create.jsx)
  const generateEditorHTML = useCallback(() => {
    if (!imageBase64) return '<html><body></body></html>';
    
    const filterCSS = generateFilterCSS();
    const imageSrc = `data:image/jpeg;base64,${imageBase64}`;
    
    return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { 
      width: 100%;
      height: 100%;
      background: #000;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .image-container {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    img {
      max-width: 100%;
      max-height: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
      display: block;
      filter: ${filterCSS};
      image-rendering: -webkit-optimize-contrast;
      image-rendering: crisp-edges;
    }
  </style>
</head>
<body>
  <div class="image-container">
    <img id="editedImage" src="${imageSrc}" alt="Edited Image" onerror="console.error('Image load error');" />
  </div>
  <script>
    const img = document.getElementById('editedImage');
    let originalImageLoaded = false;
    
    img.onload = function() {
      originalImageLoaded = true;
      console.log('Image loaded successfully');
    };
    
    img.onerror = function() {
      console.error('Failed to load image');
    };
    
    // Function to update filter
    window.updateFilter = function(filterCSS) {
      if (img) {
        img.style.filter = filterCSS || 'none';
      }
    };
    
    // Function to get image data for export
    window.getImageData = function() {
      return new Promise((resolve, reject) => {
        if (!originalImageLoaded) {
          reject(new Error('Image not loaded'));
          return;
        }
        
        // Create canvas to capture the filtered image
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        img.onload = function() {
          try {
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            
            // Apply current filter to canvas
            ctx.filter = img.style.filter || 'none';
            ctx.drawImage(img, 0, 0);
            
            const dataURL = canvas.toDataURL('image/jpeg', 0.95);
            resolve(dataURL);
          } catch (error) {
            reject(error);
          }
        };
        
        // Trigger reload if needed
        if (img.complete) {
          img.onload();
        } else {
          const originalSrc = img.src;
          img.src = '';
          img.src = originalSrc;
        }
      });
    };
  </script>
</body>
</html>
    `;
  }, [imageBase64, generateFilterCSS]);

  // Handle adjustment change
  const handleAdjustmentChange = useCallback((toolId, value) => {
    const newAdjustments = { ...adjustments, [toolId]: value };
    setAdjustments(newAdjustments);
    
    // Update WebView filter immediately
    if (webViewRef.current) {
      const filterCSS = (() => {
        const parts = [];
        const adj = newAdjustments;
        
        if (adj.brightness !== 0) {
          const brightness = 1 + (adj.brightness / 200);
          parts.push(`brightness(${brightness.toFixed(2)})`);
        }
        if (adj.contrast !== 0) {
          const contrast = 0.5 + ((adj.contrast + 100) / 200) * 1.0;
          parts.push(`contrast(${contrast.toFixed(2)})`);
        }
        if (adj.saturation !== 0) {
          const saturation = 1 + (adj.saturation / 100);
          parts.push(`saturate(${saturation.toFixed(2)})`);
        }
        if (adj.warmth !== 0) {
          const hue = (adj.warmth / 100) * 30;
          parts.push(`hue-rotate(${hue.toFixed(1)}deg)`);
        }
        if (adj.color !== 0) {
          const hue = (adj.color / 100) * 60;
          parts.push(`hue-rotate(${hue.toFixed(1)}deg)`);
        }
        if (adj.fade !== 0) {
          const fade = adj.fade / 100;
          parts.push(`opacity(${(1 - fade * 0.3).toFixed(2)})`);
          parts.push(`saturate(${(1 - fade * 0.3).toFixed(2)})`);
        }
        if (adj.lux !== 0) {
          const lux = 1 + (adj.lux / 300);
          parts.push(`brightness(${lux.toFixed(2)})`);
        }
        
        return parts.length > 0 ? parts.join(' ') : 'none';
      })();
      
      webViewRef.current.injectJavaScript(`
        (function() {
          try {
            if (typeof updateFilter === 'function') {
              updateFilter('${filterCSS}');
            }
          } catch(e) {
            console.error('Error updating filter:', e);
          }
        })();
        true;
      `);
    }
  }, [adjustments]);

  // Export edited image
  const handleSave = async () => {
    try {
      setProcessing(true);
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          (function() {
            try {
              if (typeof getImageData === 'function') {
                getImageData().then(function(dataURL) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'imageData',
                    data: dataURL
                  }));
                }).catch(function(error) {
                  console.error('Error getting image data:', error);
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'error',
                    message: error.message
                  }));
                });
              } else {
                // Fallback: try to get image directly
                const img = document.getElementById('editedImage');
                if (img && img.complete) {
                  const canvas = document.createElement('canvas');
                  const ctx = canvas.getContext('2d');
                  canvas.width = img.naturalWidth || img.width;
                  canvas.height = img.naturalHeight || img.height;
                  ctx.filter = img.style.filter || 'none';
                  ctx.drawImage(img, 0, 0);
                  const dataURL = canvas.toDataURL('image/jpeg', 0.95);
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'imageData',
                    data: dataURL
                  }));
                } else {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'error',
                    message: 'Image not loaded'
                  }));
                }
              }
            } catch(e) {
              console.error('Error in save:', e);
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'error',
                message: e.message
              }));
            }
          })();
          true;
        `);
      }
    } catch (error) {
      console.error('Error saving image:', error);
      Alert.alert('Error', 'Failed to save edited image');
      setProcessing(false);
    }
  };

  // Handle WebView messages
  const handleWebViewMessage = (event) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === 'imageData') {
        const base64Data = message.data.replace('data:image/jpeg;base64,', '');
        const fileUri = FileSystem.cacheDirectory + `edited_${Date.now()}.jpg`;
        FileSystem.writeAsStringAsync(fileUri, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        }).then(() => {
          setProcessing(false);
          const editedFile = {
            uri: fileUri,
            name: `edited_${Date.now()}.jpg`,
            type: 'image/jpeg',
          };
          onSave(editedFile);
          onClose();
        }).catch(error => {
          console.error('Error saving file:', error);
          setProcessing(false);
          Alert.alert('Error', 'Failed to save edited image');
        });
      } else if (message.type === 'error') {
        setProcessing(false);
        Alert.alert('Error', message.message || 'Failed to export image');
      }
    } catch (error) {
      console.error('Error handling WebView message:', error);
      setProcessing(false);
    }
  };

  // Handle Android back button
  useEffect(() => {
    if (Platform.OS === 'android') {
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        if (visible) {
          onClose();
          return true;
        }
        return false;
      });
      return () => backHandler.remove();
    }
  }, [visible, onClose]);

  if (!visible) return null;

  const selectedToolData = ADJUSTMENT_TOOLS.find(t => t.id === selectedTool);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.container, { backgroundColor: '#000' }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit</Text>
          <TouchableOpacity onPress={handleSave} style={styles.headerButton} disabled={processing}>
            {processing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.doneText}>Done</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Image Preview */}
        <View style={styles.imageContainer}>
          {imageBase64 ? (
            <WebView
              ref={webViewRef}
              key={`editor-${imageBase64.substring(0, 20)}`}
              source={{ html: generateEditorHTML() }}
              style={styles.webView}
              onMessage={handleWebViewMessage}
              javaScriptEnabled
              domStorageEnabled
              startInLoadingState
              scalesPageToFit
              onLoadEnd={() => {
                // Ensure image is visible after load
                if (webViewRef.current) {
                  webViewRef.current.injectJavaScript(`
                    (function() {
                      const img = document.getElementById('editedImage');
                      if (img) {
                        img.style.display = 'block';
                        img.style.visibility = 'visible';
                      }
                    })();
                    true;
                  `);
                }
              }}
            />
          ) : (
            <ActivityIndicator size="large" color="#fff" />
          )}
        </View>

        {/* Tools Selection */}
        {!selectedTool && (
          <View style={styles.toolsContainer}>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.toolsScrollContent}
            >
              {ADJUSTMENT_TOOLS.map((tool) => (
                <TouchableOpacity
                  key={tool.id}
                  onPress={() => setSelectedTool(tool.id)}
                  style={styles.toolButton}
                >
                  <Feather name={tool.icon} size={24} color="#fff" />
                  <Text style={styles.toolLabel}>{tool.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Slider for selected tool */}
        {selectedTool && selectedToolData && (
          <View style={styles.sliderContainer}>
            <View style={styles.sliderHeader}>
              <TouchableOpacity onPress={() => setSelectedTool(null)} style={styles.backButton}>
                <Feather name="chevron-left" size={24} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.sliderTitle}>{selectedToolData.name}</Text>
              <TouchableOpacity 
                onPress={() => {
                  handleAdjustmentChange(selectedTool, selectedToolData.default);
                  setSelectedTool(null);
                }}
                style={styles.resetButton}
              >
                <Text style={styles.resetText}>Reset</Text>
              </TouchableOpacity>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={selectedToolData.min}
              maximumValue={selectedToolData.max}
              value={adjustments[selectedTool]}
              onValueChange={(value) => handleAdjustmentChange(selectedTool, Math.round(value))}
              minimumTrackTintColor="#fff"
              maximumTrackTintColor="rgba(255,255,255,0.3)"
              thumbTintColor="#fff"
            />
            <Text style={styles.sliderValue}>{adjustments[selectedTool]}</Text>
          </View>
        )}
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
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerButton: {
    padding: 8,
    minWidth: 60,
  },
  cancelText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  doneText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'right',
  },
  imageContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  webView: {
    flex: 1,
    backgroundColor: '#000',
  },
  toolsContainer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 12,
  },
  toolsScrollContent: {
    paddingHorizontal: 16,
    gap: 16,
  },
  toolButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 70,
    gap: 8,
  },
  toolLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  sliderContainer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    padding: 8,
  },
  sliderTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  resetButton: {
    padding: 8,
  },
  resetText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
  },
});

export default PhotoEditor;
