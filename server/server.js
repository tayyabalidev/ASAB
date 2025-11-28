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
      fs.unlinkSync(file);
    }
  });
};

// Video filter presets (FFmpeg filters)
const videoFilters = {
  'none': '',
  'vintage': 'curves=vintage',
  'blackwhite': 'hue=s=0',
  'sepia': 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131',
  'cool': 'eq=gamma=1.1:contrast=1.1:brightness=0.05',
  'warm': 'eq=gamma=0.9:contrast=1.1:brightness=0.05',
  'contrast': 'eq=contrast=1.3',
  'bright': 'eq=brightness=0.2:contrast=1.2'
};

// Photo filter presets (Sharp operations)
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
  'bright': async (image) => image.modulate({ brightness: 1.2, saturation: 1.1 })
};

// Process Video with Filter, Music, and Overlays
app.post('/api/process-video', upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'music', maxCount: 1 }
]), async (req, res) => {
  const { filter = 'none', musicVolume = 0.5, stickers, texts, trim } = req.body;
  const videoFile = req.files?.video?.[0];
  const musicFile = req.files?.music?.[0];

  if (!videoFile) {
    return res.status(400).json({ error: 'No video file provided' });
  }

  const videoPath = videoFile.path;
  const outputPath = path.join(processedDir, `processed_${Date.now()}.mp4`);
  
  // Parse JSON strings if provided
  let stickersData = [];
  let textsData = [];
  let trimData = null;
  
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
  } catch (parseError) {
    console.log('Error parsing overlay data:', parseError);
  }

  try {
    let command = ffmpeg(videoPath);
    
    // Apply trim if provided
    if (trimData && trimData.start !== undefined && trimData.end !== undefined) {
      command = command
        .setStartTime(trimData.start)
        .setDuration(trimData.end - trimData.start);
    }

    // Build video filter chain
    let videoFilterChain = [];
    
    // Apply video filter
    if (filter && filter !== 'none' && videoFilters[filter]) {
      videoFilterChain.push(videoFilters[filter]);
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
        const escapedText = textContent.replace(/:/g, '\\:').replace(/'/g, "\\'");
        
        videoFilterChain.push(
          `drawtext=text='${escapedText}':x=${x}:y=${y}:fontsize=${fontSize}:fontcolor=${textColor}:box=1:boxcolor=black@0.5:boxborderw=5`
        );
      });
    }
    
    // Apply video filters
    if (videoFilterChain.length > 0) {
      command = command.videoFilters(videoFilterChain);
    }

    // Add music if provided
    if (musicFile) {
      command = command
        .input(musicFile.path)
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
        ], 'mixed')
        .outputOptions([
          '-map 0:v',
          '-map [mixed]',
          '-c:v copy',
          '-c:a aac',
          '-b:a 192k',
          `-filter:a "volume=${musicVolume}"`
        ]);
    }

    // Process video
    await new Promise((resolve, reject) => {
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
          console.log('Processing: ' + progress.percent + '% done');
        })
        .run();
    });

    // Return processed video file
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="processed_${Date.now()}.mp4"`);
    
    const fileStream = fs.createReadStream(outputPath);
    fileStream.pipe(res);
    
    // Cleanup after sending
    fileStream.on('end', () => {
      cleanupFiles([videoPath, musicFile?.path, outputPath]);
    });
    
    fileStream.on('error', (err) => {
      cleanupFiles([videoPath, musicFile?.path, outputPath]);
      console.error('Stream error:', err);
    });

  } catch (error) {
    console.error('Processing error:', error);
    cleanupFiles([videoPath, musicFile?.path, outputPath].filter(Boolean));
    res.status(500).json({ error: 'Video processing failed', details: error.message });
  }
});

// Process Photo with Filter
app.post('/api/process-photo', upload.single('photo'), async (req, res) => {
  const { filter = 'none', brightness = 0, contrast = 1, saturation = 1 } = req.body;
  const photoFile = req.file;

  if (!photoFile) {
    return res.status(400).json({ error: 'No photo file provided' });
  }

  const photoPath = photoFile.path;
  const outputPath = path.join(processedDir, `processed_${Date.now()}.jpg`);

  try {
    let image = sharp(photoPath);

    // Apply filter
    if (filter && filter !== 'none' && photoFilters[filter]) {
      image = await photoFilters[filter](image);
    }

    // Apply adjustments
    if (brightness !== 0 || contrast !== 1 || saturation !== 1) {
      image = image.modulate({
        brightness: 1 + (brightness / 100),
        saturation: saturation,
      });

      if (contrast !== 1) {
        const contrastValue = contrast;
        image = image.linear(contrastValue, -(128 * (contrastValue - 1)));
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

