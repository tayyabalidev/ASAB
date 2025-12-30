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

  // Generate HTML with Canvas for image processing
  const generateEditorHTML = () => {
    const adjustmentsJson = JSON.stringify(adjustments);
    return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      background: #000; 
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100vw;
      height: 100vh;
    }
    #canvasContainer {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    canvas {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
  </style>
</head>
<body>
  <div id="canvasContainer">
    <canvas id="imageCanvas"></canvas>
  </div>
  <script>
    const canvas = document.getElementById('imageCanvas');
    const ctx = canvas.getContext('2d');
    let originalImageData = null;
    let currentImageData = null;
    let originalImage = null;
    let originalWidth = 0;
    let originalHeight = 0;
    
    // Create a hidden canvas for full-resolution processing
    const processCanvas = document.createElement('canvas');
    const processCtx = processCanvas.getContext('2d');
    
    const adjustments = ${adjustmentsJson};
    
    // Image processing functions (Instagram-style algorithms)
    function applyBrightness(data, value) {
      // Instagram-style brightness: -100 to +100 maps to brightness adjustment
      // Use safer formula to prevent black images
      const adjustment = (value / 100) * 80; // Limit to -80 to +80 range
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i] + adjustment;
        const g = data[i + 1] + adjustment;
        const b = data[i + 2] + adjustment;
        data[i] = Math.max(0, Math.min(255, Math.round(r)));
        data[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
        data[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
      }
    }
    
    function applyContrast(data, value) {
      // Instagram-style contrast: -100 to +100 maps to contrast factor
      // Using safer contrast formula to prevent black images
      // factor range: 0.5 (low contrast) to 1.5 (high contrast)
      const factor = 0.5 + ((value + 100) / 200) * 1.0;
      for (let i = 0; i < data.length; i += 4) {
        const r = (data[i] - 128) * factor + 128;
        const g = (data[i + 1] - 128) * factor + 128;
        const b = (data[i + 2] - 128) * factor + 128;
        data[i] = Math.max(0, Math.min(255, Math.round(r)));
        data[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
        data[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
      }
    }
    
    function applySaturation(data, value) {
      // Convert -100 to +100 range to saturation factor
      // value = -100: factor = 0 (grayscale)
      // value = 0: factor = 1 (no change)
      // value = +100: factor = 2 (high saturation)
      const factor = 1 + (value / 100);
      for (let i = 0; i < data.length; i += 4) {
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        data[i] = Math.max(0, Math.min(255, gray + (data[i] - gray) * factor));
        data[i + 1] = Math.max(0, Math.min(255, gray + (data[i + 1] - gray) * factor));
        data[i + 2] = Math.max(0, Math.min(255, gray + (data[i + 2] - gray) * factor));
      }
    }
    
    function applyWarmth(data, value) {
      const factor = value / 100;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.max(0, Math.min(255, data[i] + factor * 10));
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] - factor * 5));
      }
    }
    
    function applyColor(data, value) {
      const factor = value / 100;
      const hue = factor * 60;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i] / 255;
        const g = data[i + 1] / 255;
        const b = data[i + 2] / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        if (max === min) {
          h = s = 0;
        } else {
          const d = max - min;
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
          else if (max === g) h = ((b - r) / d + 2) / 6;
          else h = ((r - g) / d + 4) / 6;
        }
        h = (h * 360 + hue) % 360;
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = l - c / 2;
        let r2 = 0, g2 = 0, b2 = 0;
        if (h < 60) { r2 = c; g2 = x; b2 = 0; }
        else if (h < 120) { r2 = x; g2 = c; b2 = 0; }
        else if (h < 180) { r2 = 0; g2 = c; b2 = x; }
        else if (h < 240) { r2 = 0; g2 = x; b2 = c; }
        else if (h < 300) { r2 = x; g2 = 0; b2 = c; }
        else { r2 = c; g2 = 0; b2 = x; }
        data[i] = Math.max(0, Math.min(255, (r2 + m) * 255));
        data[i + 1] = Math.max(0, Math.min(255, (g2 + m) * 255));
        data[i + 2] = Math.max(0, Math.min(255, (b2 + m) * 255));
      }
    }
    
    function applyLux(data, value) {
      // Lux: subtle exposure boost based on luminance (Instagram-style)
      // Similar to brightness but preserves highlights better
      const factor = value / 100;
      for (let i = 0; i < data.length; i += 4) {
        const luminance = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        // More conservative boost to prevent overexposure
        const boost = (luminance / 255) * factor * 50;
        const r = data[i] + boost;
        const g = data[i + 1] + boost;
        const b = data[i + 2] + boost;
        data[i] = Math.max(0, Math.min(255, Math.round(r)));
        data[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
        data[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
      }
    }
    
    function applyStructure(data, value, width, height) {
      if (value === 0) return;
      const factor = value / 100;
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      tempCanvas.width = width;
      tempCanvas.height = height;
      tempCtx.putImageData(new ImageData(data, width, height), 0, 0);
      
      const imageData = tempCtx.getImageData(0, 0, width, height);
      const tempData = new Uint8ClampedArray(imageData.data);
      
      const kernel = [
        0, -1 * factor, 0,
        -1 * factor, 1 + 4 * factor, -1 * factor,
        0, -1 * factor, 0
      ];
      
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          let r = 0, g = 0, b = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const idx = ((y + ky) * width + (x + kx)) * 4;
              const k = kernel[(ky + 1) * 3 + (kx + 1)];
              r += tempData[idx] * k;
              g += tempData[idx + 1] * k;
              b += tempData[idx + 2] * k;
            }
          }
          const idx = (y * width + x) * 4;
          data[idx] = Math.max(0, Math.min(255, r));
          data[idx + 1] = Math.max(0, Math.min(255, g));
          data[idx + 2] = Math.max(0, Math.min(255, b));
        }
      }
    }
    
    function applyFade(data, value) {
      const factor = value / 100;
      for (let i = 0; i < data.length; i += 4) {
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        data[i] = Math.max(0, Math.min(255, data[i] * (1 - factor * 0.3) + gray * factor * 0.3));
        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] * (1 - factor * 0.3) + gray * factor * 0.3));
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] * (1 - factor * 0.3) + gray * factor * 0.3));
      }
    }
    
    function applyHighlights(data, value) {
      const factor = value / 100;
      for (let i = 0; i < data.length; i += 4) {
        const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
        if (brightness > 128) {
          const boost = (brightness - 128) / 128 * factor;
          data[i] = Math.min(255, data[i] + boost * 50);
          data[i + 1] = Math.min(255, data[i + 1] + boost * 50);
          data[i + 2] = Math.min(255, data[i + 2] + boost * 50);
        }
      }
    }
    
    function applyShadows(data, value) {
      const factor = value / 100;
      for (let i = 0; i < data.length; i += 4) {
        const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
        if (brightness < 128) {
          const boost = (128 - brightness) / 128 * factor;
          data[i] = Math.max(0, data[i] + boost * 50);
          data[i + 1] = Math.max(0, data[i + 1] + boost * 50);
          data[i + 2] = Math.max(0, data[i + 2] + boost * 50);
        }
      }
    }
    
    function applyVignette(data, width, height, value) {
      const factor = value / 100;
      const centerX = width / 2;
      const centerY = height / 2;
      const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const dist = Math.sqrt((x - centerX) * (x - centerX) + (y - centerY) * (y - centerY));
          const darken = (dist / maxDist) * factor * 0.5;
          const idx = (y * width + x) * 4;
          data[idx] = Math.max(0, data[idx] * (1 - darken));
          data[idx + 1] = Math.max(0, data[idx + 1] * (1 - darken));
          data[idx + 2] = Math.max(0, data[idx + 2] * (1 - darken));
        }
      }
    }
    
    function applySharpen(data, width, height, value) {
      if (value === 0) return;
      const factor = value / 100;
      const tempData = new Uint8ClampedArray(data);
      
      const kernel = [
        0, -factor, 0,
        -factor, 1 + 4 * factor, -factor,
        0, -factor, 0
      ];
      
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          let r = 0, g = 0, b = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const idx = ((y + ky) * width + (x + kx)) * 4;
              const k = kernel[(ky + 1) * 3 + (kx + 1)];
              r += tempData[idx] * k;
              g += tempData[idx + 1] * k;
              b += tempData[idx + 2] * k;
            }
          }
          const idx = (y * width + x) * 4;
          data[idx] = Math.max(0, Math.min(255, r));
          data[idx + 1] = Math.max(0, Math.min(255, g));
          data[idx + 2] = Math.max(0, Math.min(255, b));
        }
      }
    }
    
    function applyTiltShift(data, width, height, value) {
      if (value === 0) return;
      const factor = value / 100;
      const centerY = height / 2;
      const blurRadius = factor * 15;
      const focusHeight = height * 0.4;
      const tempData = new Uint8ClampedArray(data);
      
      for (let y = 0; y < height; y++) {
        const distFromCenter = Math.abs(y - centerY);
        const blurAmount = distFromCenter > focusHeight / 2 ? 
          Math.min(1, (distFromCenter - focusHeight / 2) / (height / 2 - focusHeight / 2)) * blurRadius : 0;
        
        if (blurAmount > 0) {
          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            let r = 0, g = 0, b = 0, count = 0;
            const radius = Math.ceil(blurAmount);
            for (let dy = -radius; dy <= radius; dy++) {
              const ny = Math.max(0, Math.min(height - 1, y + dy));
              const nidx = (ny * width + x) * 4;
              r += tempData[nidx];
              g += tempData[nidx + 1];
              b += tempData[nidx + 2];
              count++;
            }
            data[idx] = r / count;
            data[idx + 1] = g / count;
            data[idx + 2] = b / count;
          }
        }
      }
    }
    
    function processImage() {
      if (!originalImageData || !originalImage) {
        console.log('processImage: Missing originalImageData or originalImage');
        return;
      }
      
      try {
        // Always start from original image - redraw it fresh
        processCanvas.width = originalWidth;
        processCanvas.height = originalHeight;
        processCtx.clearRect(0, 0, originalWidth, originalHeight);
        processCtx.drawImage(originalImage, 0, 0, originalWidth, originalHeight);
        
        // Get fresh image data from the original image
        const fullImageData = processCtx.getImageData(0, 0, originalWidth, originalHeight);
        
        // Create a working copy of the pixel data
        const data = new Uint8ClampedArray(fullImageData.data);
        
        // Apply all adjustments in proper order
        if (adjustments.brightness !== 0) applyBrightness(data, adjustments.brightness);
        if (adjustments.contrast !== 0) applyContrast(data, adjustments.contrast);
        if (adjustments.lux !== 0) applyLux(data, adjustments.lux);
        if (adjustments.saturation !== 0) applySaturation(data, adjustments.saturation);
        if (adjustments.warmth !== 0) applyWarmth(data, adjustments.warmth);
        if (adjustments.color !== 0) applyColor(data, adjustments.color);
        if (adjustments.structure !== 0) applyStructure(data, adjustments.structure, originalWidth, originalHeight);
        if (adjustments.fade !== 0) applyFade(data, adjustments.fade);
        if (adjustments.highlights !== 0) applyHighlights(data, adjustments.highlights);
        if (adjustments.shadows !== 0) applyShadows(data, adjustments.shadows);
        if (adjustments.vignette !== 0) applyVignette(data, originalWidth, originalHeight, adjustments.vignette);
        if (adjustments.sharpen !== 0) applySharpen(data, originalWidth, originalHeight, adjustments.sharpen);
        if (adjustments.tiltShift !== 0) applyTiltShift(data, originalWidth, originalHeight, adjustments.tiltShift);
        
        // Create new ImageData with processed data
        const processedImageData = new ImageData(data, originalWidth, originalHeight);
        
        // Put processed data back to process canvas
        processCtx.putImageData(processedImageData, 0, 0);
        
        // Calculate display size
        const maxWidth = window.innerWidth || 400;
        const maxHeight = window.innerHeight || 600;
        let displayWidth = originalWidth;
        let displayHeight = originalHeight;
        
        if (displayWidth > maxWidth || displayHeight > maxHeight) {
          const ratio = Math.min(maxWidth / displayWidth, maxHeight / displayHeight);
          displayWidth = Math.round(displayWidth * ratio);
          displayHeight = Math.round(displayHeight * ratio);
        }
        
        // Update display canvas - preserve aspect ratio
        if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
          canvas.width = displayWidth;
          canvas.height = displayHeight;
        }
        
        // Clear and redraw
        ctx.clearRect(0, 0, displayWidth, displayHeight);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(processCanvas, 0, 0, originalWidth, originalHeight, 0, 0, displayWidth, displayHeight);
        
        currentImageData = processedImageData;
      } catch (error) {
        console.error('Error in processImage:', error);
        // Fallback: just draw original image
        if (originalImage) {
          const maxWidth = window.innerWidth || 400;
          const maxHeight = window.innerHeight || 600;
          let displayWidth = originalWidth;
          let displayHeight = originalHeight;
          
          if (displayWidth > maxWidth || displayHeight > maxHeight) {
            const ratio = Math.min(maxWidth / displayWidth, maxHeight / displayHeight);
            displayWidth = Math.round(displayWidth * ratio);
            displayHeight = Math.round(displayHeight * ratio);
          }
          
          canvas.width = displayWidth;
          canvas.height = displayHeight;
          ctx.clearRect(0, 0, displayWidth, displayHeight);
          ctx.drawImage(originalImage, 0, 0, displayWidth, displayHeight);
        }
      }
    }
    
    function loadImage(base64) {
      const img = new Image();
      img.onload = function() {
        // Store original image and dimensions
        originalImage = img;
        originalWidth = img.width;
        originalHeight = img.height;
        
        // Get original image data for reference
        processCanvas.width = originalWidth;
        processCanvas.height = originalHeight;
        processCtx.drawImage(img, 0, 0, originalWidth, originalHeight);
        originalImageData = processCtx.getImageData(0, 0, originalWidth, originalHeight);
        
        // Process and display
        processImage();
      };
      img.onerror = function(e) {
        console.error('Error loading image:', e);
      };
      img.src = 'data:image/jpeg;base64,' + base64;
    }
    
    window.loadImage = loadImage;
    window.processImage = processImage;
    window.getImageData = function() {
      // Export from full-resolution process canvas, not display canvas
      if (processCanvas.width > 0 && processCanvas.height > 0) {
        return processCanvas.toDataURL('image/jpeg', 0.95);
      }
      return canvas.toDataURL('image/jpeg', 0.95);
    };
    
    // Listen for messages from React Native
    window.addEventListener('message', function(event) {
      try {
        const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        
        if (message.type === 'adjustmentChange') {
          adjustments[message.tool] = message.value;
          processImage();
        } else if (message.type === 'getImageData') {
          const imageData = getImageData();
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'imageData',
            data: imageData
          }));
        }
      } catch (e) {
        console.error('Error handling message:', e);
      }
    });
    
    // Also handle direct postMessage calls
    document.addEventListener('message', function(event) {
      window.dispatchEvent(new MessageEvent('message', { data: event.data }));
    });
  </script>
