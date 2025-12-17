const express = require('express');
const cors = require('cors');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
});

// Helper function to clean up files
const cleanupFiles = (files) => {
  files.forEach(file => {
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch (err) {
        console.log('Error cleaning up file:', file, err);
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
        console.log('Video processing completed');
        resolve();
      })
      .on('error', (err) => {
        console.error('Video processing error:', err);
        reject(err);
      })
      .on('progress', (progress) => {
        console.log('Processing: ' + (progress.percent || 0) + '% done');
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
          console.log('Multiple clips merged successfully');
          // Cleanup temp files
          cleanupFn([...processedClips, tempDir]);
          resolve();
        })
        .on('error', (err) => {
          console.error('Clip merging error:', err);
          cleanupFn([...processedClips, tempDir]);
          reject(err);
        })
        .run();
    });
  } catch (error) {
    console.error('Error processing multiple clips:', error);
    throw error;
  }
};

// Video filter presets (FFmpeg filters) - returns filter string and intensity multiplier
const videoFilters = {
  'none': { filter: '', intensity: 1.0 },
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
    console.log('Error parsing data:', parseError);
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
      console.error('Stream error:', err);
    });

  } catch (error) {
    console.error('Processing error:', error);
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
      console.error('Stream error:', err);
    });

  } catch (error) {
    console.error('Processing error:', error);
    cleanupFiles([photoPath, outputPath]);
    res.status(500).json({ error: 'Photo processing failed', details: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Video/Photo Processing Service is running' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Video/Photo Processing Server running on port ${PORT}`);
  console.log(`📁 Uploads directory: ${uploadsDir}`);
  console.log(`📁 Processed directory: ${processedDir}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

