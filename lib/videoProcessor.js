/**
 * Video and Photo Processing Service Client
 * This module handles communication with the video/photo processing server
 * Supports both Appwrite Functions and separate server approaches
 */

// Appwrite imports - dynamically loaded when needed
// appwriteConfig - dynamically loaded when needed

const PROCESSING_SERVER_URL = process.env.EXPO_PUBLIC_PROCESSING_SERVER_URL || 'http://localhost:3001';
const USE_APPWRITE_FUNCTIONS = process.env.EXPO_PUBLIC_USE_APPWRITE_FUNCTIONS === 'true' || false;
const APPWRITE_FUNCTION_ID = process.env.EXPO_PUBLIC_APPWRITE_FUNCTION_ID || 'process-video-filter';

/**
 * Process video with filter, music, and overlays
 * @param {Object} options - Processing options
 * @param {Object} options.video - Video file object with uri, name, type
 * @param {Object} options.music - Music file object (optional)
 * @param {string} options.filter - Filter name (optional)
 * @param {number} options.filterIntensity - Filter intensity 0-100 (optional, default: 100)
 * @param {number} options.musicVolume - Music volume 0-1 (optional, default: 0.5)
 * @param {Array} options.stickers - Sticker overlays (optional)
 * @param {Array} options.texts - Text overlays (optional)
 * @param {Object} options.trim - Trim times {start, end} (optional)
 * @param {number} options.videoSpeed - Video speed multiplier (0.25, 0.5, 1.0, 1.5, 2.0) (optional, default: 1.0)
 * @param {boolean} options.audioFadeIn - Enable audio fade in (optional, default: false)
 * @param {boolean} options.audioFadeOut - Enable audio fade out (optional, default: false)
 * @param {boolean} options.audioDucking - Enable audio ducking (optional, default: false)
 * @param {string} options.videoTransition - Transition type: 'none', 'fade', 'crossfade', 'slide' (optional, default: 'none')
 * @param {number} options.transitionDuration - Transition duration in seconds 0.1-2.0 (optional, default: 0.5)
 * @param {Array} options.videoClips - Array of video clips to merge (optional)
 * @returns {Promise<Object>} Processed video information
 */
export async function processVideo({ 
  video, 
  music, 
  filter = 'none', 
  filterIntensity = 100,
  musicVolume = 0.5, 
  stickers = [], 
  texts = [], 
  trim = null,
  videoSpeed = 1.0,
  audioFadeIn = false,
  audioFadeOut = false,
  audioDucking = false,
  videoTransition = 'none',
  transitionDuration = 0.5,
  videoClips = null,
}) {
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
    formData.append('filterIntensity', filterIntensity.toString());
    formData.append('musicVolume', musicVolume.toString());
    formData.append('videoSpeed', videoSpeed.toString());
    formData.append('audioFadeIn', audioFadeIn.toString());
    formData.append('audioFadeOut', audioFadeOut.toString());
    formData.append('audioDucking', audioDucking.toString());
    formData.append('videoTransition', videoTransition);
    formData.append('transitionDuration', transitionDuration.toString());
    
    // Add video clips if provided
    if (videoClips && videoClips.length > 0) {
      formData.append('videoClips', JSON.stringify(videoClips));
    }
    
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

    // Add timeout to prevent hanging if server is not available
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    let response;
    try {
      response = await fetch(`${PROCESSING_SERVER_URL}/api/process-video`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
        // Don't set Content-Type header - let fetch set it automatically with boundary
      });
      clearTimeout(timeoutId);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      // If server is not available, throw a clear error
      if (fetchError.name === 'AbortError' || fetchError.message.includes('timeout')) {
        throw new Error('Processing server timeout - server may not be available');
      }
      if (fetchError.message.includes('Network') || fetchError.message.includes('Failed to fetch')) {
        throw new Error('Processing server not available - please start the server or upload without processing');
      }
      throw fetchError;
    }

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
    throw error;
  }
}

/**
 * Process photo with filter and adjustments
 * @param {Object} options - Processing options
 * @param {Object} options.photo - Photo file object with uri, name, type
 * @param {string} options.filter - Filter name (optional)
 * @param {number} options.filterIntensity - Filter intensity 0-100 (optional, default: 100)
 * @param {number} options.brightness - Brightness -100 to 100 (optional, default: 0)
 * @param {number} options.contrast - Contrast -100 to 100 (optional, default: 0)
 * @param {number} options.saturation - Saturation -100 to 100 (optional, default: 0)
 * @param {number} options.warmth - Warmth -100 to 100 (optional, default: 0)
 * @param {number} options.shadows - Shadows -100 to 100 (optional, default: 0)
 * @param {number} options.highlights - Highlights -100 to 100 (optional, default: 0)
 * @param {number} options.structure - Structure -100 to 100 (optional, default: 0)
 * @param {number} options.vignette - Vignette 0 to 100 (optional, default: 0)
 * @returns {Promise<Object>} Processed photo information
 */
