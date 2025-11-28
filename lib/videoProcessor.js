/**
 * Video and Photo Processing Service Client
 * This module handles communication with the video/photo processing server
 */

const PROCESSING_SERVER_URL = process.env.EXPO_PUBLIC_PROCESSING_SERVER_URL || 'http://localhost:3001';

/**
 * Process video with filter, music, and overlays
 * @param {Object} options - Processing options
 * @param {Object} options.video - Video file object with uri, name, type
 * @param {Object} options.music - Music file object (optional)
 * @param {string} options.filter - Filter name (optional)
 * @param {number} options.musicVolume - Music volume 0-1 (optional, default: 0.5)
 * @param {Array} options.stickers - Sticker overlays (optional)
 * @param {Array} options.texts - Text overlays (optional)
 * @param {Object} options.trim - Trim times {start, end} (optional)
 * @returns {Promise<Object>} Processed video information
 */
export async function processVideo({ video, music, filter = 'none', musicVolume = 0.5, stickers = [], texts = [], trim = null }) {
  try {
    const formData = new FormData();
    
    // Add video file (React Native FormData format)
    formData.append('video', {
      uri: video.uri,
      name: video.name || 'video.mp4',
      type: video.type || 'video/mp4',
    });

    // Add music file if provided
    if (music) {
      formData.append('music', {
        uri: music.uri,
        name: music.name || 'music.mp3',
        type: music.type || 'audio/mpeg',
      });
    }

    // Add processing options
    formData.append('filter', filter);
    formData.append('musicVolume', musicVolume.toString());
    
    // Add overlays if provided
    if (stickers && stickers.length > 0) {
      formData.append('stickers', JSON.stringify(stickers));
    }
    if (texts && texts.length > 0) {
      formData.append('texts', JSON.stringify(texts));
    }
    if (trim) {
      formData.append('trim', JSON.stringify(trim));
    }

    const response = await fetch(`${PROCESSING_SERVER_URL}/api/process-video`, {
      method: 'POST',
      body: formData,
      // Don't set Content-Type header - let fetch set it automatically with boundary
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Video processing failed' }));
      throw new Error(error.error || 'Video processing failed');
    }

    // Get processed video as array buffer and convert to base64
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const base64 = btoa(String.fromCharCode.apply(null, uint8Array));
    
    return {
      success: true,
      base64: base64,
      type: 'video/mp4',
    };
  } catch (error) {
    console.error('Video processing error:', error);
    throw error;
  }
}

/**
 * Process photo with filter and adjustments
 * @param {Object} options - Processing options
 * @param {Object} options.photo - Photo file object with uri, name, type
 * @param {string} options.filter - Filter name (optional)
 * @param {number} options.brightness - Brightness -100 to 100 (optional, default: 0)
 * @param {number} options.contrast - Contrast 0 to 2 (optional, default: 1)
 * @param {number} options.saturation - Saturation 0 to 2 (optional, default: 1)
 * @returns {Promise<Object>} Processed photo information
 */
export async function processPhoto({ photo, filter = 'none', brightness = 0, contrast = 1, saturation = 1 }) {
  try {
    const formData = new FormData();
    
    // Add photo file
    formData.append('photo', {
      uri: photo.uri,
      name: photo.name || 'photo.jpg',
      type: photo.type || 'image/jpeg',
    });

    // Add processing options
    formData.append('filter', filter);
    formData.append('brightness', brightness.toString());
    formData.append('contrast', contrast.toString());
    formData.append('saturation', saturation.toString());

    const response = await fetch(`${PROCESSING_SERVER_URL}/api/process-photo`, {
      method: 'POST',
      body: formData,
      // Don't set Content-Type header - let fetch set it automatically with boundary
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Photo processing failed' }));
      throw new Error(error.error || 'Photo processing failed');
    }

    // Get processed photo as array buffer and convert to base64
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const base64 = btoa(String.fromCharCode.apply(null, uint8Array));
    
    return {
      success: true,
      base64: base64,
      type: 'image/jpeg',
    };
  } catch (error) {
    console.error('Photo processing error:', error);
    throw error;
  }
}

/**
 * Check if processing server is available
 * @returns {Promise<boolean>} True if server is available
 */
export async function checkProcessingServer() {
  try {
    const response = await fetch(`${PROCESSING_SERVER_URL}/api/health`);
    return response.ok;
  } catch (error) {
    console.error('Processing server not available:', error);
    return false;
  }
}

