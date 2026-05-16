// Load environment variables FIRST before using them
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const sharp = require('sharp');
const fs = require('fs');
const axios = require('axios');
// Initialize Stripe with secret key (trim whitespace)
const stripeSecretKey = (process.env.STRIPE_SECRET_KEY || '').trim();
const stripe = stripeSecretKey ? require('stripe')(stripeSecretKey) : null;

const app = express();
const PORT = process.env.PORT || 3001;
const muxHandlers = require('./mux');

// Mux webhook must see raw body for signature verification (before express.json)
app.post(
  '/api/mux/webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => muxHandlers.handleMuxWebhook(req, res)
);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mux direct upload URL (JSON body)
app.post('/api/mux/direct-upload', (req, res) => muxHandlers.handleDirectUploadRequest(req, res));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
const processedDir = path.join(__dirname, 'processed');

[uploadsDir, processedDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2GB limit
});

// Helper function to clean up files
const cleanupFiles = (files) => {
  files.forEach(file => {
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch (err) {
      }
    }
  });
};

// Process single video with all enhancements
const processSingleVideo = async (videoPath, options, outputPath) => {
  const {
    filter,
    filterIntensity,
    videoSpeed,
    trimData,
    textsData,
    musicFile,
    musicVolume,
    audioFadeIn,
    audioFadeOut,
    audioDucking,
  } = options;

  return new Promise((resolve, reject) => {
    let command = ffmpeg(videoPath);
    
    // Apply trim if provided
    if (trimData && trimData.start !== undefined && trimData.end !== undefined) {
      command = command
        .setStartTime(trimData.start)
        .setDuration(trimData.end - trimData.start);
    }

    // Apply video speed
    if (videoSpeed && videoSpeed !== 1.0) {
      command = command.videoFilters([`setpts=${1.0 / videoSpeed}*PTS`]);
      // Also adjust audio speed
      command = command.audioFilters([`atempo=${videoSpeed}`]);
    }

    // Build video filter chain
    let videoFilterChain = [];
    
    // Apply video filter with intensity
    if (filter && filter !== 'none' && videoFilters[filter]) {
      const filterConfig = videoFilters[filter];
      const filterStr = applyFilterIntensity(filterConfig.filter, filterIntensity);
      if (filterStr) {
        videoFilterChain.push(filterStr);
      }
    }
    
    // Add text overlays
    if (textsData && textsData.length > 0) {
      textsData.forEach((text, index) => {
        const x = text.x || 10;
        const y = text.y || 10;
        const fontSize = text.fontSize || 24;
        const textColor = text.color || 'white';
        const textContent = text.text || '';
        
        // Escape special characters for FFmpeg
        const escapedText = textContent.replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/\\/g, '\\\\');
        
        // Handle text alignment
        const alignment = text.alignment || 'center';
        let xPosition = x;
        if (alignment === 'center') {
          xPosition = `(w-text_w)/2+${x}`;
        } else if (alignment === 'right') {
          xPosition = `w-text_w-${x}`;
        }
        
        // Build drawtext filter with background if needed
        let drawtextFilter = `drawtext=text='${escapedText}':x=${xPosition}:y=${y}:fontsize=${fontSize}:fontcolor=${textColor}`;
        
        if (text.backgroundColor) {
          const bgColor = text.backgroundColor.replace('#', '0x');
          const bgOpacity = text.backgroundOpacity || 0.5;
          drawtextFilter += `:box=1:boxcolor=${bgColor}@${bgOpacity}:boxborderw=5`;
        }
        
        if (text.hasShadow !== false) {
          drawtextFilter += `:shadowcolor=black@0.5:shadowx=1:shadowy=1`;
        }
        
        videoFilterChain.push(drawtextFilter);
      });
    }
    
    // Apply video filters
    if (videoFilterChain.length > 0) {
      command = command.videoFilters(videoFilterChain);
    }

    // Build audio filter chain
    let audioFilters = [];
    
    // Audio fade in
    if (audioFadeIn) {
      audioFilters.push('afade=t=in:ss=0:d=1');
    }
    
    // Audio fade out - need to get duration first
    // Will be handled after processing or estimated
    
    // Add music if provided
    if (musicFile) {
      command = command.input(musicFile.path);
      
      // Apply audio ducking if enabled
      if (audioDucking) {
        // Lower original audio volume when music plays
        audioFilters.push('volume=0.3'); // Lower original audio
      }
      
      // Complex filter for mixing
      const complexFilter = [{
        filter: 'amix',
        options: {
          inputs: 2,
          duration: 'longest',
          dropout_transition: 2
        },
        inputs: ['0:a', '1:a'],
        outputs: 'mixed'
      }];
      
      if (audioFilters.length > 0) {
        // Apply audio filters to original audio before mixing
        complexFilter.unshift({
          filter: 'volume',
          options: { volume: audioDucking ? '0.3' : '1.0' },
          inputs: ['0:a'],
          outputs: 'filtered_audio'
        });
        complexFilter[1].inputs = ['filtered_audio', '1:a'];
      }
      
      command = command
        .complexFilter(complexFilter, 'mixed')
        .outputOptions([
          '-map 0:v',
          '-map [mixed]',
          '-c:v libx264',
          '-c:a aac',
          '-b:a 192k',
          `-filter:a "volume=${musicVolume}"`
        ]);
    } else if (audioFilters.length > 0) {
      command = command.audioFilters(audioFilters);
    }

    // Process video
    command
      .output(outputPath)
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
};

// Process multiple video clips with transitions
const processMultipleClips = async (videoFiles, clipsData, options, outputPath, cleanupFn) => {
  const {
    filter,
    filterIntensity,
    videoSpeed,
    videoTransition,
    transitionDuration,
    textsData,
    musicFile,
    musicVolume,
    audioFadeIn,
    audioFadeOut,
    audioDucking,
  } = options;

  try {
    // Create temporary directory for processed clips
    const tempDir = path.join(processedDir, `temp_${Date.now()}`);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const processedClips = [];
    
    // Process each clip individually first
    for (let i = 0; i < clipsData.length && i < videoFiles.length; i++) {
      const clip = clipsData[i];
      const videoFile = videoFiles[i];
      const clipOutputPath = path.join(tempDir, `clip_${i}.mp4`);
      
      // Find matching video file or use by index
      const clipVideoPath = videoFile.path;
      
      await processSingleVideo(
        clipVideoPath,
        {
          filter,
          filterIntensity,
          videoSpeed,
          trimData: { start: clip.trimStart || 0, end: clip.trimEnd || 60 },
          textsData: i === 0 ? textsData : [], // Apply texts only to first clip or distribute
          musicFile: null, // Music will be added after merging
          musicVolume,
          audioFadeIn: i === 0 && audioFadeIn, // Fade in only on first clip
          audioFadeOut: false,
          audioDucking: false,
        },
        clipOutputPath
      );
      
      processedClips.push(clipOutputPath);
    }

    // Merge clips with transitions
    return new Promise((resolve, reject) => {
      let command = ffmpeg();
      
      // Add all processed clips as inputs
      processedClips.forEach(clipPath => {
        command = command.input(clipPath);
      });

      // Build complex filter for merging with transitions
      const complexFilters = [];
      let currentOutput = '0:v';
      let currentAudio = '0:a';

      for (let i = 1; i < processedClips.length; i++) {
        const prevOutput = i === 1 ? '0:v' : `merged${i - 1}`;
        const prevAudio = i === 1 ? '0:a' : `merged_audio${i - 1}`;
        
        if (videoTransition === 'fade') {
          // Fade transition
          complexFilters.push({
            filter: 'xfade',
            options: {
              transition: 'fade',
              duration: transitionDuration,
              offset: `PTS-STARTPTS`
            },
            inputs: [prevOutput, `${i}:v`],
            outputs: `merged${i}`
          });
        } else if (videoTransition === 'crossfade') {
          // Crossfade (same as fade but different offset calculation)
          complexFilters.push({
            filter: 'xfade',
            options: {
              transition: 'fade',
              duration: transitionDuration,
              offset: `PTS-STARTPTS`
            },
            inputs: [prevOutput, `${i}:v`],
            outputs: `merged${i}`
          });
        } else if (videoTransition === 'slide') {
          // Slide transition
          complexFilters.push({
            filter: 'xfade',
            options: {
              transition: 'slideleft',
              duration: transitionDuration,
              offset: `PTS-STARTPTS`
            },
            inputs: [prevOutput, `${i}:v`],
            outputs: `merged${i}`
          });
        } else {
          // No transition - concat
          complexFilters.push({
            filter: 'concat',
            options: { n: 2, v: 1, a: 1 },
            inputs: [prevOutput, `${i}:v`],
            outputs: `merged${i}`
          });
        }
        
        // Merge audio
        complexFilters.push({
          filter: 'concat',
          options: { n: 2, v: 0, a: 1 },
          inputs: [prevAudio, `${i}:a`],
          outputs: `merged_audio${i}`
        });
        
        currentOutput = `merged${i}`;
        currentAudio = `merged_audio${i}`;
      }

      // Determine output labels based on processing type
      let videoOutputLabel, audioOutputLabel;
      let useComplexFilter = false;
      
      if (processedClips.length === 1 || videoTransition === 'none') {
        // Use concat for simple merging
        const concatFile = path.join(tempDir, 'concat.txt');
        const concatContent = processedClips.map(clip => `file '${clip.replace(/\\/g, '/')}'`).join('\n');
        fs.writeFileSync(concatFile, concatContent);
        
        command = ffmpeg(concatFile)
          .inputOptions(['-f', 'concat', '-safe', '0']);
        
        videoOutputLabel = '0:v';
        audioOutputLabel = '0:a';
        useComplexFilter = false;
      } else {
        // Use complex filter for transitions
        const lastVideoOutput = `merged${processedClips.length - 1}`;
        const lastAudioOutput = `merged_audio${processedClips.length - 1}`;
        
        videoOutputLabel = lastVideoOutput;
        audioOutputLabel = lastAudioOutput;
        useComplexFilter = true;
      }

      // Add music if provided
      if (musicFile) {
        const musicInputIndex = processedClips.length;
        command = command.input(musicFile.path);
        
        const audioMixFilter = {
          filter: 'amix',
          options: {
            inputs: 2,
            duration: 'longest',
            dropout_transition: 2
          },
          inputs: [audioOutputLabel, `${musicInputIndex}:a`],
          outputs: 'final_audio'
        };
        
        // Add audio mix filter
        if (useComplexFilter) {
          // Add to existing complex filters
          complexFilters.push(audioMixFilter);
          command = command.complexFilter(complexFilters, [videoOutputLabel, 'final_audio']);
        } else {
          // Simple case - just add audio mix
          command = command.complexFilter([audioMixFilter], ['final_audio']);
        }
        audioOutputLabel = 'final_audio';
      } else if (useComplexFilter) {
        // Apply complex filters without music
        command = command.complexFilter(complexFilters, [videoOutputLabel, audioOutputLabel]);
      }

      // Build output options based on processing type
      let outputOptions = [];
      
      if (!useComplexFilter) {
        // Simple concat - use standard mapping
        if (musicFile) {
          // If music was added, use filter output
          outputOptions = [
            '-map 0:v',
            `-map [${audioOutputLabel}]`,
            '-c:v libx264',
            '-c:a aac',
            '-b:a 192k',
            '-pix_fmt yuv420p'
          ];
        } else {
          // No music - use direct mapping
          outputOptions = [
            '-map 0:v',
            '-map 0:a',
            '-c:v libx264',
            '-c:a aac',
            '-b:a 192k',
            '-pix_fmt yuv420p'
          ];
        }
      } else {
        // Complex filter - map to filter outputs
        outputOptions = [
          `-map [${videoOutputLabel}]`,
          `-map [${audioOutputLabel}]`,
          '-c:v libx264',
          '-c:a aac',
          '-b:a 192k',
          '-pix_fmt yuv420p'
        ];
      }

      // Apply audio fade out if needed
      if (audioFadeOut) {
        command = command.outputOptions('-af', 'afade=t=out:st=0:d=1');
      }

      command
        .outputOptions(outputOptions)
        .output(outputPath)
        .on('end', () => {
          // Cleanup temp files
          cleanupFn([...processedClips, tempDir]);
          resolve();
        })
        .on('error', (err) => {
          cleanupFn([...processedClips, tempDir]);
          reject(err);
        })
        .run();
    });
  } catch (error) {
    throw error;
  }
};

// Video filter presets (FFmpeg filters) - returns filter string and intensity multiplier
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
  
  // For simple filters, we can blend with original
  // For complex filters, we use blend filter
  if (filterString && intensityMultiplier < 1.0) {
    return `format=yuv420p,eq=gamma=1:contrast=1:brightness=0[base];${filterString}[filtered];[base][filtered]blend=all_mode=overlay:all_opacity=${intensityMultiplier}`;
  }
  return filterString;
};