export async function processPhoto({ 
  photo, 
  filter = 'none',
  filterIntensity = 100,
  brightness = 0, 
  contrast = 0, 
  saturation = 0,
  warmth = 0,
  shadows = 0,
  highlights = 0,
  structure = 0,
  vignette = 0,
}) {
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
    formData.append('filterIntensity', filterIntensity.toString());
    formData.append('brightness', brightness.toString());
    formData.append('contrast', contrast.toString());
    formData.append('saturation', saturation.toString());
    formData.append('warmth', warmth.toString());
    formData.append('shadows', shadows.toString());
    formData.append('highlights', highlights.toString());
    formData.append('structure', structure.toString());
    formData.append('vignette', vignette.toString());

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
    throw error;
  }
}

/**
 * Process video using Appwrite Functions
 * @param {Object} options - Processing options (same as processVideo)
 * @returns {Promise<Object>} Processed video information
 */
export async function processVideoWithAppwrite({ 
  video, 
  music, 
  filter = 'none', 
  filterIntensity = 100,
  musicVolume = 0.5, 
  trim = null,
  videoSpeed = 1.0,
}) {
  try {
    // Dynamic import - only load when Appwrite Functions are actually used
    const { Client, Functions, Storage, ID } = await import('react-native-appwrite');
    const { appwriteConfig, retryNetworkRequest } = await import('./appwrite');
    const { FileSystem } = await import('expo-file-system');

    // Initialize Appwrite client
    const client = new Client();
    client
      .setEndpoint(appwriteConfig.endpoint)
      .setProject(appwriteConfig.projectId)
      .setPlatform(appwriteConfig.platform);

    const storage = new Storage(client);
    const functions = new Functions(client);

    // Step 1: Upload video to Appwrite Storage with retry mechanism
    let uploadedVideo;
    try {
      // Get file size if available
      let videoSize = video.size || 0;
      try {
        const fileInfo = await FileSystem.getInfoAsync(video.uri);
        if (fileInfo.exists && fileInfo.size) {
          videoSize = fileInfo.size;
        }
      } catch (sizeError) {
      }

      // Prepare asset object with size
      const videoAsset = {
        uri: video.uri,
        name: video.name || 'video.mp4',
        type: video.type || 'video/mp4',
        size: videoSize,
      };

      uploadedVideo = await retryNetworkRequest(async () => {
        const result = await storage.createFile(
          appwriteConfig.storageId,
          ID.unique(),
          videoAsset
        );
        
        if (!result || !result.$id) {
          throw new Error('Video upload failed - no file ID returned');
        }
        
        return result;
      });
      
    } catch (uploadError) {
      throw new Error(`Failed to upload video to Appwrite Storage: ${uploadError.message}`);
    }

    let uploadedMusic = null;
    if (music) {
      try {
        
        // Get file size if available
        let musicSize = music.size || 0;
        try {
          const fileInfo = await FileSystem.getInfoAsync(music.uri);
          if (fileInfo.exists && fileInfo.size) {
            musicSize = fileInfo.size;
          }
        } catch (sizeError) {
        }

        // Prepare asset object with size
        const musicAsset = {
          uri: music.uri,
          name: music.name || 'music.mp3',
          type: music.type || 'audio/mpeg',
          size: musicSize,
        };

        uploadedMusic = await retryNetworkRequest(async () => {
          const result = await storage.createFile(
            appwriteConfig.storageId,
            ID.unique(),
            musicAsset
          );
          
          if (!result || !result.$id) {
            throw new Error('Music upload failed - no file ID returned');
          }
          
          return result;
        });
      } catch (musicError) {
        // Continue without music
      }
    }

    // Step 2: Prepare payload for Appwrite Function
    const payload = {
      videoFileId: uploadedVideo.$id,
      filter: filter,
      filterIntensity: filterIntensity,
      videoSpeed: videoSpeed,
      trim: trim,
      musicFileId: uploadedMusic?.$id || null,
      musicVolume: musicVolume,
    };

    // Step 3: Execute Appwrite Function
    let execution;
    try {
      execution = await functions.createExecution(
        APPWRITE_FUNCTION_ID,
        JSON.stringify(payload),
        false // async = false (wait for completion)
      );
      
      
      if (!execution || !execution.$id) {
        throw new Error('Function execution failed - no execution ID returned');
      }
    } catch (execError) {
      // Cleanup uploaded video
      try {
        if (uploadedVideo && uploadedVideo.$id) {
          await storage.deleteFile(appwriteConfig.storageId, uploadedVideo.$id);
        }
      } catch (cleanupError) {
      }
      throw new Error(`Failed to execute Appwrite Function: ${execError.message}`);
    }

    // Step 4: Poll for execution status (if async)
    let result = execution;
    let attempts = 0;
    const maxAttempts = 300; // 5 minutes max (1 second intervals)

    while (result.status === 'waiting' || result.status === 'processing') {
      if (attempts >= maxAttempts) {
        throw new Error('Function execution timeout');
      }

      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      
      try {
        if (!execution || !execution.$id) {
          throw new Error('Execution object is invalid');
        }
        result = await functions.getExecution(execution.$id);
        } catch (statusError) {
        throw new Error(`Failed to check function execution status: ${statusError.message}`);
      }

      attempts++;
    }

    // Step 5: Parse result
    if (result.status === 'completed') {
      let responseData;
      try {
        responseData = typeof result.responseBody === 'string' 
          ? JSON.parse(result.responseBody) 
          : result.responseBody;
      } catch (parseError) {
        // If responseBody is not JSON, try to extract from stdout
        responseData = result.responseBody || { success: false };
      }

      if (responseData.success && responseData.fileId) {
        // Download processed video from Appwrite Storage
        const processedFileUrl = `${appwriteConfig.endpoint}/storage/buckets/${appwriteConfig.storageId}/files/${responseData.fileId}/view?project=${appwriteConfig.projectId}`;
        
        // Fetch the processed video
        const videoResponse = await fetch(processedFileUrl);
        if (!videoResponse.ok) {
          throw new Error(`Failed to download processed video: ${videoResponse.status} ${videoResponse.statusText}`);
        }
        const arrayBuffer = await videoResponse.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const base64 = btoa(String.fromCharCode.apply(null, uint8Array));

        // Cleanup: Optionally delete uploaded files (optional)
        try {
          await storage.deleteFile(appwriteConfig.storageId, uploadedVideo.$id);
          if (uploadedMusic) {
            await storage.deleteFile(appwriteConfig.storageId, uploadedMusic.$id);
          }
        } catch (cleanupError) {
        }

        return {
          success: true,
          base64: base64,
          type: 'video/mp4',
          fileId: responseData.fileId,
          url: processedFileUrl,
        };
      } else {
        // Log detailed error information
        const errorDetails = {
          success: responseData.success,
          error: responseData.error,
          stderr: result.stderr,
          stdout: result.stdout,
          responseBody: result.responseBody,
        };
        throw new Error(responseData.error || result.stderr || 'Video processing failed');
      }
    } else if (result.status === 'failed') {
      const errorMsg = result.stderr || result.responseBody || 'Function execution failed';
      throw new Error(errorMsg);
    } else {
      throw new Error(`Unexpected execution status: ${result.status}`);
    }

  } catch (error) {
    throw error;
  }
}

