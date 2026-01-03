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

  // Generate CSS filter string from adjustments - SINGLE SOURCE OF TRUTH
  const generateFilterCSS = useCallback((adj = adjustments) => {
    const parts = [];
    
    // Combine brightness and lux into a single brightness value
    // Brightness: -100 to +100 -> 0.5 to 1.5
    // Lux: -100 to +100 -> additional brightness boost
    let brightnessValue = 1;
    if (adj.brightness !== 0) {
      brightnessValue *= (1 + (adj.brightness / 200));
    }
    if (adj.lux !== 0) {
      brightnessValue *= (1 + (adj.lux / 300));
    }
    if (brightnessValue !== 1) {
      parts.push(`brightness(${brightnessValue.toFixed(2)})`);
    }
    
    // Contrast: -100 to +100 -> 0.5 to 1.5
    // Structure: -100 to +100 -> also affects contrast (combine them)
    let contrastValue = 1.0;
    if (adj.contrast !== 0) {
      contrastValue = 0.5 + ((adj.contrast + 100) / 200) * 1.0;
    }
    if (adj.structure !== 0) {
      const structureValue = 0.5 + ((adj.structure + 100) / 200) * 1.0;
      // Combine structure with contrast by multiplying
      contrastValue *= structureValue;
    }
    if (contrastValue !== 1.0) {
      parts.push(`contrast(${contrastValue.toFixed(2)})`);
    }
    
    // Saturation: -100 to +100 -> 0 to 2
    if (adj.saturation !== 0) {
      const saturation = 1 + (adj.saturation / 100);
      parts.push(`saturate(${saturation.toFixed(2)})`);
    }
    
    // Warmth (hue-rotate): -100 to +100 -> -30deg to +30deg
    if (adj.warmth !== 0) {
      const hue = (adj.warmth / 100) * 30;
      parts.push(`hue-rotate(${hue.toFixed(1)}deg)`);
    }
    
    // Color (hue-rotate): -100 to +100 -> -60deg to +60deg
    if (adj.color !== 0) {
      const hue = (adj.color / 100) * 60;
      parts.push(`hue-rotate(${hue.toFixed(1)}deg)`);
    }
    
    // Fade (opacity + desaturate): 0 to 100
    if (adj.fade !== 0) {
      const fade = adj.fade / 100;
      parts.push(`opacity(${(1 - fade * 0.3).toFixed(2)})`);
      parts.push(`saturate(${(1 - fade * 0.3).toFixed(2)})`);
    }
    
    return parts.length > 0 ? parts.join(' ') : 'none';
  }, [adjustments]);

  // Generate HTML with img tag and CSS filters (like create.jsx)
  const generateEditorHTML = useCallback(() => {
    if (!imageBase64) return '<html><body></body></html>';
    
    // Use the centralized filter CSS generation function
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
      filter: ${filterCSS || 'none'};
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
      try {
        const imageElement = document.getElementById('editedImage');
        if (imageElement) {
          imageElement.style.filter = filterCSS || 'none';
          console.log('Filter updated:', filterCSS);
          return true;
        } else {
          console.error('Image element not found');
          return false;
        }
      } catch (error) {
        console.error('Error updating filter:', error);
        return false;
      }
    };
    
    // Function to get image data for export
    window.getImageData = function(filterCSS) {
      return new Promise((resolve, reject) => {
        const imageElement = document.getElementById('editedImage');
        if (!imageElement) {
          reject(new Error('Image element not found'));
          return;
        }
        
        // Use the provided filter CSS or get it from the image element
        const currentFilter = filterCSS || imageElement.style.filter || 'none';
        console.log('Capturing image with filter:', currentFilter);
        
        // Function to capture the image
        const captureImage = function() {
          try {
            // Ensure the image element has the filter applied (for visual consistency)
            imageElement.style.filter = currentFilter;
            
            // Wait a bit to ensure filter is applied and image is ready
            setTimeout(function() {
              try {
        // Create canvas to capture the filtered image
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
                // Get image dimensions - use natural dimensions for best quality
                const imgWidth = imageElement.naturalWidth || imageElement.width;
                const imgHeight = imageElement.naturalHeight || imageElement.height;
                
                if (!imgWidth || !imgHeight || imgWidth === 0 || imgHeight === 0) {
                  console.error('Invalid image dimensions:', imgWidth, imgHeight);
                  reject(new Error('Invalid image dimensions'));
                  return;
                }
                
                console.log('Image dimensions:', imgWidth, 'x', imgHeight);
                
                // Set canvas dimensions to match image
                canvas.width = imgWidth;
                canvas.height = imgHeight;
                
                // Draw the image first (without filter - we'll apply manually)
                ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height);
                
                // Verify canvas has content
                const testImageData = ctx.getImageData(0, 0, Math.min(10, canvas.width), Math.min(10, canvas.height));
                if (!testImageData || testImageData.data.length === 0) {
                  console.error('Canvas is empty after drawImage');
                  reject(new Error('Failed to draw image to canvas'));
                  return;
                }
                
                // ALWAYS apply filters manually - ctx.filter is unreliable in WebView
                // Parse and apply all filters manually using pixel manipulation
                if (currentFilter && currentFilter !== 'none') {
                  try {
                    console.log('Applying filters manually to canvas pixels...');
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const data = imageData.data;
                    
                    // Parse filter string to extract all values
                    const brightnessMatch = currentFilter.match(/brightness\\(([\\d.]+)\\)/g);
                    const contrastMatch = currentFilter.match(/contrast\\(([\\d.]+)\\)/);
                    const saturationMatch = currentFilter.match(/saturate\\(([\\d.]+)\\)/);
                    const hueRotateMatch = currentFilter.match(/hue-rotate\\(([\\d.]+)deg\\)/g);
                    const opacityMatch = currentFilter.match(/opacity\\(([\\d.]+)\\)/);
                    
                    // Calculate combined values
                    let brightness = 1.0;
                    if (brightnessMatch) {
                      // Multiply all brightness values together
                      brightnessMatch.forEach(match => {
                        const value = parseFloat(match.match(/brightness\\(([\\d.]+)\\)/)[1]);
                        brightness *= value;
                      });
                    }
                    
                    let contrast = 1.0;
                    if (contrastMatch) {
                      contrast = parseFloat(contrastMatch[1]);
                    }
                    
                    let saturation = 1.0;
                    if (saturationMatch) {
                      saturation = parseFloat(saturationMatch[1]);
                    }
                    
                    let hueRotate = 0;
                    if (hueRotateMatch) {
                      // Sum all hue-rotate values
                      hueRotateMatch.forEach(match => {
                        const value = parseFloat(match.match(/hue-rotate\\(([\\d.]+)deg\\)/)[1]);
                        hueRotate += value;
                      });
                    }
                    
                    let opacity = 1.0;
                    if (opacityMatch) {
                      opacity = parseFloat(opacityMatch[1]);
                    }
                    
                    console.log('Filter values - brightness:', brightness, 'contrast:', contrast, 'saturation:', saturation, 'hue:', hueRotate, 'opacity:', opacity);
                    
                    // Apply filters to each pixel
                    for (let i = 0; i < data.length; i += 4) {
                      let r = data[i];
                      let g = data[i + 1];
                      let b = data[i + 2];
                      let a = data[i + 3];
                      
                      // Apply contrast first
                      if (contrast !== 1.0) {
                        r = ((r - 128) * contrast) + 128;
                        g = ((g - 128) * contrast) + 128;
                        b = ((b - 128) * contrast) + 128;
                      }
                      
                      // Apply brightness
                      if (brightness !== 1.0) {
                        r *= brightness;
                        g *= brightness;
                        b *= brightness;
                      }
                      
                      // Apply saturation
                      if (saturation !== 1.0) {
                        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                        r = gray + (r - gray) * saturation;
                        g = gray + (g - gray) * saturation;
                        b = gray + (b - gray) * saturation;
                      }
                      
                      // Apply hue rotation (simplified - converts to HSL, rotates, converts back)
                      if (hueRotate !== 0) {
                        // Normalize RGB to 0-1 range for HSL conversion
                        const rNorm = r / 255;
                        const gNorm = g / 255;
                        const bNorm = b / 255;
                        const max = Math.max(rNorm, gNorm, bNorm);
                        const min = Math.min(rNorm, gNorm, bNorm);
                        let h, s, l = (max + min) / 2;
                        
                        if (max === min) {
                          h = s = 0;
                        } else {
                          const d = max - min;
                          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                          if (max === rNorm) {
                            h = ((gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0)) / 6;
                          } else if (max === gNorm) {
                            h = ((bNorm - rNorm) / d + 2) / 6;
                          } else {
                            h = ((rNorm - gNorm) / d + 4) / 6;
                          }
                        }
                        
                        // Rotate hue
                        h = (h + hueRotate / 360) % 1;
                        if (h < 0) h += 1;
                        
                        // Convert back to RGB
                        const hue2rgb = (p, q, t) => {
                          if (t < 0) t += 1;
                          if (t > 1) t -= 1;
                          if (t < 1/6) return p + (q - p) * 6 * t;
                          if (t < 1/2) return q;
                          if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                          return p;
                        };
                        
                        let q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                        let p = 2 * l - q;
                        r = hue2rgb(p, q, h + 1/3) * 255;
                        g = hue2rgb(p, q, h) * 255;
                        b = hue2rgb(p, q, h - 1/3) * 255;
                      }
                      // If no hue rotation, r, g, b are already in 0-255 range, no conversion needed
                      
                      // Apply opacity
                      if (opacity !== 1.0) {
                        a *= opacity;
                      }
                      
                      // Clamp values
                      data[i] = Math.max(0, Math.min(255, r));
                      data[i + 1] = Math.max(0, Math.min(255, g));
                      data[i + 2] = Math.max(0, Math.min(255, b));
                      data[i + 3] = Math.max(0, Math.min(255, a));
                    }
                    
                    // Put the modified image data back
                    ctx.putImageData(imageData, 0, 0);
                    console.log('Manual filter application completed successfully');
                  } catch (manualError) {
                    console.error('Manual filter application failed:', manualError);
                    console.error('Error stack:', manualError.stack);
                    // Continue anyway - return unfiltered image rather than failing
                  }
                }
                
                // Convert to data URL with high quality
            const dataURL = canvas.toDataURL('image/jpeg', 0.95);
                console.log('Successfully captured image, dataURL length:', dataURL.length);
                console.log('Filter used:', currentFilter);
            resolve(dataURL);
          } catch (error) {
                console.error('Error capturing image:', error);
                console.error('Error stack:', error.stack);
                reject(error);
              }
            }, 200); // Longer delay to ensure filter is applied
          } catch (error) {
            console.error('Error in captureImage function:', error);
            reject(error);
          }
        };
        
        // Check if image is loaded
        if (imageElement.complete && imageElement.naturalWidth > 0) {
          console.log('Image already loaded, capturing...');
          // Image is already loaded, capture immediately
          captureImage();
        } else {
          console.log('Waiting for image to load...');
          // Wait for image to load
          const loadHandler = function() {
            console.log('Image load event fired');
            imageElement.removeEventListener('load', loadHandler);
            captureImage();
          };
          imageElement.addEventListener('load', loadHandler);
          
          // Timeout after 5 seconds
          setTimeout(function() {
            imageElement.removeEventListener('load', loadHandler);
            if (imageElement.complete && imageElement.naturalWidth > 0) {
              console.log('Image loaded after timeout, capturing...');
              captureImage();
            } else {
              console.error('Image load timeout');
              reject(new Error('Image load timeout'));
            }
          }, 5000);
        }
      });
    };
  </script>
