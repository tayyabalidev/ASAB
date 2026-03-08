/**
 * Appwrite Function: Process Video with Filters
 * This function processes videos using FFmpeg and stores them in Appwrite Storage
 */

const { Client, Storage, ID, InputFile } = require('node-appwrite');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Check if FFmpeg is available
let ffmpegAvailable = false;
try {
  execSync('ffmpeg -version', { stdio: 'ignore' });
  ffmpegAvailable = true;
} catch (error) {
  ffmpegAvailable = false;
}

// Video filter presets (matching server implementation)
const videoFilters = {
  'none': { filter: '', intensity: 1.0 },
  // Instagram-style location filters
  'wavy': { filter: 'eq=brightness=0.05:contrast=0.95:saturation=0.85', intensity: 1.0 },
  'paris': { filter: 'eq=brightness=0.08:contrast=1.1:saturation=1.15', intensity: 1.0 },
  'losangeles': { filter: 'eq=brightness=0.15:contrast=1.05:saturation=1.2', intensity: 1.0 },
  'oslo': { filter: 'eq=brightness=-0.05:contrast=1.1:saturation=0.9', intensity: 1.0 },
  'tokyo': { filter: 'eq=brightness=0.1:contrast=1.15:saturation=1.1', intensity: 1.0 },
  'london': { filter: 'eq=brightness=-0.1:contrast=1.2:saturation=0.95', intensity: 1.0 },
  'moscow': { filter: 'eq=brightness=-0.08:contrast=1.25:saturation=0.88', intensity: 1.0 },
  'berlin': { filter: 'eq=brightness=-0.02:contrast=1.15:saturation=1.05', intensity: 1.0 },
  'rome': { filter: 'eq=brightness=0.12:contrast=1.08:saturation=1.18', intensity: 1.0 },
  'madrid': { filter: 'eq=brightness=0.05:contrast=1.2:saturation=1.12', intensity: 1.0 },
  'amsterdam': { filter: 'eq=brightness=0.08:contrast=1.05:saturation=1.1', intensity: 1.0 },
  // Classic filters
  'vintage': { filter: 'curves=vintage', intensity: 1.0 },
  'blackwhite': { filter: 'hue=s=0', intensity: 1.0 },
  'sepia': { filter: 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131', intensity: 1.0 },
  'cool': { filter: 'eq=gamma=1.1:contrast=1.1:brightness=0.05', intensity: 1.0 },
  'warm': { filter: 'eq=gamma=0.9:contrast=1.1:brightness=0.05', intensity: 1.0 },
  'contrast': { filter: 'eq=contrast=1.3', intensity: 1.0 },
  'bright': { filter: 'eq=brightness=0.2:contrast=1.2', intensity: 1.0 },
  'dramatic': { filter: 'eq=contrast=1.5:saturation=1.2:brightness=0.1', intensity: 1.0 },
  'portrait': { filter: 'eq=gamma=1.05:contrast=1.15:saturation=0.95', intensity: 1.0 },
  'cinema': { filter: 'curves=cross_process', intensity: 1.0 },
  'noir': { filter: 'eq=gamma=0.8:contrast=1.4:saturation=0', intensity: 1.0 },
  'vivid': { filter: 'eq=saturation=1.5:contrast=1.2', intensity: 1.0 },
  'fade': { filter: 'eq=contrast=1.1:brightness=0.05', intensity: 1.0 },
  'chrome': { filter: 'eq=gamma=1.2:contrast=1.3:saturation=1.1', intensity: 1.0 },
  'process': { filter: 'curves=preset=strong_contrast', intensity: 1.0 },
};

// Helper to apply filter intensity
const applyFilterIntensity = (filterString, intensity) => {
  if (!filterString || intensity === 100) return filterString;
  const intensityMultiplier = intensity / 100;
  
  if (filterString && intensityMultiplier < 1.0) {
    return `format=yuv420p,eq=gamma=1:contrast=1:brightness=0[base];${filterString}[filtered];[base][filtered]blend=all_mode=overlay:all_opacity=${intensityMultiplier}`;
  }
  return filterString;
};

module.exports = async (req, res) => {
  let tempInputPath = null;
  let tempOutputPath = null;
  
  try {
    // Parse request payload
    let payload;
    try {
      payload = typeof req.payload === 'string' ? JSON.parse(req.payload) : req.payload;
    } catch (parseError) {
      return res.json({
        success: false,
        error: 'Invalid payload format'
      }, 400);
    }

    // Get parameters from payload
    const videoFileId = payload.videoFileId;
    const filter = payload.filter || 'none';
    const filterIntensity = parseInt(payload.filterIntensity) || 100;
    const videoSpeed = parseFloat(payload.videoSpeed) || 1.0;
    const trim = payload.trim || null;
    const musicFileId = payload.musicFileId || null;
    const musicVolume = parseFloat(payload.musicVolume) || 0.5;

    if (!videoFileId) {
      return res.json({
        success: false,
        error: 'videoFileId is required'
      }, 400);
    }

    // Check if FFmpeg is available
    if (!ffmpegAvailable) {
      return res.json({
        success: false,
        error: 'FFmpeg is not available in this environment. Please use a separate server for video processing or configure FFmpeg in the function environment.',
        suggestion: 'Use the separate server approach (already implemented in your codebase)'
      }, 500);
    }

    // Initialize Appwrite client
    const client = new Client();
    client
      .setEndpoint(req.env.APPWRITE_ENDPOINT || process.env.APPWRITE_ENDPOINT)
      .setProject(req.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT_ID)
      .setKey(req.env.APPWRITE_API_KEY || process.env.APPWRITE_API_KEY);

    const storage = new Storage(client);
    const storageId = req.env.APPWRITE_STORAGE_ID || process.env.APPWRITE_STORAGE_ID;

    if (!storageId) {
      return res.json({
        success: false,
        error: 'APPWRITE_STORAGE_ID environment variable is required'
      }, 500);
    }

    // Download video from Appwrite Storage
    const videoBuffer = await storage.getFileDownload(storageId, videoFileId);
    
    // Create temp file paths
    const timestamp = Date.now();
    tempInputPath = `/tmp/input_${timestamp}.mp4`;
    tempOutputPath = `/tmp/output_${timestamp}.mp4`;

    // Write video buffer to temp file
    fs.writeFileSync(tempInputPath, Buffer.from(videoBuffer));

    // Build FFmpeg command
    let command = ffmpeg(tempInputPath);

    // Apply trim if provided
    if (trim && trim.start !== undefined && trim.end !== undefined) {
      command = command
        .setStartTime(trim.start)
        .setDuration(trim.end - trim.start);
    }

    // Apply video speed
    if (videoSpeed && videoSpeed !== 1.0) {
      command = command.videoFilters([`setpts=${1.0 / videoSpeed}*PTS`]);
      command = command.audioFilters([`atempo=${videoSpeed}`]);
    }

    // Apply video filter with intensity
    if (filter && filter !== 'none' && videoFilters[filter]) {
      const filterConfig = videoFilters[filter];
      const filterStr = applyFilterIntensity(filterConfig.filter, filterIntensity);
      if (filterStr) {
        command = command.videoFilters([filterStr]);
      }
    }

    // Add music if provided
    if (musicFileId) {
      try {
        const musicBuffer = await storage.getFileDownload(storageId, musicFileId);
        const tempMusicPath = `/tmp/music_${timestamp}.mp3`;
        fs.writeFileSync(tempMusicPath, Buffer.from(musicBuffer));
        
        command = command
          .input(tempMusicPath)
          .complexFilter([
            {
              filter: 'amix',
              options: {
                inputs: 2,
                duration: 'longest',
                dropout_transition: 2
              },
              inputs: ['0:a', '1:a'],
              outputs: 'mixed'
            }
          ])
          .outputOptions([
            '-map 0:v',
            '-map [mixed]',
            '-c:v libx264',
            '-c:a aac',
            '-b:a 192k',
            `-filter:a "volume=${musicVolume}"`
          ]);

        // Cleanup music file after processing
        setTimeout(() => {
          try {
            if (fs.existsSync(tempMusicPath)) {
              fs.unlinkSync(tempMusicPath);
            }
          } catch (e) {
          }
        }, 5000);
      } catch (musicError) {
        // Continue without music if music processing fails
      }
    }

    // Process video
    await new Promise((resolve, reject) => {
      command
        .output(tempOutputPath)
        .on('end', () => {
          resolve();
        })
        .on('error', (err) => {
          reject(err);
        })
        .on('progress', (progress) => {
        })
        .run();
    });

    // Read processed video
    const processedBuffer = fs.readFileSync(tempOutputPath);

    // Upload processed video back to Appwrite Storage
    const processedFile = await storage.createFile(
      storageId,
      ID.unique(),
      InputFile.fromBuffer(processedBuffer, `processed_${timestamp}.mp4`)
    );

    // Cleanup temp files
    try {
      if (fs.existsSync(tempInputPath)) {
        fs.unlinkSync(tempInputPath);
      }
      if (fs.existsSync(tempOutputPath)) {
        fs.unlinkSync(tempOutputPath);
      }
    } catch (cleanupError) {
    }

    // Return processed file information
    const endpoint = req.env.APPWRITE_ENDPOINT || process.env.APPWRITE_ENDPOINT;
    const projectId = req.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT_ID;
    const fileUrl = `${endpoint}/storage/buckets/${storageId}/files/${processedFile.$id}/view?project=${projectId}`;

    return res.json({
      success: true,
      fileId: processedFile.$id,
      url: fileUrl,
      message: 'Video processed successfully'
    });

  } catch (error) {
    
    // Cleanup temp files on error
    try {
      if (tempInputPath && fs.existsSync(tempInputPath)) {
        fs.unlinkSync(tempInputPath);
      }
      if (tempOutputPath && fs.existsSync(tempOutputPath)) {
        fs.unlinkSync(tempOutputPath);
      }
    } catch (cleanupError) {
    }

    return res.json({
      success: false,
      error: error.message || 'Video processing failed'
    }, 500);
  }
};