// Photo filter presets (Sharp operations) - returns processed image
const photoFilters = {
  'none': async (image) => image,
  'vintage': async (image) => image.modulate({ brightness: 1.1, saturation: 0.8 }).sharpen(),
  'blackwhite': async (image) => image.greyscale(),
  'sepia': async (image) => {
    const { data, info } = await image
      .modulate({ brightness: 1.1, saturation: 0.5 })
      .toBuffer({ resolveWithObject: true });
    return sharp(data).greyscale().tint({ r: 112, g: 66, b: 20 });
  },
  'cool': async (image) => image.modulate({ hue: 30, saturation: 0.9 }),
  'warm': async (image) => image.modulate({ hue: -30, saturation: 1.1 }),
  'contrast': async (image) => image.modulate({ brightness: 1, saturation: 1 }).linear(1.3, -(128 * 0.3)),
  'bright': async (image) => image.modulate({ brightness: 1.2, saturation: 1.1 }),
  'dramatic': async (image) => image.modulate({ brightness: 1.1, saturation: 1.2 }).linear(1.5, -(128 * 0.5)),
  'portrait': async (image) => image.modulate({ brightness: 1.05, saturation: 0.95 }).linear(1.15, -(128 * 0.15)),
  'cinema': async (image) => {
    const { data } = await image
      .modulate({ brightness: 0.95, saturation: 1.1 })
      .toBuffer({ resolveWithObject: true });
    return sharp(data).linear(1.2, -(128 * 0.2));
  },
  'noir': async (image) => image.greyscale().linear(1.4, -(128 * 0.4)).modulate({ brightness: 0.8 }),
  'vivid': async (image) => image.modulate({ saturation: 1.5, brightness: 1.05 }).linear(1.2, -(128 * 0.2)),
  'fade': async (image) => image.modulate({ brightness: 1.05, saturation: 0.9 }),
  'chrome': async (image) => image.modulate({ brightness: 1.2, saturation: 1.1 }).linear(1.3, -(128 * 0.3)),
  'process': async (image) => image.linear(1.5, -(128 * 0.5)).modulate({ saturation: 1.2 }),
};