</body>
</html>
    `;
  }, [imageBase64, adjustments, generateFilterCSS]);

  // Handle adjustment change
  const handleAdjustmentChange = useCallback((toolId, value) => {
    const newAdjustments = { ...adjustments, [toolId]: value };
    setAdjustments(newAdjustments);
    
    // Update WebView filter immediately using centralized function
    if (webViewRef.current) {
      // Generate filter CSS with new adjustments
      const filterCSS = generateFilterCSS(newAdjustments);
      
      // Escape the filterCSS string properly for JavaScript injection
      const escapedFilterCSS = filterCSS
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');
      
      // Use postMessage instead of injectJavaScript for better reliability
      webViewRef.current.injectJavaScript(`
        (function() {
          try {
            const img = document.getElementById('editedImage');
            if (img) {
              img.style.filter = '${escapedFilterCSS}';
              console.log('Filter updated:', '${escapedFilterCSS}');
            } else {
              // Retry with delay if element not found
              setTimeout(function() {
                const img2 = document.getElementById('editedImage');
                if (img2) {
                  img2.style.filter = '${escapedFilterCSS}';
                  console.log('Filter applied (delayed):', '${escapedFilterCSS}');
                }
              }, 100);
            }
          } catch(e) {
            console.error('Error updating filter:', e);
          }
        })();
        true;
      `);
    }
  }, [adjustments, generateFilterCSS]);

  // Export edited image
  const handleSave = async () => {
    try {
      setProcessing(true);
      if (webViewRef.current) {
        // Generate the current filter CSS from adjustments using centralized function
        const currentFilterCSS = generateFilterCSS();
        console.log('🔧 Generated filter CSS for save:', currentFilterCSS);
        console.log('🔧 Current adjustments:', adjustments);
        
        // Escape the filter CSS for JavaScript injection
        const escapedFilterCSS = currentFilterCSS
          .replace(/\\/g, '\\\\')
          .replace(/'/g, "\\'")
          .replace(/"/g, '\\"')
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r');
        
        console.log('🔧 Escaped filter CSS:', escapedFilterCSS);
        
        webViewRef.current.injectJavaScript(`
          (function() {
            try {
              const img = document.getElementById('editedImage');
              if (!img) {
                console.error('Image element not found');
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'error',
                  message: 'Image element not found'
                }));
                return;
              }
              
              // Ensure filter is applied to the image element
              const filterCSS = '${escapedFilterCSS}';
              console.log('Applying filter to image element:', filterCSS);
              img.style.filter = filterCSS;
              
              // Wait a moment for filter to apply, then capture
              setTimeout(function() {
                console.log('Starting image capture with filter:', filterCSS);
            try {
              if (typeof getImageData === 'function') {
                    // Pass the filter CSS to ensure it's applied
                    console.log('Calling getImageData with filter:', filterCSS);
                    getImageData(filterCSS).then(function(dataURL) {
                      console.log('getImageData succeeded, dataURL length:', dataURL ? dataURL.length : 0);
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'imageData',
                    data: dataURL
                  }));
                }).catch(function(error) {
                  console.error('Error getting image data:', error);
                      console.error('Error stack:', error.stack);
                      // Fallback: try direct capture with manual filter application
                      try {
                        console.log('Trying fallback direct capture with manual filters...');
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        canvas.width = img.naturalWidth || img.width;
                        canvas.height = img.naturalHeight || img.height;
                        console.log('Canvas size:', canvas.width, 'x', canvas.height);
                        
                        // Draw image first
                        ctx.drawImage(img, 0, 0);
                        
                        // Apply filters manually (same logic as getImageData)
                        if (filterCSS && filterCSS !== 'none') {
                          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                          const data = imageData.data;
                          
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
                        }
                        
                        const dataURL = canvas.toDataURL('image/jpeg', 0.95);
                        console.log('Fallback capture succeeded, dataURL length:', dataURL.length);
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                          type: 'imageData',
                          data: dataURL
                        }));
                      } catch (fallbackError) {
                        console.error('Fallback capture also failed:', fallbackError);
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'error',
                          message: fallbackError.message || 'Failed to capture image'
                  }));
                      }
                });
              } else {
                    // Fallback: direct canvas capture with manual filters
                    if (img.complete && (img.naturalWidth > 0 || img.width > 0)) {
                  const canvas = document.createElement('canvas');
                  const ctx = canvas.getContext('2d');
                  canvas.width = img.naturalWidth || img.width;
                  canvas.height = img.naturalHeight || img.height;
                      
                      // Draw image first
                  ctx.drawImage(img, 0, 0);
                      
                      // Apply filters manually if needed
                      if (filterCSS && filterCSS !== 'none') {
                        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                        const data = imageData.data;
                        
                        const brightnessMatch = filterCSS.match(/brightness\\(([\\d.]+)\\)/g);
                        const contrastMatch = filterCSS.match(/contrast\\(([\\d.]+)\\)/);
                        const saturationMatch = filterCSS.match(/saturate\\(([\\d.]+)\\)/);
                        
                        let brightness = 1.0;
                        if (brightnessMatch) {
                          brightnessMatch.forEach(match => {
                            brightness *= parseFloat(match.match(/brightness\\(([\\d.]+)\\)/)[1]);
                          });
                        }
                        
                        let contrast = contrastMatch ? parseFloat(contrastMatch[1]) : 1.0;
                        let saturation = saturationMatch ? parseFloat(saturationMatch[1]) : 1.0;
                        
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
                      }
                      
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
                    message: e.message || 'Failed to export image'
                  }));
                }
              }, 100);
            } catch(e) {
              console.error('Error in save:', e);
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'error',
                message: e.message || 'Failed to export image'
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
                      setTimeout(function() {
                        const img = document.getElementById('editedImage');
                        if (img) {
                          img.style.display = 'block';
                          img.style.visibility = 'visible';
                          console.log('Image loaded and visible');
                        } else {
                          console.error('Image element not found on load');
                        }
                      }, 100);
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
