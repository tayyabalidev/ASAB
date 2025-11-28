// INTEGRATION CODE FOR app/(tabs)/create.jsx
// Copy these code snippets to integrate processing

// ============================================
// 1. ADD THESE IMPORTS AT THE TOP
// ============================================
import { processVideo, processPhoto, checkProcessingServer } from "../../lib/videoProcessor";
import * as FileSystem from 'expo-file-system';

// ============================================
// 2. ADD THESE STATE VARIABLES
// ============================================
const [processingMedia, setProcessingMedia] = useState(false);
const [processingProgress, setProcessingProgress] = useState(0);
const [useProcessing, setUseProcessing] = useState(false);

// ============================================
// 3. ADD THIS useEffect TO CHECK SERVER
// ============================================
useEffect(() => {
  const checkServer = async () => {
    try {
      const isAvailable = await checkProcessingServer();
      setUseProcessing(isAvailable);
      if (isAvailable) {
        console.log('✅ Processing server is available');
      } else {
        console.log('ℹ️ Processing server not available - using metadata only');
      }
    } catch (error) {
      console.log('Processing server check failed');
      setUseProcessing(false);
    }
  };
  checkServer();
}, []);

// ============================================
// 4. UPDATE VIDEO SUBMIT FUNCTION
// Replace your existing video submit code with this:
// ============================================
setUploading(true);
try {
  let finalVideo = form.video;
  
  // Process video if server available and filter/music selected
  if (useProcessing && (form.filter !== 'none' || form.music)) {
    try {
      setProcessingMedia(true);
      setProcessingProgress(10);
      
      console.log('Processing video with filter:', form.filter);
      
      // Process video
      const processedResult = await processVideo({
        video: form.video,
        music: form.music || null,
        filter: form.filter,
        musicVolume: 0.5
      });
      
      setProcessingProgress(50);
      
      // Save processed video to file system
      if (processedResult && processedResult.base64) {
        const processedUri = `${FileSystem.documentDirectory}processed_video_${Date.now()}.mp4`;
        
        await FileSystem.writeAsStringAsync(processedUri, processedResult.base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        
        // Update to use processed video
        finalVideo = {
          uri: processedUri,
          name: 'processed_video.mp4',
          type: 'video/mp4',
          size: form.video.size
        };
        
        console.log('✅ Video processed successfully');
      }
      
      setProcessingProgress(100);
      setProcessingMedia(false);
    } catch (processError) {
      console.log('⚠️ Processing failed, using original video:', processError);
      setProcessingMedia(false);
      // Continue with original video
    }
  }

  setProcessingProgress(0);
  
  // Upload video (processed or original)
  await createVideoPost({
    ...form,
    video: finalVideo,
    userId: user.$id,
  });

  Alert.alert(t("common.success"), t("alerts.uploadSuccess"));
  router.push("/home");
} catch (error) {
  // ... your existing error handling ...
} finally {
  // ... your existing cleanup ...
}

// ============================================
// 5. UPDATE PHOTO SUBMIT FUNCTION
// Add this code in your photo submission section:
// ============================================
setUploading(true);
try {
  let finalPhoto = photoForm.photo;
  
  // Process photo if server available and filter/adjustments applied
  if (useProcessing && (photoForm.filter !== 'none' || Object.keys(edits).length > 0)) {
    try {
      setProcessingMedia(true);
      setProcessingProgress(10);
      
      console.log('Processing photo with filter:', photoForm.filter);
      
      // Process photo
      const processedResult = await processPhoto({
        photo: photoForm.photo,
        filter: photoForm.filter,
        brightness: adjustments.brightness,
        contrast: adjustments.contrast,
        saturation: adjustments.saturation
      });
      
      setProcessingProgress(50);
      
      // Save processed photo
      if (processedResult && processedResult.base64) {
        const processedUri = `${FileSystem.documentDirectory}processed_photo_${Date.now()}.jpg`;
        
        await FileSystem.writeAsStringAsync(processedUri, processedResult.base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        
        finalPhoto = {
          uri: processedUri,
          name: 'processed_photo.jpg',
          type: 'image/jpeg',
          size: photoForm.photo.size
        };
        
        console.log('✅ Photo processed successfully');
      }
      
      setProcessingProgress(100);
      setProcessingMedia(false);
    } catch (processError) {
      console.log('⚠️ Processing failed, using original photo:', processError);
      setProcessingMedia(false);
      // Continue with original photo
    }
  }

  setProcessingProgress(0);
  
  // Upload photo (processed or original)
  await createPhotoPost({
    ...photoForm,
    photo: finalPhoto,
    userId: user.$id,
    edits: edits,
  });

  Alert.alert(t("common.success"), "Photo uploaded successfully!");
  router.push("/profile");
} catch (error) {
  // ... your existing error handling ...
} finally {
  // ... your existing cleanup ...
}

// ============================================
// 6. UPDATE SUBMIT BUTTON
// Replace your CustomButton with this:
// ============================================
<CustomButton
  title={
    processingMedia 
      ? `Processing... ${processingProgress}%` 
      : uploading 
        ? "Uploading..." 
        : (postType === 'video' ? t("create.submitButton") : "Post Photo")
  }
  handlePress={submit}
  containerStyles="mt-6"
  isLoading={uploading || processingMedia}
  disabled={uploading || processingMedia}
/>

{/* Processing Progress Indicator */}
{processingMedia && (
  <View style={{
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: themedColor("rgba(15,23,42,0.6)", theme.surface),
    borderWidth: 1,
    borderColor: theme.border,
  }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <ActivityIndicator size="small" color={theme.accent} />
      <Text style={{ color: theme.textPrimary, fontSize: 14, flex: 1 }}>
        Processing {postType === 'video' ? 'video' : 'photo'}...
      </Text>
      <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
        {processingProgress}%
      </Text>
    </View>
    <View style={{
      marginTop: 8,
      height: 4,
      backgroundColor: theme.border,
      borderRadius: 2,
      overflow: 'hidden',
    }}>
      <View style={{
        height: '100%',
        width: `${processingProgress}%`,
        backgroundColor: theme.accent,
        borderRadius: 2,
      }} />
    </View>
  </View>
)}

{/* Server Status Indicator */}
{!useProcessing && (
  <View style={{
    marginTop: 12,
    padding: 8,
    borderRadius: 8,
    backgroundColor: themedColor("rgba(255,193,7,0.1)", "rgba(255,193,7,0.1)"),
    borderWidth: 1,
    borderColor: themedColor("rgba(255,193,7,0.3)", "rgba(255,193,7,0.3)"),
  }}>
    <Text style={{ color: theme.textSecondary, fontSize: 12, textAlign: 'center' }}>
      ℹ️ Processing server not available. Filters saved as metadata.
    </Text>
  </View>
)}

// ============================================
// DONE! 
// Now your app will:
// 1. Check if processing server is available
// 2. Process videos/photos before upload (if server available)
// 3. Show progress indicator
// 4. Fall back to original file if processing fails
// ============================================