// Helper to apply filter intensity for photos
const applyPhotoFilterIntensity = async (image, filterFn, intensity) => {
  if (!filterFn || intensity === 100) {
    return await filterFn(image);
  }
  
  const intensityRatio = intensity / 100;
  
  // Get original and filtered versions
  const originalBuffer = await image.toBuffer();
  const filteredImage = await filterFn(sharp(originalBuffer));
  const filteredBuffer = await filteredImage.toBuffer();
  
  // Blend based on intensity (simplified approach - blend original with filtered)
  const blended = sharp(originalBuffer)
    .composite([{
      input: filteredBuffer,
      blend: 'over',
      raw: {
        width: (await sharp(originalBuffer).metadata()).width,
        height: (await sharp(originalBuffer).metadata()).height,
        channels: 4
      }
    }]);
    
  // For intensity < 100%, we need to blend
  // This is a simplified approach - for better results, use overlay blend
  return intensityRatio < 1.0 ? 
    sharp(originalBuffer).composite([{ input: filteredBuffer, blend: 'over', tile: false, opacity: intensityRatio }]) :
    filteredImage;
};

// Process Video with Filter, Music, and Overlays
app.post('/api/process-video', upload.fields([
  { name: 'video', maxCount: 10 }, // Allow multiple videos for clips
  { name: 'music', maxCount: 1 }
]), async (req, res) => {
  const { 
    filter = 'none', 
    filterIntensity = 100,
    musicVolume = 0.5, 
    stickers, 
    texts, 
    trim,
    videoSpeed = 1.0,
    videoTransition = 'none',
    transitionDuration = 0.5,
    videoClips,
    audioFadeIn = false,
    audioFadeOut = false,
    audioDucking = false,
  } = req.body;
  const videoFiles = req.files?.video || [];
  const musicFile = req.files?.music?.[0];

  if (!videoFiles || videoFiles.length === 0) {
    return res.status(400).json({ error: 'No video file provided' });
  }

  const outputPath = path.join(processedDir, `processed_${Date.now()}.mp4`);
  
  // Parse JSON strings if provided
  let stickersData = [];
  let textsData = [];
  let trimData = null;
  let clipsData = null;
  
  try {
    if (stickers) {
      stickersData = typeof stickers === 'string' ? JSON.parse(stickers) : stickers;
    }
    if (texts) {
      textsData = typeof texts === 'string' ? JSON.parse(texts) : texts;
    }
    if (trim) {
      trimData = typeof trim === 'string' ? JSON.parse(trim) : trim;
    }
    if (videoClips) {
      clipsData = typeof videoClips === 'string' ? JSON.parse(videoClips) : videoClips;
    }
  } catch (parseError) {
  }

  try {
    // Handle multiple video clips
    if (clipsData && Array.isArray(clipsData) && clipsData.length > 1 && videoFiles.length > 1) {
      // Process multiple clips with transitions
      await processMultipleClips(
        videoFiles,
        clipsData,
        {
          filter,
          filterIntensity: parseFloat(filterIntensity) || 100,
          videoSpeed: parseFloat(videoSpeed) || 1.0,
          videoTransition,
          transitionDuration: parseFloat(transitionDuration) || 0.5,
          textsData,
          musicFile,
          musicVolume: parseFloat(musicVolume) || 0.5,
          audioFadeIn: audioFadeIn === 'true' || audioFadeIn === true,
          audioFadeOut: audioFadeOut === 'true' || audioFadeOut === true,
          audioDucking: audioDucking === 'true' || audioDucking === true,
        },
        outputPath,
        cleanupFiles
      );
    } else {
      // Process single video (original logic with enhancements)
      const videoFile = videoFiles[0];
      const videoPath = videoFile.path;
      
      await processSingleVideo(
        videoPath,
        {
          filter,
          filterIntensity: parseFloat(filterIntensity) || 100,
          videoSpeed: parseFloat(videoSpeed) || 1.0,
          trimData,
          textsData,
          musicFile,
          musicVolume: parseFloat(musicVolume) || 0.5,
          audioFadeIn: audioFadeIn === 'true' || audioFadeIn === true,
          audioFadeOut: audioFadeOut === 'true' || audioFadeOut === true,
          audioDucking: audioDucking === 'true' || audioDucking === true,
        },
        outputPath
      );
    }

    // Return processed video file
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="processed_${Date.now()}.mp4"`);
    
    const fileStream = fs.createReadStream(outputPath);
    fileStream.pipe(res);
    
    // Cleanup after sending
    const filesToCleanup = [...videoFiles.map(f => f.path), musicFile?.path, outputPath].filter(Boolean);
    fileStream.on('end', () => {
      cleanupFiles(filesToCleanup);
    });
    
    fileStream.on('error', (err) => {
      cleanupFiles(filesToCleanup);
    });

  } catch (error) {
    const filesToCleanup = [...videoFiles.map(f => f.path), musicFile?.path, outputPath].filter(Boolean);
    cleanupFiles(filesToCleanup);
    res.status(500).json({ error: 'Video processing failed', details: error.message });
  }
});

// Process Photo with Filter and Adjustments
app.post('/api/process-photo', upload.single('photo'), async (req, res) => {
  const { 
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
  } = req.body;
  const photoFile = req.file;

  if (!photoFile) {
    return res.status(400).json({ error: 'No photo file provided' });
  }

  const photoPath = photoFile.path;
  const outputPath = path.join(processedDir, `processed_${Date.now()}.jpg`);

  try {
    let image = sharp(photoPath);

    // Apply filter with intensity
    if (filter && filter !== 'none' && photoFilters[filter]) {
      const filterIntensityNum = parseFloat(filterIntensity) || 100;
      image = await applyPhotoFilterIntensity(image, photoFilters[filter], filterIntensityNum);
    }

    // Apply adjustments (convert from -100 to 100 range to appropriate values)
    const adjustments = {
      brightness: parseFloat(brightness) || 0,
      contrast: parseFloat(contrast) || 0,
      saturation: parseFloat(saturation) || 0,
      warmth: parseFloat(warmth) || 0,
      shadows: parseFloat(shadows) || 0,
      highlights: parseFloat(highlights) || 0,
      structure: parseFloat(structure) || 0,
      vignette: parseFloat(vignette) || 0,
    };

    // Apply brightness (-100 to 100 -> 0.5 to 1.5)
    if (adjustments.brightness !== 0) {
      const brightnessValue = 1 + (adjustments.brightness / 100);
      image = image.modulate({ brightness: brightnessValue });
    }

    // Apply contrast (-100 to 100 -> 0.5 to 1.5, then convert to linear)
    if (adjustments.contrast !== 0) {
      const contrastValue = 1 + (adjustments.contrast / 100);
      image = image.linear(contrastValue, -(128 * (contrastValue - 1)));
    }

    // Apply saturation (-100 to 100 -> 0 to 2)
    if (adjustments.saturation !== 0) {
      const saturationValue = 1 + (adjustments.saturation / 100);
      image = image.modulate({ saturation: saturationValue });
    }

    // Apply warmth (color temperature) - adjust hue
    if (adjustments.warmth !== 0) {
      // Warmth: positive = warmer (red/yellow), negative = cooler (blue)
      const hueShift = adjustments.warmth * 0.3; // Scale down hue shift
      image = image.modulate({ hue: 180 + hueShift }); // 180 is neutral
    }

    // Apply structure/clarity (sharpening)
    if (adjustments.structure !== 0) {
      const structureValue = Math.abs(adjustments.structure) / 100;
      if (adjustments.structure > 0) {
        image = image.sharpen({ sigma: structureValue * 2 });
      } else {
        // Negative structure = blur (reduce sharpness)
        image = image.blur(structureValue);
      }
    }

    // Apply vignette (darken edges)
    if (adjustments.vignette > 0) {
      const vignetteStrength = adjustments.vignette / 100;
      const { width, height } = await image.metadata();
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.sqrt(width * width + height * height) / 2;
      
      // Create vignette using composite with radial gradient
      // This is a simplified vignette - for better results, use a proper vignette filter
      image = image.modulate({ brightness: 1 - (vignetteStrength * 0.3) });
    }

    // Shadows and Highlights are complex - would need advanced image processing
    // For now, we approximate with brightness adjustments
    if (adjustments.shadows !== 0 || adjustments.highlights !== 0) {
      // Shadows: lift dark areas
      // Highlights: compress bright areas
      // This requires tone curve adjustments which Sharp doesn't support directly
      // We can approximate with gamma correction
      if (adjustments.shadows > 0) {
        const gamma = 1 - (adjustments.shadows / 200); // Lift shadows
        image = image.gamma(gamma);
      }
      if (adjustments.highlights < 0) {
        // Compress highlights
        // This would ideally use curves, but gamma can approximate
        image = image.modulate({ brightness: 0.95 });
      }
    }

    // Save processed image
    await image.jpeg({ quality: 90 }).toFile(outputPath);

    // Return processed photo file
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `attachment; filename="processed_${Date.now()}.jpg"`);
    
    const fileStream = fs.createReadStream(outputPath);
    fileStream.pipe(res);
    
    // Cleanup after sending
    fileStream.on('end', () => {
      cleanupFiles([photoPath, outputPath]);
    });
    
    fileStream.on('error', (err) => {
      cleanupFiles([photoPath, outputPath]);
    });

  } catch (error) {
    cleanupFiles([photoPath, outputPath]);
    res.status(500).json({ error: 'Photo processing failed', details: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Video/Photo Processing Service is running' });
});

// ==================== VideoSDK (calls) — JWT must be minted server-side ====================
const jwt = require('jsonwebtoken');
const VIDEOSDK_ROOMS_URL = 'https://api.videosdk.live/v2/rooms';

function safeDecodeJwtNoVerify(token) {
  try {
    if (!token || typeof token !== 'string') return null;
    const decoded = jwt.decode(token);
    return decoded && typeof decoded === 'object' ? decoded : null;
  } catch (_) {
    return null;
  }
}

/**
 * POST /create-room
 * Creates a VideoSDK room server-side using VIDEOSDK_AUTH_TOKEN (preferred)
 * or VIDEOSDK_API_KEY fallback.
 */
app.post('/create-room', async (req, res) => {
  const authToken = (process.env.VIDEOSDK_AUTH_TOKEN || '').trim();
  const apiKey = (process.env.VIDEOSDK_API_KEY || '').trim();
  const authHeader = authToken || apiKey;
  const authTokenClaims = safeDecodeJwtNoVerify(authToken);
  const authSource = authToken ? 'VIDEOSDK_AUTH_TOKEN' : 'VIDEOSDK_API_KEY';
  const authApiKeyHint = authTokenClaims?.apikey || apiKey || null;

  if (!authHeader) {
    return res.status(503).json({
      error: 'VideoSDK room API not configured',
      message: 'Set VIDEOSDK_AUTH_TOKEN (preferred) or VIDEOSDK_API_KEY in server environment',
    });
  }

  try {
    const response = await axios.post(
      VIDEOSDK_ROOMS_URL,
      {},
      {
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
      }
    );

    const roomId = response?.data?.roomId || response?.data?.room_id || response?.data?.id || '';
    if (!roomId) {
      return res.status(502).json({
        error: 'Room creation response missing roomId',
        details: response?.data || null,
      });
    }

    return res.json({
      roomId,
      debug: {
        authSource,
        apiKeyHint: authApiKeyHint,
      },
    });
  } catch (e) {
    const status = e?.response?.status || 500;
    const detail = e?.response?.data || e?.message || 'unknown';
    return res.status(status).json({
      error: 'Failed to create VideoSDK room',
      details: detail,
    });
  }
});

/**
 * GET /get-token?roomId=...&participantId=...
 * Returns { token } for @videosdk.live/react-native-sdk MeetingProvider.
 * Set VIDEOSDK_API_KEY and VIDEOSDK_SECRET_KEY in server/.env (same values as VideoSDK dashboard).
 */
app.get('/get-token', (req, res) => {
  const apiKey = (process.env.VIDEOSDK_API_KEY || '').trim();
  const secretKey = (process.env.VIDEOSDK_SECRET_KEY || '').trim();
  const roomId = typeof req.query.roomId === 'string' ? req.query.roomId.trim() : '';
  const participantId =
    typeof req.query.participantId === 'string' ? req.query.participantId : '';

  if (!apiKey || !secretKey) {
    return res.status(503).json({
      error: 'VideoSDK not configured',
      message: 'Set VIDEOSDK_API_KEY and VIDEOSDK_SECRET_KEY in server environment',
    });
  }
  if (!roomId) {
    return res.status(400).json({
      error: 'roomId is required',
      message: 'Pass VideoSDK roomId from /v2/rooms as ?roomId=...',
    });
  }

  // Match Appwrite videosdk-token (version:2 + roomId; no roles — rtc breaks RN SDK join).
  const payload = {
    apikey: apiKey,
    permissions: ['allow_join', 'allow_mod'],
    version: 2,
    roomId,
  };
  if (participantId) payload.participantId = participantId;

  try {
    const token = jwt.sign(payload, secretKey, { expiresIn: '2h', algorithm: 'HS256' });
    const tokenClaims = safeDecodeJwtNoVerify(token) || {};
    return res.json({
      token,
      debug: {
        requestedRoomId: roomId,
        participantId: participantId || null,
        tokenRoomId: tokenClaims.roomId || null,
        tokenApiKey: tokenClaims.apikey || null,
        tokenPermissions: Array.isArray(tokenClaims.permissions) ? tokenClaims.permissions : [],
      },
    });
  } catch (e) {
    return res.status(500).json({ error: 'Token generation failed', message: e.message });
  }
});

// Start server
// ==================== PAYMENT PROCESSING ENDPOINTS ====================

// Create Payment Intent for Donation
app.post('/api/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency = 'usd', donorId, creatorId } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    if (!stripe || !process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ 
        error: 'Stripe not configured. Please set STRIPE_SECRET_KEY in environment variables.' 
      });
    }

    // Convert amount to cents (Stripe uses smallest currency unit)
    const amountInCents = Math.round(parseFloat(amount) * 100);

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: currency.toLowerCase(),
      metadata: {
        donorId: donorId || '',
        creatorId: creatorId || '',
        type: 'donation'
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to create payment intent' });
  }
});

// Confirm Payment and Process Donation
app.post('/api/confirm-payment', async (req, res) => {
  try {
    const { paymentIntentId, paymentMethodId, donationData } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({ error: 'Payment intent ID is required' });
    }

    if (!stripe || !process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ 
        error: 'Stripe not configured' 
      });
    }

    // Retrieve payment intent to check current status
    let paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    // If payment already succeeded (from Stripe SDK confirmation), just verify and return
    if (paymentIntent.status === 'succeeded') {
      return res.json({
        success: true,
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount / 100, // Convert back from cents
        status: paymentIntent.status,
        donationData: donationData || {}
      });
    }

    // If payment method is provided and payment hasn't succeeded yet, confirm it
    // This handles cases where we need server-side confirmation
    if (paymentMethodId && paymentIntent.status !== 'succeeded') {
      try {
        // Confirm the payment intent with the payment method
        paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
          payment_method: paymentMethodId,
        });

        if (paymentIntent.status === 'succeeded') {
          return res.json({
            success: true,
            paymentIntentId: paymentIntent.id,
            amount: paymentIntent.amount / 100,
            status: paymentIntent.status,
            donationData: donationData || {}
          });
        } else {
          return res.json({
            success: false,
            status: paymentIntent.status,
            message: `Payment status: ${paymentIntent.status}`,
            requiresAction: paymentIntent.status === 'requires_action'
          });
        }
      } catch (confirmError) {
        return res.status(500).json({ 
          error: confirmError.message || 'Failed to confirm payment',
          status: paymentIntent.status
        });
      }
    }

    // Payment not yet succeeded and no payment method provided
    return res.json({
      success: false,
      status: paymentIntent.status,
      message: `Payment status: ${paymentIntent.status}`,
      requiresAction: paymentIntent.status === 'requires_action'
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to confirm payment' });
  }
});

// Create Payment Intent for Advertising Subscription
app.post('/api/create-advertising-payment-intent', async (req, res) => {
  try {
    const { amount, currency = 'usd', advertiserId, subscriptionPlan } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    if (!stripe || !process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ 
        error: 'Stripe not configured. Please set STRIPE_SECRET_KEY in environment variables.' 
      });
    }

    // Convert amount to cents (Stripe uses smallest currency unit)
    const amountInCents = Math.round(parseFloat(amount) * 100);

    // Create payment intent for advertising
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: currency.toLowerCase(),
      metadata: {
        advertiserId: advertiserId || '',
        subscriptionPlan: subscriptionPlan || '',
        type: 'advertising'
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to create advertising payment intent' });
  }
});

// Create Stripe Connect Account for Creator
app.post('/api/create-stripe-account', async (req, res) => {
  try {
    const { creatorId, email, country = 'US' } = req.body;

    if (!creatorId || !email) {
      return res.status(400).json({ error: 'Missing required fields: creatorId, email' });
    }

    if (!stripe || !process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ 
        error: 'Stripe not configured. Please set STRIPE_SECRET_KEY in environment variables.' 
      });
    }

    // Create Stripe Express account for the creator
    try {
      const account = await stripe.accounts.create({
        type: 'express',
        country: country,
        email: email,
        capabilities: {
          transfers: { requested: true },
        },
        metadata: {
          creatorId: creatorId,
          platform: 'ASAB'
        }
      });

      res.json({
        success: true,
        accountId: account.id,
        creatorId: creatorId
      });
    } catch (stripeError) {
      // Check if Stripe Connect is not enabled
      if (stripeError.message && stripeError.message.includes('Connect')) {
        return res.status(400).json({ 
          error: 'Stripe Connect is not enabled on your account.',
          message: 'Please enable Stripe Connect in your Stripe Dashboard: https://dashboard.stripe.com/settings/connect',
          details: stripeError.message,
          requiresConnect: true,
          alternative: 'You can still use manual payment processing. Admin will process payouts manually via Stripe Dashboard.'
        });
      }
      throw stripeError;
    }
  } catch (error) {
    res.status(500).json({ 
      error: error.message || 'Failed to create Stripe account',
      details: error.type || 'Unknown error'
    });
  }
});

// Create Account Link for Stripe Connect Onboarding
app.post('/api/create-account-link', async (req, res) => {
  try {
    const { accountId, returnUrl, refreshUrl } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: 'Missing required field: accountId' });
    }

    if (!stripe || !process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ 
        error: 'Stripe not configured' 
      });
    }

    // Create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/earnings`,
      return_url: returnUrl || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/earnings?connected=true`,
      type: 'account_onboarding',
    });

    res.json({
      success: true,
      url: accountLink.url,
      expiresAt: accountLink.expires_at
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message || 'Failed to create account link'
    });
  }
});

// Get Stripe Account Status
app.get('/api/stripe-account-status/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;

    if (!stripe || !process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: 'Stripe not configured' });
    }

    const account = await stripe.accounts.retrieve(accountId);
    
    // Check if account is ready to receive transfers
    const canReceiveTransfers = account.capabilities?.transfers === 'active' || 
                                account.capabilities?.transfers === 'pending';

    res.json({
      success: true,
      accountId: account.id,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      transfersEnabled: canReceiveTransfers,
      detailsSubmitted: account.details_submitted,
      email: account.email,
      country: account.country
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message || 'Failed to retrieve account status'
    });
  }
});

// Process Stripe Payout to Creator
app.post('/api/process-payout', async (req, res) => {
  try {
    const { payoutId, creatorId, amount, currency = 'usd', destinationAccountId } = req.body;

    if (!payoutId || !creatorId || !amount) {
      return res.status(400).json({ error: 'Missing required fields: payoutId, creatorId, amount' });
    }

    if (!stripe || !process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ 
        error: 'Stripe not configured. Please set STRIPE_SECRET_KEY in environment variables.' 
      });
    }

    const amountInCents = Math.round(parseFloat(amount) * 100);

    if (amountInCents < 100) {
      return res.status(400).json({ error: 'Minimum payout amount is $1.00' });
    }

    let transfer = null;
    let transactionId = null;

    // If destination account is provided (Stripe Connect), use Transfer
    if (destinationAccountId) {
      try {
        transfer = await stripe.transfers.create({
          amount: amountInCents,
          currency: currency.toLowerCase(),
          destination: destinationAccountId,
          metadata: {
            payoutId: payoutId,
            creatorId: creatorId,
            type: 'creator_payout'
          }
        });
        transactionId = transfer.id;  
      } catch (transferError) {
        return res.status(500).json({ 
          error: `Failed to create Stripe transfer: ${transferError.message}`,
          details: 'Creator may need to connect their Stripe account'
        });
      }
    } else {
      // Alternative: Use Stripe Payouts API (requires platform to have balance)
      // This sends money from platform's Stripe balance to creator's bank account
      // Note: This requires the creator's bank account to be stored
      // For now, return error suggesting manual processing
      return res.status(400).json({ 
        error: 'Creator bank account not linked',
        message: 'Creator needs to connect their payment method. Processing manually for now.',
        requiresManualProcessing: true
      });
    }

    res.json({
      success: true,
      transferId: transactionId,
      payoutId: payoutId,
      amount: amount,
      status: 'completed'
    });
  } catch (error) { 
    res.status(500).json({ 
      error: error.message || 'Failed to process payout',
      details: error.type || 'Unknown error'
    });
  }
});

// Webhook endpoint for Stripe events (for production)
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return res.status(400).send('Webhook secret not configured');
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) { 
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      // Here you can update your database, send notifications, etc.
      // Check if it's an advertising payment or donation
      if (paymentIntent.metadata?.type === 'advertising') {
      } else if (paymentIntent.metadata?.type === 'donation') {
      }
      break;
    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object;
      break;
    case 'transfer.created':
      const transferCreated = event.data.object;
      if (transferCreated.metadata?.payoutId) {
      }
      break;
    case 'transfer.paid':
      const transferPaid = event.data.object;
      if (transferPaid.metadata?.payoutId) {
        // Here you could update the payout status to confirmed
        // Note: You'll need to import your Appwrite functions or make an API call
      }
      break;
    case 'transfer.failed':
      const transferFailed = event.data.object;
      if (transferFailed.metadata?.payoutId) {
        // Here you could update the payout status to failed
      }
      break;
    default:
  }

  res.json({ received: true });
});

app.listen(PORT, () => {
  if (process.env.STRIPE_SECRET_KEY) {
    console.log(`💳 Stripe payment processing enabled`);
  } else {
    console.log(`⚠️  Stripe not configured - payment features disabled`);
  }
  if (process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET) {
    console.log(`🎬 Mux direct upload + webhook routes enabled`);
  } else {
    console.log(`⚠️  Mux not configured - set MUX_TOKEN_ID / MUX_TOKEN_SECRET for video uploads`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  process.exit(0);
});

