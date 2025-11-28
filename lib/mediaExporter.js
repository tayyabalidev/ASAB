/**
 * Media Exporter
 * Handles exporting edited media (photos/videos) with all edits applied
 */

import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { processVideo, processPhoto } from './videoProcessor';

/**
 * Export edited photo with all edits applied
 * @param {Object} editedData - Edited media data
 * @param {Function} captureRef - Function to capture view with overlays (from MediaEditor)
 * @returns {Promise<Object>} Exported file object
 */
export async function exportEditedPhoto(editedData, captureRef = null) {
  try {
    const { media, filter, stickers, texts, drawings } = editedData;
    
    // If we have a capture function (from view-shot), use it to capture with overlays
    if (captureRef && (stickers?.length > 0 || texts?.length > 0 || drawings?.length > 0)) {
      try {
        const uri = await captureRef();
        if (uri) {
          // Apply filter if any
          let processedPhoto = {
            uri: uri,
            name: 'edited_photo.jpg',
            type: 'image/jpeg',
            size: media.size,
          };
          
          if (filter && filter !== 'none') {
            try {
              const result = await processPhoto({
                photo: processedPhoto,
                filter: filter,
              });
              
              if (result && result.base64) {
                const processedUri = `${FileSystem.documentDirectory}exported_photo_${Date.now()}.jpg`;
                await FileSystem.writeAsStringAsync(processedUri, result.base64, {
                  encoding: FileSystem.EncodingType.Base64,
                });
                processedPhoto = {
                  uri: processedUri,
                  name: 'edited_photo.jpg',
                  type: 'image/jpeg',
                  size: media.size,
                };
              }
            } catch (error) {
              console.log('Filter processing failed, using captured image:', error);
            }
          }
          
          return processedPhoto;
        }
      } catch (error) {
        console.log('View capture failed, falling back to server processing:', error);
      }
    }
    
    // Fallback: Apply filter if any (overlays will be lost)
    let processedPhoto = media;
    if (filter && filter !== 'none') {
      try {
        const result = await processPhoto({
          photo: media,
          filter: filter,
        });
        
        if (result && result.base64) {
          const processedUri = `${FileSystem.documentDirectory}exported_photo_${Date.now()}.jpg`;
          await FileSystem.writeAsStringAsync(processedUri, result.base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          processedPhoto = {
            uri: processedUri,
            name: 'edited_photo.jpg',
            type: 'image/jpeg',
            size: media.size,
          };
        }
      } catch (error) {
        console.log('Filter processing failed, using original:', error);
      }
    }
    
    return processedPhoto;
  } catch (error) {
    console.error('Photo export error:', error);
    throw error;
  }
}

/**
 * Export edited video with all edits applied
 * @param {Object} editedData - Edited media data
 * @returns {Promise<Object>} Exported file object
 */
export async function exportEditedVideo(editedData) {
  try {
    const { media, filter, music, videoTrim, stickers, texts } = editedData;
    
    // Process video with filter, music, and overlays
    let processedVideo = media;
    
    // Check if we need server processing (filter, music, or overlays)
    if ((filter && filter !== 'none') || music || (stickers?.length > 0) || (texts?.length > 0)) {
      try {
        // Send to server with overlay data
        const result = await processVideo({
          video: media,
          music: music,
          filter: filter || 'none',
          musicVolume: 0.5,
          stickers: stickers || [],
          texts: texts || [],
          trim: videoTrim || null,
        });
        
        if (result && result.base64) {
          const processedUri = `${FileSystem.documentDirectory}exported_video_${Date.now()}.mp4`;
          await FileSystem.writeAsStringAsync(processedUri, result.base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          processedVideo = {
            uri: processedUri,
            name: 'edited_video.mp4',
            type: 'video/mp4',
            size: media.size,
          };
        }
      } catch (error) {
        console.log('Video processing failed, using original:', error);
      }
    }
    
    return processedVideo;
  } catch (error) {
    console.error('Video export error:', error);
    throw error;
  }
}

/**
 * Export edited media (photo or video)
 * @param {Object} editedData - Edited media data
 * @param {Function} captureRef - Function to capture view (photos only)
 * @returns {Promise<Object>} Exported file object ready for upload
 */
export async function exportEditedMedia(editedData, captureRef = null) {
  const { mediaType } = editedData;
  
  if (mediaType === 'photo') {
    return await exportEditedPhoto(editedData, captureRef);
  } else if (mediaType === 'video') {
    return await exportEditedVideo(editedData);
  } else {
    throw new Error('Invalid media type');
  }
}