</body>
</html>
    `;
  };

  // Handle adjustment change
  const handleAdjustmentChange = useCallback((toolId, value) => {
    const newAdjustments = { ...adjustments, [toolId]: value };
    setAdjustments(newAdjustments);
    
    // Update WebView immediately for real-time preview
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        (function() {
          try {
            if (typeof adjustments !== 'undefined') {
              adjustments['${toolId}'] = ${value};
              if (typeof processImage === 'function') {
                processImage();
              }
            }
          } catch(e) {
            console.error('Error updating adjustment:', e);
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
              const imageData = getImageData();
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'imageData',
                data: imageData
              }));
            } catch(e) {
              console.error('Error getting image data:', e);
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
      }
    } catch (error) {
      console.error('Error handling WebView message:', error);
      setProcessing(false);
    }
  };

  // Load image in WebView
  useEffect(() => {
    if (imageBase64 && webViewRef.current) {
      // Small delay to ensure WebView is ready
      setTimeout(() => {
        if (webViewRef.current) {
          webViewRef.current.injectJavaScript(`
            (function() {
              if (typeof loadImage !== 'undefined') {
                loadImage('${imageBase64}');
              }
            })();
            true;
          `);
        }
      }, 500);
    }
  }, [imageBase64]);

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
              source={{ html: generateEditorHTML() }}
              style={styles.webView}
              onMessage={handleWebViewMessage}
              javaScriptEnabled
              domStorageEnabled
              startInLoadingState
              scalesPageToFit
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