/**
 * Process video - automatically chooses between Appwrite Functions and server
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processed video information
 */
export async function processVideoAuto({ 
  video, 
  music, 
  filter = 'none', 
  filterIntensity = 100,
  musicVolume = 0.5, 
  stickers = [],
  texts = [],
  trim = null,
  videoSpeed = 1.0,
  audioFadeIn = false,
  audioFadeOut = false,
  audioDucking = false,
  videoTransition = 'none',
  transitionDuration = 0.5,
  videoClips = null,
}) {
  // Use Appwrite Functions if enabled, otherwise use server
  if (USE_APPWRITE_FUNCTIONS) {
    // Note: Appwrite Functions currently support basic features
    // For advanced features (stickers, texts, transitions, clips), use server
    if (stickers.length > 0 || texts.length > 0 || videoClips || videoTransition !== 'none') {
        return processVideo({ video, music, filter, filterIntensity, musicVolume, stickers, texts, trim, videoSpeed, audioFadeIn, audioFadeOut, audioDucking, videoTransition, transitionDuration, videoClips });
    }
    return processVideoWithAppwrite({ video, music, filter, filterIntensity, musicVolume, trim, videoSpeed });
  }
  
  return processVideo({ video, music, filter, filterIntensity, musicVolume, stickers, texts, trim, videoSpeed, audioFadeIn, audioFadeOut, audioDucking, videoTransition, transitionDuration, videoClips });
}

/**
 * Check if processing server is available
 * @returns {Promise<boolean>} True if server is available
 */
export async function checkProcessingServer() {
  try {
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
    
    const response = await fetch(`${PROCESSING_SERVER_URL}/api/health`, {
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    // Silently return false - server not available is normal, not an error
    return false;
  }
}

/**
 * Check if Appwrite Functions are available
 * @returns {Promise<boolean>} True if Appwrite Functions are available
 */
export async function checkAppwriteFunctions() {
  try {
    // Check if environment variable is set
    if (!USE_APPWRITE_FUNCTIONS) {
      return false;
    }

    // Check if function ID is configured (not default)
    if (!APPWRITE_FUNCTION_ID || APPWRITE_FUNCTION_ID === 'process-video-filter') {
      // Default value means not configured - user needs to set actual function ID
      return false;
    }

    // Verify Appwrite SDK can be imported
    try {
      const { Client, Functions } = await import('react-native-appwrite');
      const { appwriteConfig } = await import('./appwrite');
      
      // Verify config exists
      if (!appwriteConfig || !appwriteConfig.endpoint || !appwriteConfig.projectId) {
        return false;
      }

      // If all checks pass, assume function is available
      // Real validation will happen when we actually try to use it
      return true;
    } catch (importError) {
      // SDK import failed
      return false;
    }
  } catch (error) {
    return false;
  }
}
