import {
  Account,
  Avatars,
  Client,
  Databases,
  ID,
  Query,
  Storage,
} from "react-native-appwrite";
import * as FileSystem from 'expo-file-system/legacy';

export const appwriteConfig = {
  endpoint: "https://nyc.cloud.appwrite.io/v1",
  platform: "com.jsm.asabcorp",
  projectId: "6854922e0036a1e8dee6",
  storageId: "6854976e000db585d780",
  databaseId: "685494a1002f8417c2b2",
  userCollectionId: "685494cd001135a4d108",
  videoCollectionId: "685494f9001c3ccb2ba2",
  photoCollectionId: "691cb9d500277594ea2d", // Photo Posts Collection
  chatsCollectionId: "687b05170001d79853e1",
  messagesCollectionId: "687b06060030cdc17a80",
  groupsCollectionId: "687b0448001ac393a59e",
  chatReadsCollectionId: "687bc8b4003cd8c8935d", 
  commentsCollectionId: "68861f970015406a3ff2",
  postCollectionId: "68861f35001b5a7a28da",
  bookmarksCollectionId: "6880a1ec000c120c271c",
  notificationsCollectionId: "6889d903000dd865f451",
  liveStreamsCollectionId: "68f20f1f00332e083aff", // Live Streams ✅
  liveCommentsCollectionId: "68f1fa55001f27618fa3", // live comments (lowercase)
  liveReactionsCollectionId: "68f1f808001762821ffd", // Live Reaction (singular)
  advertisementsCollectionId: "692348f9002975edd2d7", // Advertisements Collection - Replace with actual ID
  donationsCollectionId: "696fc1a8003384157074", // Donations Collection - Replace with actual ID from Appwrite
  payoutsCollectionId: "696fc6a60007597b4dbc", // Payouts Collection - Replace with actual ID from Appwrite
  advertisingPaymentsCollectionId: "697c6094002a1edf5624", // Advertising Payments Collection - Use same as payouts or create new collection
};

const client = new Client();

client
  .setEndpoint(appwriteConfig.endpoint)
  .setProject(appwriteConfig.projectId)
  .setPlatform(appwriteConfig.platform);

export const account = new Account(client);
export const storage = new Storage(client)
export const avatars = new Avatars(client);
export const databases = new Databases(client);

// iOS Video URL Helper
export function getIOSCompatibleVideoUrl(videoUrl) {
  if (!videoUrl) return null;
  
  try {
    // Clean the URL and ensure it's properly formatted for iOS
    const url = new URL(videoUrl);
    
    // Remove any problematic parameters that might cause NSURLErrorDomain issues
    url.searchParams.delete('format');
    url.searchParams.delete('quality');
    url.searchParams.delete('mode');
    
    // Ensure the URL is clean and iOS-compatible
    const cleanUrl = url.toString();
    
   
    return cleanUrl;
  } catch (error) {
    
    return videoUrl; // Return original if processing fails
  }
}

// File Extension Helper for Appwrite Compatibility
export function ensureAppwriteCompatibleFileName(fileName, fileType) {
  if (!fileName) return `file_${Date.now()}`;
  
  const baseName = fileName.split('.')[0];
  
  if (fileType === 'video' || fileType === 'video/mp4') {
    return `${baseName}.mp4`;
  } else if (fileType === 'image' || fileType === 'image/jpeg') {
    return `${baseName}.jpg`;
  } else if (fileType === 'image/png') {
    return `${baseName}.png`;
  }
  
  return fileName; // Return original if no specific handling needed
}

// Network connectivity helper
export async function checkNetworkConnectivity() {
  try {
    // Try multiple endpoints for better reliability
    const endpoints = [
      'https://nyc.cloud.appwrite.io/v1/health',
      'https://www.google.com',
      'https://httpbin.org/get'
    ];
    
    for (const endpoint of endpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
        
        const response = await fetch(endpoint, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15'
          }
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          console.log('Network connectivity confirmed via:', endpoint);
          return true;
        }
      } catch (error) {
        console.log(`Network check failed for ${endpoint}:`, error.message);
        continue; // Try next endpoint
      }
    }
    
    console.warn('All network connectivity checks failed');
    return false;
  } catch (error) {
    console.error('Network connectivity check failed:', error);
    return false;
  }
}

// Retry mechanism for network requests
export async function retryNetworkRequest(requestFn, maxRetries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Upload attempt ${attempt}/${maxRetries}`);
      const result = await requestFn();
      console.log(`Upload successful on attempt ${attempt}`, result ? `Result type: ${typeof result}, has $id: ${!!result?.$id}` : 'Result is null/undefined');
      
      // Validate result before returning
      if (!result) {
        throw new Error('Upload completed but no result returned from server');
      }
      
      return result;
    } catch (error) {
      const errorMessage = error.message || error.toString();
      console.error(`Attempt ${attempt} failed:`, errorMessage);
      
      // Don't retry for certain types of errors
      if (errorMessage.includes('extension not allowed') || 
          errorMessage.includes('File extension not allowed') ||
          errorMessage.includes('unauthorized') ||
          errorMessage.includes('Unauthorized') ||
          errorMessage.includes('too large') ||
          errorMessage.includes('File is too large')) {
        throw error; // Don't retry these errors
      }
      
      // For 503/server errors, use longer delays
      const isServerError = errorMessage.includes('503') || 
                           errorMessage.includes('client read error') ||
                           errorMessage.includes('Service Unavailable');
      
      if (attempt === maxRetries) {
        console.error(`All ${maxRetries} attempts failed`);
        throw error;
      }
      
      // Wait before retrying with exponential backoff (longer for server errors)
      const baseWaitTime = isServerError ? delay * 3 : delay;
      const waitTime = baseWaitTime * Math.pow(2, attempt - 1);
      console.log(`Waiting ${waitTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

// Register user
export async function createUser(email, password, username) {
  try {
    const newAccount = await account.create(
      ID.unique(),
      email,
      password,
      username
    );

    if (!newAccount) throw Error;
    try {
      await signOut();
    } catch (sessionError) {
      // It's okay if there's no active session
      console.log("No active session to delete:", sessionError.message);
    }

    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random`;
    console.log(avatarUrl, "Avatar URL");
    await signIn(email, password);

    const newUser = await databases.createDocument(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
      ID.unique(),
      {
        accountId: newAccount.$id,
        email: email,
        username: username,
        avatar: avatarUrl,
      }
    );
    console.log("New user created:", newUser);
    return newUser;
  } catch (error) {
    console.log(error, "Error creating user");
    
    // Provide user-friendly error messages
    if (error.message && error.message.includes('readonly')) {
      throw new Error("Server is in readonly mode. Please contact support or check your Appwrite project settings.");
    }
    
    throw new Error(error.message || "Failed to create user. Please try again.");
  }
}

// Sign In
export async function signIn(email, password) {
  try {
    const session = await account.createEmailPasswordSession(email, password);

    return session;
  } catch (error) {
    // Provide user-friendly error messages
    if (error.message && error.message.includes('readonly')) {
      throw new Error("Server is in readonly mode. Please contact support or check your Appwrite project settings.");
    }
    
    throw new Error(error.message || "Failed to sign in. Please check your credentials and try again.");
  }
}

// Facebook Sign In using Appwrite OAuth (Web-based, works with Expo Go)
export async function signInWithFacebook(successUrl, failureUrl) {
  try {
    // This opens a browser/webview for Facebook OAuth
    // successUrl and failureUrl are deep link URLs that redirect back to the app
    const finalSuccessUrl = successUrl || `${appwriteConfig.platform}://auth/facebook-success`;
    const finalFailureUrl = failureUrl || `${appwriteConfig.platform}://auth/facebook-failure`;
    
    const session = await account.createOAuth2Session(
      'facebook',
      finalSuccessUrl,
      finalFailureUrl
    );
    
    return session;
  } catch (error) {
    console.error('❌ OAuth2 session creation error:', error);
    throw new Error(error.message || error);
  }
}

// Google Sign In using Appwrite OAuth (Web-based, works with Expo Go)
export async function signInWithGoogle(successUrl, failureUrl) {
  try {
    // This opens a browser/webview for Google OAuth
    // successUrl and failureUrl are deep link URLs that redirect back to the app
    const finalSuccessUrl = successUrl || `${appwriteConfig.platform}://auth/google-success`;
    const finalFailureUrl = failureUrl || `${appwriteConfig.platform}://auth/google-failure`;
    
    const session = await account.createOAuth2Session(
      'google',
      finalSuccessUrl,
      finalFailureUrl
    );
    
    return session;
  } catch (error) {
    console.error('❌ OAuth2 session creation error for Google:', error);
    throw new Error(error.message || error);
  }
}

// Get or create user after Google OAuth
export async function getOrCreateGoogleUser(retryCount = 0) {
  try {
    // Get the current account from Appwrite (after OAuth)
    const currentAccount = await account.get();
    
    if (!currentAccount) {
      // If no account and we haven't retried yet, wait and retry
      if (retryCount < 3) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return getOrCreateGoogleUser(retryCount + 1);
      }
      throw new Error('No account found - OAuth session may not be ready yet');
    }

    // Check if user exists in our database
    const existingUsers = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
      [Query.equal("accountId", currentAccount.$id)]
    );

    if (existingUsers.documents.length > 0) {
      // User already exists
      return existingUsers.documents[0];
    }

    // Create new user document
    const avatarUrl = currentAccount.prefs?.avatar || 
                     `https://ui-avatars.com/api/?name=${encodeURIComponent(currentAccount.name || 'User')}&background=random`;

    const newUser = await databases.createDocument(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
      ID.unique(),
      {
        accountId: currentAccount.$id,
        email: currentAccount.email,
        username: currentAccount.name || 'Google User',
        avatar: avatarUrl
      }
    );

    console.log("New Google user created:", newUser);
    return newUser;
  } catch (error) {
    // If it's a scope error and we haven't retried enough, wait and retry
    if (error.message && error.message.includes('missing scopes') && retryCount < 3) {
      console.log(`Retry ${retryCount + 1}: Waiting for OAuth session...`);
      await new Promise(resolve => setTimeout(resolve, 1500));
      return getOrCreateGoogleUser(retryCount + 1);
    }
    console.log(error, "Error getting/creating Google user");
    throw error;
  }
}

// Get or create user after Facebook OAuth
export async function getOrCreateFacebookUser(retryCount = 0) {
  try {
    // Get the current account from Appwrite (after OAuth)
    const currentAccount = await account.get();
    
    if (!currentAccount) {
      // If no account and we haven't retried yet, wait and retry
      if (retryCount < 3) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return getOrCreateFacebookUser(retryCount + 1);
      }
      throw new Error('No account found - OAuth session may not be ready yet');
    }

    // Check if user exists in our database
    const existingUsers = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
      [Query.equal("accountId", currentAccount.$id)]
    );

    if (existingUsers.documents.length > 0) {
      // User already exists
      return existingUsers.documents[0];
    }

    // Create new user document
    const avatarUrl = currentAccount.prefs?.avatar || 
                     `https://ui-avatars.com/api/?name=${encodeURIComponent(currentAccount.name || 'User')}&background=random`;

    const newUser = await databases.createDocument(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
      ID.unique(),
      {
        accountId: currentAccount.$id,
        email: currentAccount.email,
        username: currentAccount.name || 'Facebook User',
        avatar: avatarUrl
      }
    );

    console.log("New Facebook user created:", newUser);
    return newUser;
  } catch (error) {
    // If it's a scope error and we haven't retried enough, wait and retry
    if (error.message && error.message.includes('missing scopes') && retryCount < 3) {
      console.log(`Retry ${retryCount + 1}: Waiting for OAuth session...`);
      await new Promise(resolve => setTimeout(resolve, 1500));
      return getOrCreateFacebookUser(retryCount + 1);
    }
    console.log(error, "Error getting/creating Facebook user");
    throw error;
  }
}

// Get Account
export async function getAccount() {
  try {
    const currentAccount = await account.get();
    return currentAccount;
  } catch (error) {
    // Log error for debugging
    console.log('⚠️ getAccount error:', error.message || error);
    throw error; // Re-throw original error
  }
}

// Get Current User
export async function getCurrentUser() {
  try {
    const currentAccount = await getAccount();
    if (!currentAccount) throw Error;

    const currentUser = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
      [Query.equal("accountId", currentAccount.$id)]
    );

    if (!currentUser) throw Error;

    return currentUser.documents[0];
  } catch (error) {
    console.log(error);
    return null;
  }
}

// Sign Out
export async function signOut() {
  try {
    const session = await account.deleteSession("current");
    return session;
  } catch (error) {
    throw new Error(error);
  }
}



// Upload File
export async function uploadFile(file, type) {
  if (!file) {
    console.log("No file provided for upload");
    return null;
  }

  // Check file size before upload (limit to 2GB for videos, 50MB for audio, 10MB for images)
  const fileSizeInMB = (file.size || 0) / (1024 * 1024);
  const maxSizeMB = type === 'video' ? 2048 : type === 'audio' ? 50 : 10;
  
  if (fileSizeInMB > maxSizeMB) {
    throw new Error(`File is too large (${fileSizeInMB.toFixed(2)}MB). Maximum size allowed: ${maxSizeMB}MB. Please compress or select a smaller file.`);
  }

  console.log("Uploading file:", {
    name: file.name,
    size: `${fileSizeInMB.toFixed(2)}MB`,
    type: type,
    mimeType: file.mimeType,
    uri: file.uri ? 'present' : 'missing' // Don't log full URI for security
  });

  // Handle iOS file structure - ensure mimeType is properly set
  const mimeType = file.mimeType || file.type;
  
  // Ensure Appwrite-compatible file name
  const compatibleFileName = ensureAppwriteCompatibleFileName(file.name, mimeType);
  
  // For iOS videos, ensure proper MIME type
  let finalMimeType = mimeType;
  if (type === 'video' && mimeType && mimeType.includes('mov')) {
    finalMimeType = 'video/mp4'; // Force MP4 for iOS compatibility
  }
  
  // Validate that file URI exists
  if (!file.uri) {
    throw new Error('File URI is missing. Please select a valid file.');
  }
  
  // Verify file exists and is accessible
  let fileInfo;
  let actualSize = file.size || 0;
  
  try {
    fileInfo = await FileSystem.getInfoAsync(file.uri);
    if (!fileInfo.exists) {
      throw new Error(`File does not exist at path: ${file.uri}`);
    }
    
    // Use file system size if available, otherwise use provided size
    actualSize = fileInfo.size || file.size || 0;
    
    console.log('File verified:', {
      exists: fileInfo.exists,
      size: actualSize,
      uri: file.uri.substring(0, 50) + '...'
    });
  } catch (fileCheckError) {
    console.warn('File verification failed, proceeding anyway:', fileCheckError.message);
    // If we can't verify, use provided size or estimate
    actualSize = file.size || 0;
  }
  
  // Always include size - Appwrite may need it even if it's 0
  // Construct asset object explicitly - only include properties Appwrite expects
  // React Native Appwrite expects: uri, name, type, and optionally size
  const asset = { 
    uri: file.uri,
    name: compatibleFileName,
    type: finalMimeType,
    size: actualSize, // Always include size, even if 0
  };
  console.log('Asset object prepared:', {
    hasUri: !!asset.uri,
    name: asset.name,
    type: asset.type,
    size: asset.size || 'not provided'
  });
  
  // Proceed directly with upload - retry mechanism will handle network issues
  console.log('Starting file upload with retry mechanism...');
  
  try {
    const uploadedFile = await retryNetworkRequest(async () => {
      console.log('Calling storage.createFile with:', {
        bucketId: appwriteConfig.storageId,
        fileId: 'unique()',
        assetKeys: Object.keys(asset),
        assetUri: asset.uri ? 'present' : 'missing',
        assetName: asset.name,
        assetType: asset.type
      });
      
      // Create file with explicit error handling
      let result;
      try {
        result = await storage.createFile(
          appwriteConfig.storageId,
          ID.unique(),
          asset
        );
        
        console.log('storage.createFile returned:', {
          resultType: typeof result,
          isNull: result === null,
          isUndefined: result === undefined,
          hasId: !!result?.$id,
          keys: result ? Object.keys(result) : 'N/A',
          result: result // Log full result for debugging
        });
      } catch (createError) {
        console.error('storage.createFile threw error:', createError);
        throw createError;
      }
      
      // Validate result before returning
      if (!result) {
        console.error('storage.createFile returned null/undefined. Asset was:', {
          uri: asset.uri?.substring(0, 50),
          name: asset.name,
          type: asset.type,
          size: asset.size
        });
        throw new Error('storage.createFile returned null/undefined. File may not be accessible or format may be invalid.');
      }
      
      return result;
    });
    
    console.log('Final uploadedFile after retry:', uploadedFile, typeof uploadedFile);
    
    // Validate that uploadedFile exists and has a $id property
    if (!uploadedFile || !uploadedFile.$id) {
      console.error("Upload failed: storage.createFile did not return a valid file object", {
        uploadedFile,
        type: typeof uploadedFile,
        keys: uploadedFile ? Object.keys(uploadedFile) : 'N/A'
      });
      throw new Error('File upload failed: No file ID returned from server. Please try again.');
    }
    
    console.log("File uploaded successfully:", uploadedFile.$id);

    if (type === 'image' || type === 'video') {
      const fileUrl = await getFilePreview(uploadedFile.$id, type);
      console.log("File URL generated:", fileUrl);
      return fileUrl;
    } else if (type === 'document' || type === 'audio') {
      // Return direct file download URL for documents and audio
      // Use download endpoint for better iOS compatibility with AVPlayer
      const fileUrl = `${appwriteConfig.endpoint}/storage/buckets/${appwriteConfig.storageId}/files/${uploadedFile.$id}/download?project=${appwriteConfig.projectId}`;
      console.log("Document/Audio file URL generated:", fileUrl);
      return fileUrl;
    } else {
      throw new Error('Unsupported file type for uploadFile');
    }
  } catch (error) {
    console.error("Error uploading file:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      type: error.type,
      response: error.response
    });
    
    // Provide more specific error messages for common issues
    if (error.message.includes('permission')) {
      throw new Error('Permission denied. Please check your app permissions in Settings.');
    } else if (error.message.includes('503') || error.message.includes('client read error') || error.message.includes('Service Unavailable')) {
      throw new Error('Server is temporarily unavailable. This might be due to:\n• Large file size - try compressing the file\n• Network issues - check your internet connection\n• Server overload - please try again in a few minutes\n\nTip: Try uploading a smaller file or wait a moment and retry.');
    } else if (error.message.includes('network') || error.message.includes('timeout') || error.message.includes('Network request failed')) {
      throw new Error('Network error. Please check your internet connection and try again. If the problem persists, try restarting the app.');
    } else if (error.message.includes('size') || error.message.includes('too large')) {
      throw new Error('File too large. Please select a smaller file or compress it before uploading.');
    } else if (error.message.includes('format') || error.message.includes('type')) {
      throw new Error('Unsupported file format. Please select a valid file.');
    } else if (error.message.includes('extension not allowed') || error.message.includes('File extension not allowed')) {
      throw new Error('File extension not supported. Please try recording again or select a different file.');
    } else if (error.message.includes('unauthorized') || error.message.includes('Unauthorized')) {
      throw new Error('Authentication error. Please log out and log back in.');
    } else if (error.message.includes('quota') || error.message.includes('limit')) {
      throw new Error('Storage limit reached. Please contact support.');
    }
    
    throw new Error(`Failed to upload file: ${error.message}`);
  }
}

// Get File Preview
export async function getFilePreview(fileId, type) {
  try {
    console.log("Getting file preview for:", fileId, "type:", type);
    
    let fileUrl;

    if (type === "video") {
      // For videos, construct direct URL with iOS-compatible parameters
      // Try multiple URL formats for better iOS compatibility
      const baseUrl = `${appwriteConfig.endpoint}/storage/buckets/${appwriteConfig.storageId}/files/${fileId}`;
      fileUrl = `${baseUrl}/view?project=${appwriteConfig.projectId}`;
      console.log("Video URL generated:", fileUrl);
    } else if (type === "image") {
      // For images, construct preview URL
      fileUrl = `${appwriteConfig.endpoint}/storage/buckets/${appwriteConfig.storageId}/files/${fileId}/preview?width=2000&height=2000&gravity=top&quality=100&project=${appwriteConfig.projectId}`;
      console.log("Image URL generated:", fileUrl);
    } else {
      throw new Error("Invalid file type");
    }

    if (!fileUrl) {
      console.log("No file URL generated");
      throw new Error("No file URL generated");
    }

  
    return fileUrl;
  } catch (error) {
   
    throw new Error(`Failed to get file preview: ${error.message}`);
  }
}


// Create Video Post
export async function createVideoPost(form) {
  try {
   

    let thumbnailUrl = null;
    let videoUrl = null;
    let musicUrl = null;

    // Upload video first
    videoUrl = await uploadFile(form.video, "video");
    
    // Only upload thumbnail if it exists
    if (form.thumbnail) {
      thumbnailUrl = await uploadFile(form.thumbnail, "image");
    } else {
      // Create a default thumbnail or use video URL as thumbnail
      thumbnailUrl = videoUrl; // Use video URL as thumbnail for now
    }

    // Upload music if provided
    if (form.music) {
      try {
        musicUrl = await uploadFile(form.music, "audio");
      } catch (musicError) {
        console.log("Music upload failed (optional):", musicError);
        // Music is optional, continue without it
      }
    }

    if (!videoUrl) {
      throw new Error("Failed to upload video");
    }

    // Build document data - only include fields that exist in schema
    const documentData = {
      title: form.title,
      thumbnail: thumbnailUrl,
      video: videoUrl,
      prompt: form.prompt,
      creator: form.userId,
    };

    // Try to add optional fields - these may not exist in schema
    // We'll try to add them, but if they fail, we'll catch and continue
    if (musicUrl) {
      documentData.music = musicUrl;
    }
    if (form.filter && form.filter !== "none") {
      documentData.filter = form.filter;
    } else {
    }
    // Save video edits (adjustments) if provided
    if (form.edits) {
      documentData.edits = typeof form.edits === 'string' ? form.edits : JSON.stringify(form.edits);
    }

    // Create document with required fields first
    let newPost;
    try {
      newPost = await databases.createDocument(
      appwriteConfig.databaseId,
      appwriteConfig.videoCollectionId,
      ID.unique(),
        documentData
      );
    } catch (createError) {
      // If creation fails due to unknown attributes, try without optional fields
      if (createError.message && createError.message.includes("Unknown attribute")) {
        console.log("Some optional fields not in schema, retrying without them...");
        const basicData = {
        title: form.title,
        thumbnail: thumbnailUrl,
        video: videoUrl,
        prompt: form.prompt,
        creator: form.userId,
        };
        newPost = await databases.createDocument(
          appwriteConfig.databaseId,
          appwriteConfig.videoCollectionId,
          ID.unique(),
          basicData
        );
      } else {
        throw createError;
      }
    }

    // Try to update with optional fields that might not be in schema
    const updateData = {};
    let needsUpdate = false;

    if (musicUrl) {
      updateData.music = musicUrl;
      needsUpdate = true;
    }
    if (form.filter && form.filter !== "none") {
      updateData.filter = form.filter;
      needsUpdate = true;
    }
    if (form.edits) {
      updateData.edits = typeof form.edits === 'string' ? form.edits : JSON.stringify(form.edits);
      needsUpdate = true;
    }
    if (form.link && form.link.trim() !== "") {
      updateData.link = form.link.trim();
      needsUpdate = true;
    }

    // Try to update with optional fields, but don't fail if they don't exist
    if (needsUpdate) {
      try {
        await databases.updateDocument(
          appwriteConfig.databaseId,
          appwriteConfig.videoCollectionId,
          newPost.$id,
          updateData
        );
      } catch (updateError) {
        // If update fails due to unknown attributes, that's okay - fields don't exist in schema
        if (updateError.message && updateError.message.includes("Unknown attribute")) {
          console.log("Optional fields (music, filter, link) are not in database schema. Skipping...");
        } else {
          console.log("Some optional fields couldn't be saved:", updateError.message);
        }
      }
    }

   
    return newPost;
  } catch (error) {
   
    throw new Error(`Failed to create video post: ${error.message}`);
  }
}

// Get all video Posts (sorted by newest first)
export async function getAllPosts() {
  try {
    const posts = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.videoCollectionId,
      [Query.orderDesc("$createdAt")] // Sort by creation date, newest first
    );

    // Add type identifier for videos
    return posts.documents.map(post => ({
      ...post,
      postType: 'video' // Add type identifier
    }));
  } catch (error) {
    throw new Error(error);
  }
}

// Get video posts created by user (sorted by newest first)
export async function getUserPosts(userId) {
  try {
    const posts = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.videoCollectionId,
      [
        Query.equal("creator", userId),
        Query.orderDesc("$createdAt") // Sort by creation date, newest first
      ]
    );

    return posts.documents;
  } catch (error) {
    throw new Error(error);
  }
}

// Get video by ID
export async function getVideoById(videoId) {
  try {
   
    
    const video = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.videoCollectionId,
      videoId
    );

   
    return video;
  } catch (error) {
   
    throw new Error(`Failed to fetch video: ${error.message}`);
  }
}

// Get video posts that matches search query
export async function searchPosts(query) {
  try {
    const posts = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.videoCollectionId,
      [Query.search("title", query)]
    );

    if (!posts) throw new Error("Something went wrong");

    return posts.documents;
  } catch (error) {
    throw new Error(error);
  }
}

// Get latest created video posts
export async function getLatestPosts() {
  try {
    const posts = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.videoCollectionId,
      [Query.orderDesc("$createdAt"), Query.limit(7)]
    );

    return posts.documents;
  } catch (error) {
    throw new Error(error);
  }
}

// Get posts from users that the current user follows
export async function getFollowingPosts(userId) {
  try {
    // Get the current user's following list
    const currentUser = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
      userId
    );
    
    const followingIds = currentUser.following || [];
    
    if (followingIds.length === 0) {
      return [];
    }
    
    // Get posts from all followed users using Query.equal for each user ID
    const allPosts = [];
    for (const followingId of followingIds) {
      try {
        const userPosts = await databases.listDocuments(
          appwriteConfig.databaseId,
          appwriteConfig.videoCollectionId,
          [Query.equal("creator", followingId)]
        );
        allPosts.push(...userPosts.documents);
      } catch (error) {
       
      }
    }
    
    // Sort by creation date (newest first)
    return allPosts.sort((a, b) => new Date(b.$createdAt) - new Date(a.$createdAt));
  } catch (error) {
  
    return [];
  }
}

// ============ PHOTO POST FUNCTIONS ============

// Helper function to extract file ID from Appwrite URL
function extractFileIdFromUrl(url) {
  if (!url) return null;
  
  // Try to extract file ID from URL pattern: .../files/{fileId}/view?...
  const fileIdMatch = url.match(/\/files\/([^\/\?]+)/);
  if (fileIdMatch && fileIdMatch[1]) {
    return fileIdMatch[1];
  }
  
  // If URL is already short (might be just file ID), return as is
  if (url.length <= 120 && !url.includes('http')) {
    return url;
  }
  
  // If we can't extract, return null (will need full URL handling)
  return null;
}

// Helper function to get photo URL from stored file ID or URL
export function getPhotoUrl(photoField) {
  if (!photoField) return null;
  
  // Ensure photoField is a string
  const photoString = String(photoField);
  
  // If it's already a full URL, return it
  if (photoString.startsWith('http')) {
    return photoString;
  }
  
  // If it's a file ID, construct the full URL
  return `${appwriteConfig.endpoint}/storage/buckets/${appwriteConfig.storageId}/files/${photoString}/preview?width=2000&height=2000&gravity=top&quality=100&project=${appwriteConfig.projectId}`;
}

// Create Photo Post
export async function createPhotoPost(form) {
  try {
    let photoUrl = null;

    // Upload photo - similar to how video posts work
    if (form.photo) {
      console.log('Uploading photo for post...');
      // Upload file using existing uploadFile function
      photoUrl = await uploadFile(form.photo, "image");
      
      if (!photoUrl) {
        throw new Error("Failed to upload photo");
      }
      
      console.log('Photo uploaded successfully, URL:', photoUrl ? 'present' : 'missing');
    }

    if (!photoUrl) {
      throw new Error("Failed to upload photo");
    }

    // Try to extract file ID for storage (if database field has length limit)
    // Otherwise, use the full URL like video posts do
    let photoField = photoUrl;
    const fileId = extractFileIdFromUrl(photoUrl);
    
    // Use file ID if extraction succeeded, otherwise use full URL
    // (Appwrite should handle both, but file ID is preferred if database has length limits)
    if (fileId) {
      photoField = fileId;
      console.log('Using extracted file ID for photo field');
    } else {
      console.log('Using full URL for photo field (file ID extraction failed)');
      // If URL is too long and we can't extract ID, try one more extraction method
      const match = photoUrl.match(/\/files\/([a-zA-Z0-9]+)/);
      if (match && match[1]) {
        photoField = match[1];
        console.log('Extracted file ID using alternative method');
      }
    }

    // Build document data - use file ID if available, otherwise use URL
    const documentData = {
      photo: photoField,
      creator: form.userId,
    };

    // Add optional fields - these will be ignored if they don't exist in schema
    // Store title in a description or notes field if title doesn't exist
    // For now, we'll use a minimal approach and only save what's guaranteed to work
    
    console.log('Creating photo post document with data:', {
      hasPhoto: !!documentData.photo,
      photoLength: documentData.photo?.length || 0,
      hasCreator: !!documentData.creator
    });
    
    const newPost = await databases.createDocument(
      appwriteConfig.databaseId,
      appwriteConfig.photoCollectionId,
      ID.unique(),
      documentData
    );
    
    console.log('Photo post created successfully:', newPost.$id);

    // If additional fields are needed, try to update the document
    // This way we can gracefully handle missing attributes
    const updateData = {};
    let needsUpdate = false;

    if (form.title) {
      updateData.title = form.title;
      needsUpdate = true;
    }
    if (form.caption) {
      updateData.caption = form.caption;
      needsUpdate = true;
    }
    if (form.filter && form.filter !== "none") {
      updateData.filter = form.filter;
      needsUpdate = true;
    }
    if (form.edits) {
      updateData.edits = JSON.stringify(form.edits);
      needsUpdate = true;
    }
    if (form.link && form.link.trim() !== "") {
      updateData.link = form.link.trim();
      needsUpdate = true;
    }

    // Try to update with additional fields if any
    if (needsUpdate) {
      try {
        await databases.updateDocument(
          appwriteConfig.databaseId,
          appwriteConfig.photoCollectionId,
          newPost.$id,
          updateData
        );
      } catch (updateError) {
        // If update fails due to missing attributes, that's okay
        // The photo was already created successfully
        if (updateError.message && updateError.message.includes("Unknown attribute")) {
          console.log("Optional fields (edits, link) are not in database schema. Skipping...");
        } else {
        console.log("Some optional fields couldn't be saved:", updateError.message);
        }
      }
    }

    return newPost;
  } catch (error) {
    // If error mentions specific attributes, provide helpful message
    if (error.message && error.message.includes("Unknown attribute")) {
      throw new Error(`Database schema mismatch: ${error.message}. Please ensure your photo collection has at least these attributes: photo (string/url), creator (relationship to users). Optional: title, caption, filter, edits`);
    }
    throw new Error(`Failed to create photo post: ${error.message}`);
  }
}

// Get all photo posts (sorted by newest first)
export async function getAllPhotoPosts() {
  try {
    const posts = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.photoCollectionId,
      [Query.orderDesc("$createdAt")] // Sort by creation date, newest first
    );

    // Convert file IDs to full URLs for display and filter out invalid photos
    return posts.documents
      .filter(post => post.photo) // Filter out posts without photo
      .map(post => {
        const photoUrl = getPhotoUrl(post.photo);
        // Only include if we got a valid URL string
        if (!photoUrl || typeof photoUrl !== 'string') {
          return null;
        }
        return {
          ...post,
          photo: photoUrl,
          postType: 'photo' // Add type identifier
        };
      })
      .filter(Boolean); // Remove null entries
  } catch (error) {
    throw new Error(error);
  }
}

// Get photo posts created by user
export async function getUserPhotos(userId) {
  try {
    const photos = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.photoCollectionId,
      [Query.equal("creator", userId)]
    );

    // Convert file IDs to full URLs for display and filter out invalid photos
    return photos.documents
      .filter(photo => photo.photo) // Filter out photos without photo
      .map(photo => {
        const photoUrl = getPhotoUrl(photo.photo);
        // Only include if we got a valid URL string
        if (!photoUrl || typeof photoUrl !== 'string') {
          return null;
        }
        return {
          ...photo,
          photo: photoUrl
        };
      })
      .filter(Boolean); // Remove null entries
  } catch (error) {
    throw new Error(error);
  }
}

// Get photo by ID
export async function getPhotoById(photoId) {
  try {
    const photo = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.photoCollectionId,
      photoId
    );

    // Convert file ID to full URL for display
    return {
      ...photo,
      photo: getPhotoUrl(photo.photo)
    };
  } catch (error) {
    throw new Error(`Failed to fetch photo: ${error.message}`);
  }
}

// Search photo posts
export async function searchPhotoPosts(query) {
  try {
    const posts = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.photoCollectionId,
      [Query.search("title", query)]
    );

    if (!posts) throw new Error("Something went wrong");

    // Convert file IDs to full URLs for display and filter out invalid photos
    return posts.documents
      .filter(post => post.photo) // Filter out posts without photo
      .map(post => {
        const photoUrl = getPhotoUrl(post.photo);
        // Only include if we got a valid URL string
        if (!photoUrl || typeof photoUrl !== 'string') {
          return null;
        }
        return {
          ...post,
          photo: photoUrl
        };
      })
      .filter(Boolean); // Remove null entries
  } catch (error) {
    throw new Error(error);
  }
}

// Get latest photo posts
export async function getLatestPhotoPosts() {
  try {
    const posts = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.photoCollectionId,
      [Query.orderDesc("$createdAt"), Query.limit(7)]
    );

    // Convert file IDs to full URLs for display and filter out invalid photos
    return posts.documents
      .filter(post => post.photo) // Filter out posts without photo
      .map(post => {
        const photoUrl = getPhotoUrl(post.photo);
        // Only include if we got a valid URL string
        if (!photoUrl || typeof photoUrl !== 'string') {
          return null;
        }
        return {
          ...post,
          photo: photoUrl
        };
      })
      .filter(Boolean); // Remove null entries
  } catch (error) {
    throw new Error(error);
  }
}

// Delete video post
export async function deleteVideoPost(videoId) {
  try {
    // Get the video document to access file URLs if needed
    const video = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.videoCollectionId,
      videoId
    );

    // Delete the document
    await databases.deleteDocument(
      appwriteConfig.databaseId,
      appwriteConfig.videoCollectionId,
      videoId
    );

    // Optionally delete the files from storage if needed
    // Note: This is optional - Appwrite storage files can be cleaned up separately
    // If you want to delete files, extract file IDs and delete them:
    // try {
    //   if (video.video) {
    //     const videoFileId = extractFileIdFromUrl(video.video);
    //     if (videoFileId) {
    //       await storage.deleteFile(appwriteConfig.storageId, videoFileId);
    //     }
    //   }
    //   if (video.thumbnail) {
    //     const thumbnailFileId = extractFileIdFromUrl(video.thumbnail);
    //     if (thumbnailFileId) {
    //       await storage.deleteFile(appwriteConfig.storageId, thumbnailFileId);
    //     }
    //   }
    // } catch (storageError) {
    //   // Log but don't fail if file deletion fails
    //   console.log("Failed to delete storage files:", storageError);
    // }

    return true;
  } catch (error) {
    throw new Error(`Failed to delete video post: ${error.message}`);
  }
}

// Delete photo post
export async function deletePhotoPost(photoId) {
  try {
    // Get the photo document to access file ID if needed
    const photo = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.photoCollectionId,
      photoId
    );

    // Delete the document
    await databases.deleteDocument(
      appwriteConfig.databaseId,
      appwriteConfig.photoCollectionId,
      photoId
    );

    // Optionally delete the file from storage if needed
    // Note: This is optional - Appwrite storage files can be cleaned up separately
    // If you want to delete the file, use the stored file ID:
    // try {
    //   if (photo.photo && !photo.photo.startsWith('http')) {
    //     // If photo.photo is a file ID (not a URL), delete it
    //     await storage.deleteFile(appwriteConfig.storageId, photo.photo);
    //   }
    // } catch (storageError) {
    //   // Log but don't fail if file deletion fails
    //   console.log("Failed to delete storage file:", storageError);
    // }

    return true;
  } catch (error) {
    throw new Error(`Failed to delete photo post: ${error.message}`);
  }
}

// Add bookmark
export async function addBookmark(userId, videoId, videoData) {
  try {
    // Create a very compact string representation
    const title = (videoData?.title || '').substring(0, 15);
    const creator = (videoData?.creator || '').substring(0, 10);
    const postType = videoData?.postType || 'video';
    
    // Create a minimal JSON string
    const compactVideoData = JSON.stringify({
      t: title,
      c: creator,
      pt: postType // Store postType for future reference
    });

   

    const bookmark = await databases.createDocument(
      appwriteConfig.databaseId,
      appwriteConfig.bookmarksCollectionId,
      ID.unique(),
      {
        userId: userId,
        postId: videoId,
        postData: compactVideoData,
        createdAt: new Date().toISOString(),
      }
    );

  
    return bookmark;
  } catch (error) {
    
    throw new Error(`Failed to add bookmark: ${error.message}`);
  }
}

// Remove bookmark
export async function removeBookmark(bookmarkId) {
  try {
    await databases.deleteDocument(
      appwriteConfig.databaseId,
      appwriteConfig.bookmarksCollectionId,
      bookmarkId
    );

   
    return true;
  } catch (error) {
    
    throw new Error(`Failed to remove bookmark: ${error.message}`);
  }
}

// Get user bookmarks
export async function getUserBookmarks(userId) {
  try {
   
    
    const bookmarks = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.bookmarksCollectionId,
      [Query.equal("userId", userId)]
    );

   

    // Filter out bookmarks with invalid data and log for debugging
    const validBookmarks = bookmarks.documents.filter(bookmark => {
    
      
      if (!bookmark.postData || bookmark.postData.trim() === '') {

        return false; // Remove bookmarks with empty data
      }
      
      try {
        const parsed = JSON.parse(bookmark.postData);
       
        // Check if the parsed data has the expected structure (support both old and new format)
        if (parsed && typeof parsed === 'object' && (parsed.title || parsed.creator || parsed.thumbnail || parsed.t || parsed.c)) {
         
          return true; // Keep valid bookmarks
        } else {
         
          return false;
        }
      } catch (error) {
        
        return false; // Remove bookmarks with invalid JSON
      }
    });

    
    return validBookmarks;
  } catch (error) {
    
    return [];
  }
}

// Check if video is bookmarked
export async function isVideoBookmarked(userId, videoId) {
  try {
    const bookmarks = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.bookmarksCollectionId,
      [
        Query.equal("userId", userId),
        Query.equal("postId", videoId)
      ]
    );

    return bookmarks.documents.length > 0;
  } catch (error) {
   
    return false;
  }
}

// Toggle bookmark (add or remove)
export async function toggleBookmark(userId, videoId, videoData) {
  try {
    const isBookmarked = await isVideoBookmarked(userId, videoId);
    
    if (isBookmarked) {
      // Remove bookmark
      const bookmarks = await databases.listDocuments(
        appwriteConfig.databaseId,
        appwriteConfig.bookmarksCollectionId,
        [
          Query.equal("userId", userId),
          Query.equal("postId", videoId)
        ]
      );
      
      if (bookmarks.documents.length > 0) {
        await databases.deleteDocument(
          appwriteConfig.databaseId,
          appwriteConfig.bookmarksCollectionId,
          bookmarks.documents[0].$id
        );
      }
      return false; // Bookmark removed
    } else {
      // Add bookmark
      await addBookmark(userId, videoId, videoData);
      return true; // Bookmark added
    }
  } catch (error) {
   
    throw new Error(`Failed to toggle bookmark: ${error.message}`);
  }
}

// Get share count for a video or photo
export async function getShareCount(postId) {
  try {
    let post = null;
    
    // Try to find post in different collections
    try {
      post = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.videoCollectionId, postId);
    } catch (videoError) {
      try {
        post = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.photoCollectionId, postId);
      } catch (photoError) {
        try {
          post = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.postCollectionId, postId);
        } catch (postError) {
          return 0;
        }
      }
    }
    
    // Return shares count if field exists, otherwise return 0
    return post.shares || 0;
  } catch (error) {
   
    return 0;
  }
}

// Increment share count for a video or photo
export async function incrementShareCount(postId) {
  try {
    let post = null;
    let collectionId = null;
    
    // Try to find post in different collections
    try {
      post = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.videoCollectionId, postId);
      collectionId = appwriteConfig.videoCollectionId;
    } catch (videoError) {
      try {
        post = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.photoCollectionId, postId);
        collectionId = appwriteConfig.photoCollectionId;
      } catch (photoError) {
        try {
          post = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.postCollectionId, postId);
          collectionId = appwriteConfig.postCollectionId;
        } catch (postError) {
          return 1; // Return 1 to indicate a share was attempted
        }
      }
    }
    
    // Check if shares field exists, if not, create it
    const currentShares = post.shares || 0;
    const newShares = currentShares + 1;
    
    // Try to update with shares field
    try {
      await databases.updateDocument(
        appwriteConfig.databaseId,
        collectionId,
        postId,
        { shares: newShares }
      );
    } catch (updateError) {
      // If shares field doesn't exist in schema, just log the share action
     
      return currentShares + 1; // Return incremented count even if we can't save it
    }
    
    return newShares;
  } catch (error) {
   
    // Don't throw error, just log it since sharing itself was successful
   
    return 1; // Return 1 to indicate a share was attempted
  }
}

// Update user profile (username, avatar, and privacy settings)
export async function updateUserProfile(userId, newUsername, newAvatar, isPrivate = false) {
  try {
    const updateData = {
      username: newUsername,
      avatar: newAvatar,
      isPrivate: isPrivate, // Re-enabled now that field exists in schema
    };
    
    const updatedUser = await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
      userId,
      updateData
    );
   
    return updatedUser;
  } catch (error) {
   
    throw new Error("Failed to update profile: " + error.message);
  }
}

// Handle profile access request
export async function handleProfileAccessRequest(profileUserId, requestingUserId, action) {
  try {
    const profileUser = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
      profileUserId
    );

    let updatedAllowedViewers = profileUser.allowedViewers || [];
    let updatedPendingRequests = profileUser.pendingRequests || [];

    if (action === 'approve') {
      // Add to allowed viewers and remove from pending requests
      if (!updatedAllowedViewers.includes(requestingUserId)) {
        updatedAllowedViewers.push(requestingUserId);
      }
      updatedPendingRequests = updatedPendingRequests.filter(id => id !== requestingUserId);
    } else if (action === 'deny') {
      // Remove from pending requests
      updatedPendingRequests = updatedPendingRequests.filter(id => id !== requestingUserId);
    }

    const updatedUser = await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
      profileUserId,
      {
        allowedViewers: updatedAllowedViewers,
        pendingRequests: updatedPendingRequests,
      }
    );

   
    return updatedUser;
  } catch (error) {
    
    throw new Error("Failed to handle access request: " + error.message);
  }
}

// Like or unlike a post (works with both videos and photos)
export async function toggleLikePost(postId, userId, postType = null) {
  let post = null;
  let collectionId = null;
  let collectionName = null;
  
  // If postType is provided, try that collection first for better performance
  if (postType === 'photo') {
    try {
      post = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.photoCollectionId, postId);
      collectionId = appwriteConfig.photoCollectionId;
      collectionName = "photoCollection";
    } catch (photoError) {
      // Fall through to try other collections
      post = null;
    }
  } else if (postType === 'video' || !postType) {
    // Default to video collection first (most common)
    try {
      post = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.videoCollectionId, postId);
      collectionId = appwriteConfig.videoCollectionId;
      collectionName = "videoCollection";
    } catch (videoError) {
      // Fall through to try other collections
      post = null;
    }
  }
  
  // If not found yet, try all collections in order
  if (!post) {
    try {
      // First try post collection (for general posts)
      post = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.postCollectionId, postId);
      collectionId = appwriteConfig.postCollectionId;
      collectionName = "postCollection";
    } catch (postError) {
      try {
        // Try video collection
        post = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.videoCollectionId, postId);
        collectionId = appwriteConfig.videoCollectionId;
        collectionName = "videoCollection";
      } catch (videoError) {
        try {
          // Try photo collection
          post = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.photoCollectionId, postId);
          collectionId = appwriteConfig.photoCollectionId;
          collectionName = "photoCollection";
        } catch (photoError) {
          throw new Error("Post not found in any collection");
        }
      }
    }
  }
  
  // Check if the post has a likes attribute (some collections might not support it)
  // If likes is undefined, initialize it as an empty array
  let likes = post.likes;
  if (likes === undefined || likes === null) {
    // If the attribute doesn't exist, we need to check if the collection supports it
    // For now, initialize as empty array and let the update fail gracefully if not supported
    likes = [];
  } else if (!Array.isArray(likes)) {
    // If likes exists but is not an array, convert it
    likes = Array.isArray(likes) ? likes : [];
  }
  
  const wasLiked = likes.includes(userId);
  if (wasLiked) {
    likes = likes.filter(id => id !== userId);
  } else {
    likes.push(userId);
    // Create notification for like
    if (post.creator !== userId) {
      try {
        await createNotification('like', userId, post.creator, postId);
      } catch (error) {
       
      }
    }
  }
  
  // Ensure likes is a valid array before updating
  if (!Array.isArray(likes)) {
    console.warn("Likes is not an array, converting to array:", likes);
    likes = Array.isArray(likes) ? likes : (likes ? [likes] : []);
  }
  
  // Ensure all likes are strings (Appwrite requirement)
  likes = likes.map(id => String(id)).filter(id => id && id.trim() !== '');
  
  try {
    // Verify the post document structure before updating
    // Check if post has the likes attribute (even if empty/null)
    const hasLikesAttribute = 'likes' in post;
    
    // Log the update attempt for debugging
    console.log(`Updating likes for post ${postId} in ${collectionName} (${collectionId}):`, {
      currentLikesCount: likes.length,
      wasLiked,
      userId,
      hasLikesAttribute,
      postLikesType: typeof post.likes,
      postLikesIsArray: Array.isArray(post.likes)
    });
    
    // If the post doesn't have likes attribute, this might indicate a schema issue
    // But we'll still try to update (Appwrite might auto-add it if schema allows)
    if (!hasLikesAttribute) {
      console.warn(`Post ${postId} in ${collectionName} does not have 'likes' attribute in document. This might indicate a schema issue.`);
    }
    
    // For Photo Collection, if likes attribute doesn't exist, try alternative approach
    // Check if we're dealing with Photo Collection and likes might be stored differently
    if (collectionName === "photoCollection" && !hasLikesAttribute) {
      // Try to see if there's an alternative field or if we need to handle it differently
      console.warn("Photo Collection detected without likes attribute. Attempting update anyway...");
    }
    
    const updatedPost = await databases.updateDocument(appwriteConfig.databaseId, collectionId, postId, { likes });
    
    console.log(`Successfully updated likes for post ${postId}`);
    return updatedPost;
  } catch (error) {
    // Log the full error for debugging
    console.error("Error updating document:", {
      postId,
      collectionId,
      collectionName,
      error: error.message,
      errorCode: error.code,
      errorType: error.type,
      fullError: error
    });
    
    // Special handling for Photo Collection schema issues
    if (collectionName === "photoCollection" && error.message && error.message.includes("Unknown attribute")) {
      console.error("\n" + "=".repeat(60));
      console.error("⚠️ PHOTO COLLECTION SCHEMA ISSUE");
      console.error("=".repeat(60));
      console.error("The Photo Collection is missing the 'likes' attribute.");
      console.error("\n🔧 QUICK FIX OPTIONS:");
      console.error("\nOption 1: Use Appwrite REST API (Postman/curl):");
      console.error("POST https://nyc.cloud.appwrite.io/v1/databases/685494a1002f8417c2b2/collections/691cb9d500277594ea2d/attributes/string");
      console.error("Headers: X-Appwrite-Project: 6854922e0036a1e8dee6");
      console.error("Body: {\"key\":\"likes\",\"size\":255,\"required\":false,\"array\":true}");
      console.error("\nOption 2: Try different browser or clear cache");
      console.error("Option 3: Contact Appwrite support");
      console.error("=".repeat(60) + "\n");
    }
    // If the error is about unknown attribute, provide a more helpful error message
    if (error.message && error.message.includes("Unknown attribute")) {
      const collectionInfo = {
        "postCollection": { id: appwriteConfig.postCollectionId, name: "Post Collection" },
        "videoCollection": { id: appwriteConfig.videoCollectionId, name: "Video Collection" },
        "photoCollection": { id: appwriteConfig.photoCollectionId, name: "Photo Collection" }
      };
      
      const info = collectionInfo[collectionName] || { id: collectionId, name: collectionName };
      
      console.error("=".repeat(60));
      console.error("❌ LIKES ATTRIBUTE MISSING IN COLLECTION SCHEMA");
      console.error("=".repeat(60));
      console.error(`Collection Name: ${info.name}`);
      console.error(`Collection ID: ${info.id}`);
      console.error(`Post ID: ${postId}`);
      console.error("");
      console.error("🔧 TO FIX THIS:");
      console.error("1. Go to Appwrite Console: https://cloud.appwrite.io");
      console.error(`2. Navigate to: Database → Your Database → ${info.name}`);
      console.error("3. Click on 'Attributes' tab");
      console.error("4. Click '+ Create Attribute'");
      console.error("5. Set Type: 'String', Key: 'likes', Array: ON, Required: OFF");
      console.error("6. Click 'Create'");
      console.error("=".repeat(60));
      
      throw new Error(`The "${info.name}" (ID: ${info.id}) does not support likes. Please add the "likes" attribute (String array) to the collection schema in Appwrite. See console for detailed instructions.`);
    }
    // Re-throw other errors
    throw error;
  }
}

// Get users who liked a post (works with both videos and photos)
export async function getPostLikes(postId) {
  let post = null;
  
  // Try to find post in different collections
  try {
    // First try post collection (for general posts)
    post = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.postCollectionId, postId);
  } catch (postError) {
    try {
      // Try video collection
      post = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.videoCollectionId, postId);
    } catch (videoError) {
      try {
        // Try photo collection
        post = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.photoCollectionId, postId);
      } catch (photoError) {
        return [];
      }
    }
  }
  
  return post.likes || [];
}

// Add a comment to a post (with username and avatar)
// parentCommentId is optional - if provided, this is a reply to that comment
export async function addComment(postId, userId, content, parentCommentId = null) {
  try {
   
    // Fetch user info
    const user = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.userCollectionId, userId);
   
    const comment = await databases.createDocument(
      appwriteConfig.databaseId,
      appwriteConfig.commentsCollectionId,
      ID.unique(),
      {
        postId,
        userId,
        username: user.username || '',
        avatar: user.avatar || '',
        content,
        parentCommentId: parentCommentId || null,
        likes: [],
        createdAt: new Date().toISOString(),
      }
    );
   
    
    // Get post creator or comment author to send notification
    let notificationTarget = null;
    
    if (parentCommentId) {
      // This is a reply to a comment - notify the comment author
      try {
        const parentComment = await databases.getDocument(
          appwriteConfig.databaseId,
          appwriteConfig.commentsCollectionId,
          parentCommentId
        );
        notificationTarget = parentComment.userId;
      } catch (error) {
        // Parent comment not found, skip notification
      }
    } else {
      // This is a top-level comment - notify the post creator
      // Try to find the post in video, post, or photo collections
      let post = null;
      
      try {
        // First try the video collection
        post = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.videoCollectionId, postId);
        notificationTarget = post.creator;
      } catch (videoError) {
        try {
          // If not found in video collection, try the post collection
          post = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.postCollectionId, postId);
          notificationTarget = post.creator;
        } catch (postError) {
          try {
            // If not found in post collection, try the photo collection
            post = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.photoCollectionId, postId);
            notificationTarget = post.creator;
          } catch (photoError) {
            // Don't throw error, just skip notification
            return comment;
          }
        }
      }
    }
    
    if (notificationTarget && notificationTarget !== userId) {
      try {
        await createNotification('comment', userId, notificationTarget, postId);
      } catch (error) {
       
      }
    }
    
    return comment;
  } catch (error) {
   
    throw error;
  }
}

// Get comments for a post (with nested replies)
export async function getComments(postId) {
  const res = await databases.listDocuments(
        appwriteConfig.databaseId,
        appwriteConfig.commentsCollectionId,
        [Query.equal('postId', postId), Query.orderDesc('createdAt')]
    );
    
    // Structure comments with nested replies
    const allComments = res.documents;
    // Filter top-level comments (no parentCommentId or it's null/empty)
    const topLevelComments = allComments.filter(comment => {
      const parentId = comment.parentCommentId;
      return !parentId || parentId === null || parentId === '';
    });
    const repliesMap = {};
    
    // Group replies by parent comment ID
    allComments.forEach(comment => {
      const parentId = comment.parentCommentId;
      if (parentId && parentId !== null && parentId !== '') {
        if (!repliesMap[parentId]) {
          repliesMap[parentId] = [];
        }
        // Ensure replies have likes field
        repliesMap[parentId].push({
          ...comment,
          likes: comment.likes || [],
        });
      }
    });
    
    // Sort replies by creation date (oldest first for replies)
    Object.keys(repliesMap).forEach(parentId => {
      repliesMap[parentId].sort((a, b) => 
        new Date(a.createdAt) - new Date(b.createdAt)
      );
    });
    
    // Attach replies to their parent comments
    const structuredComments = topLevelComments.map(comment => ({
      ...comment,
      replies: repliesMap[comment.$id] || [],
      likes: Array.isArray(comment.likes) ? comment.likes : [],
    }));
    
    return structuredComments;
}

// Like or unlike a comment
export async function toggleLikeComment(commentId, userId) {
  try {
    const comment = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.commentsCollectionId,
      commentId
    );
    
    // Ensure likes is always an array
    let likes = Array.isArray(comment.likes) ? comment.likes : [];
    const wasLiked = likes.includes(userId);
    
    if (wasLiked) {
      likes = likes.filter(id => id !== userId);
    } else {
      likes.push(userId);
      // Create notification for like (only if comment author is different from liker)
      if (comment.userId !== userId) {
        try {
          await createNotification('like', userId, comment.userId, comment.postId);
        } catch (error) {
          // Notification error shouldn't break the like functionality
        }
      }
    }
    
    return await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.commentsCollectionId,
      commentId,
      { likes }
    );
  } catch (error) {
    throw error;
  }
}

// Get users who liked a comment
export async function getCommentLikes(commentId) {
  try {
    const comment = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.commentsCollectionId,
      commentId
    );
    
    return comment.likes || [];
  } catch (error) {
    return [];
  }
}

// Follow or unfollow a user
export async function toggleFollowUser(currentUserId, targetUserId) {
  // Get both user docs
  const currentUser = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.userCollectionId, currentUserId);
  const targetUser = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.userCollectionId, targetUserId);
  let following = currentUser.following || [];
  let followers = targetUser.followers || [];
  let isFollowing = following.includes(targetUserId);
  if (isFollowing) {
    // Unfollow: Remove from following/followers lists
    following = following.filter(id => id !== targetUserId);
    followers = followers.filter(id => id !== currentUserId);
    
    // Delete follow notification when user unfollows
    try {
      const followNotifications = await databases.listDocuments(
        appwriteConfig.databaseId,
        appwriteConfig.notificationsCollectionId,
        [
          Query.equal('type', 'follow'),
          Query.equal('fromUserId', currentUserId),
          Query.equal('targetUserId', targetUserId),
        ]
      );
      
      // Delete all follow notifications for this follow action
      if (followNotifications.documents.length > 0) {
        for (const notification of followNotifications.documents) {
          try {
            await databases.deleteDocument(
              appwriteConfig.databaseId,
              appwriteConfig.notificationsCollectionId,
              notification.$id
            );
          } catch (deleteError) {
            // Silent fail - don't interrupt unfollow process
          }
        }
      }
    } catch (error) {
      // Silent fail - don't interrupt unfollow process
    }
  } else {
    // Follow: Add to following/followers lists
    following.push(targetUserId);
    followers.push(currentUserId);
    // Create notification for new follower (will check for duplicates in createNotification)
    try {
      await createNotification('follow', currentUserId, targetUserId);
    } catch (error) {
     
    }
  }
  await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.userCollectionId, currentUserId, { following });
  await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.userCollectionId, targetUserId, { followers });
  return { following, followers };
}

// Get followers of a user with complete user details
export async function getFollowers(userId) {
  try {
    const user = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.userCollectionId, userId);
    const followerIds = user.followers || [];
    
    // Fetch complete user details for each follower
    const followers = [];
    for (const followerId of followerIds) {
      try {
        const follower = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.userCollectionId, followerId);
        followers.push({
          $id: follower.$id,
          username: follower.username,
          avatar: follower.avatar,
          email: follower.email
        });
      } catch (error) {
       
      }
    }
    
    return followers;
  } catch (error) {
    
    return [];
  }
}

// Get following of a user with complete user details
export async function getFollowing(userId) {
  try {
    const user = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.userCollectionId, userId);
    const followingIds = user.following || [];
    
    // Fetch complete user details for each following
    const following = [];
    for (const followingId of followingIds) {
      try {
        const followingUser = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.userCollectionId, followingId);
        following.push({
          $id: followingUser.$id,
          username: followingUser.username,
          avatar: followingUser.avatar,
          email: followingUser.email
        });
      } catch (error) {
       
      }
    }
    
    return following;
  } catch (error) {
   
    return [];
  }
}

// Sum all likes for a user's posts
export async function getUserLikesCount(userId) {
    const res = await databases.listDocuments(
      appwriteConfig.databaseId,
    appwriteConfig.postCollectionId,
      [Query.equal('creator', userId)]
    );
    let totalLikes = 0;
    for (const post of res.documents) {
      if (Array.isArray(post.likes)) {
        totalLikes += post.likes.length;
      }
    }
    return totalLikes;
}

// Notification functions
export async function createNotification(type, fromUserId, targetUserId, postId = null) {
  try {
    // For follow notifications, check if notification already exists (avoid duplicates)
    if (type === 'follow') {
      const existingNotifications = await databases.listDocuments(
        appwriteConfig.databaseId,
        appwriteConfig.notificationsCollectionId,
        [
          Query.equal('type', 'follow'),
          Query.equal('fromUserId', fromUserId),
          Query.equal('targetUserId', targetUserId),
        ]
      );
      
      // If notification already exists, don't create duplicate
      if (existingNotifications.documents.length > 0) {
        return existingNotifications.documents[0]; // Return existing notification
      }
    }

    // Get user details
    const fromUser = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
      fromUserId
    );

    // Handle avatar URL length limitation
    let avatarField = '';
    if (fromUser.avatar) {
      // If avatar URL is too long, store just the file ID or truncate
      if (fromUser.avatar.length > 100) {
        // Try to extract file ID from the URL
        const fileIdMatch = fromUser.avatar.match(/\/files\/([^\/\?]+)/);
        if (fileIdMatch) {
          avatarField = fileIdMatch[1]; // Store just the file ID
        } else {
          // If we can't extract file ID, truncate the URL
          avatarField = fromUser.avatar.substring(0, 97) + '...';
        }
      } else {
        avatarField = fromUser.avatar;
      }
    }

    const notification = await databases.createDocument(
      appwriteConfig.databaseId,
      appwriteConfig.notificationsCollectionId,
      'unique()',
      {
        type,
        fromUserId,
        fromUsername: fromUser.username,
        fromUserAvatar: avatarField,
        targetUserId,
        postId,
        isRead: false,
        createdAt: new Date().toISOString(),
      }
    );

    return notification;
  } catch (error) {
   
    throw error;
  }
}

export async function markNotificationAsRead(notificationId) {
  try {
    await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.notificationsCollectionId,
      notificationId,
      {
        isRead: true,
      }
    );
  } catch (error) {
   
    throw error;
  }
}

export async function getNotifications(userId) {
  try {
    const response = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.notificationsCollectionId,
      [
        Query.equal('targetUserId', userId),
        Query.orderDesc('createdAt'),
      ]
    );
    return response.documents;
  } catch (error) {
   
    throw error;
  }
}

// Get total unread notification count (notifications + messages)
export async function getUnreadNotificationCount(userId) {
  try {
    // Get unread notifications
    const notificationsResponse = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.notificationsCollectionId,
      [
        Query.equal('targetUserId', userId),
        Query.equal('isRead', false),
      ]
    );
    const unreadNotificationsCount = notificationsResponse.documents.length;

    // Get unread messages
    const messagesResponse = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.messagesCollectionId,
      [
        Query.equal('receiverId', userId),
        Query.equal('is_read', false),
      ]
    );
    const unreadMessagesCount = messagesResponse.documents.length;

    return unreadNotificationsCount + unreadMessagesCount;
  } catch (error) {
    console.error('Error getting unread notification count:', error);
    return 0;
  }
}

// Recently watched videos functions
export async function addToRecentlyWatched(userId, videoId) {
  try {
   
    
    // Get the user document directly using userId
    const user = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
      userId
    );

    // Check if recentlyWatched attribute exists, if not create it
    let recentlyWatched = [];
    try {
      recentlyWatched = user.recentlyWatched || [];
     
    } catch (attrError) {
      // If attribute doesn't exist, start with empty array
      recentlyWatched = [];
     
    }
    
    // Remove if already exists to avoid duplicates
    recentlyWatched = recentlyWatched.filter(id => id !== videoId);
    
    // Add to beginning (most recent first)
    recentlyWatched.unshift(videoId);
    
    // Keep only last 10 videos
    if (recentlyWatched.length > 10) {
      recentlyWatched = recentlyWatched.slice(0, 10);
    }

   
    // Update user document
    await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
      userId,
      {
        recentlyWatched: recentlyWatched
      }
    );
    
    
  } catch (error) {
   
    // Don't throw error to avoid breaking video playback
  }
}

export async function getRecentlyWatchedVideos(userId) {
  try {
   
    
    // Get user's recently watched video IDs
    const user = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
      userId
    );

    // Check if recentlyWatched attribute exists
    let recentlyWatchedIds = [];
    try {
      recentlyWatchedIds = user.recentlyWatched || [];
     
    } catch (attrError) {
      // If attribute doesn't exist, return empty array
     
      return [];
    }
    
    if (recentlyWatchedIds.length === 0) {
      return [];
    }

    // Get the actual video documents and clean up invalid IDs
    const validVideos = [];
    const validVideoIds = [];
    
    for (const videoId of recentlyWatchedIds) {
      try {
        const video = await databases.getDocument(
          appwriteConfig.databaseId,
          appwriteConfig.postCollectionId,
          videoId
        );
        if (video) {
          validVideos.push(video);
          validVideoIds.push(videoId);
        }
      } catch (error) {
       
        // Skip invalid video IDs
      }
    }

    // Update the user's recentlyWatched array to remove invalid IDs
    if (validVideoIds.length !== recentlyWatchedIds.length) {
      try {
        await databases.updateDocument(
          appwriteConfig.databaseId,
          appwriteConfig.userCollectionId,
          userId,
          {
            recentlyWatched: validVideoIds
          }
        );
       
      } catch (updateError) {
       
      }
    }

    
    return validVideos;
  } catch (error) {
   
    return [];
  }
}

// ==================== ADVERTISEMENT FUNCTIONS ====================

// Create Advertisement
export async function createAdvertisement(form) {
  try {
    let imageUrl = null;
    
    // Upload advertisement image if provided
    if (form.image) {
      imageUrl = await uploadFile(form.image, "image");
      if (!imageUrl) {
        throw new Error("Failed to upload advertisement image");
      }
    }

    // Calculate end date based on subscription plan
    const startDate = new Date();
    const endDate = new Date();
    
    switch (form.subscriptionPlan) {
      case 'daily':
        endDate.setDate(endDate.getDate() + 1);
        break;
      case 'weekly':
        endDate.setDate(endDate.getDate() + 7);
        break;
      case 'monthly':
        endDate.setMonth(endDate.getMonth() + 1);
        break;
      default:
        endDate.setDate(endDate.getDate() + 1);
    }

    const newAd = await databases.createDocument(
      appwriteConfig.databaseId,
      appwriteConfig.advertisementsCollectionId,
      ID.unique(),
      {
        title: form.title,
        description: form.description || "",
        image: imageUrl,
        linkUrl: form.linkUrl || "",
        advertiserId: form.advertiserId,
        advertiserName: form.advertiserName || "",
        subscriptionPlan: form.subscriptionPlan, // 'daily', 'weekly', 'monthly'
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        isActive: true,
        status: "active", // Required attribute - can be 'active', 'paused', 'expired'
        clickCount: 0,
        viewCount: 0,
        targetAudience: form.targetAudience || "all", // 'all', 'specific'
        paymentIntentId: form.paymentIntentId || "", // Store payment intent ID
        paymentStatus: form.paymentStatus || "pending", // 'pending', 'completed', 'failed'
        amount: form.amount || 0, // Store payment amount
      }
    );

    return newAd;
  } catch (error) {
    console.error("Error creating advertisement:", error);
    throw new Error(`Failed to create advertisement: ${error.message}`);
  }
}

// Get Active Advertisements
export async function getActiveAdvertisements() {
  try {
    const now = new Date().toISOString();
    const ads = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.advertisementsCollectionId,
      [
        Query.equal("isActive", true),
        Query.greaterThanEqual("endDate", now),
        Query.orderDesc("$createdAt")
      ]
    );

    return ads.documents;
  } catch (error) {
    console.error("Error fetching active advertisements:", error);
    return [];
  }
}

// Get Advertisements by Advertiser
export async function getAdvertiserAds(advertiserId) {
  try {
    // Validate advertiserId before querying
    if (!advertiserId || typeof advertiserId !== 'string' || advertiserId.trim() === '') {
      console.error("Invalid advertiserId provided:", advertiserId);
      return [];
    }

    // Ensure advertiserId is a string and trimmed
    const validAdvertiserId = String(advertiserId).trim();
    
    console.log("Fetching ads for advertiserId:", validAdvertiserId);

    const ads = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.advertisementsCollectionId,
      [
        Query.equal("advertiserId", validAdvertiserId),
        Query.orderDesc("$createdAt")
      ]
    );

    console.log("Successfully fetched ads:", ads.documents.length);
    return ads.documents;
  } catch (error) {
    console.error("Error fetching advertiser ads:", error);
    console.error("Error message:", error.message);
    console.error("AdvertiserId that caused error:", advertiserId);
    console.error("AdvertiserId type:", typeof advertiserId);
    
    return [];
  }
}

// Update Advertisement
export async function updateAdvertisement(adId, updates) {
  try {
    const updatedAd = await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.advertisementsCollectionId,
      adId,
      updates
    );

    return updatedAd;
  } catch (error) {
    console.error("Error updating advertisement:", error);
    throw new Error(`Failed to update advertisement: ${error.message}`);
  }
}

// Delete Advertisement
export async function deleteAdvertisement(adId) {
  try {
    await databases.deleteDocument(
      appwriteConfig.databaseId,
      appwriteConfig.advertisementsCollectionId,
      adId
    );

    return true;
  } catch (error) {
    console.error("Error deleting advertisement:", error);
    throw new Error(`Failed to delete advertisement: ${error.message}`);
  }
}

// Increment Advertisement View Count
export async function incrementAdViewCount(adId) {
  try {
    const ad = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.advertisementsCollectionId,
      adId
    );

    const newViewCount = (ad.viewCount || 0) + 1;
    await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.advertisementsCollectionId,
      adId,
      { viewCount: newViewCount }
    );

    return newViewCount;
  } catch (error) {
    console.error("Error incrementing ad view count:", error);
    return null;
  }
}

// Increment Advertisement Click Count
export async function incrementAdClickCount(adId) {
  try {
    const ad = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.advertisementsCollectionId,
      adId
    );

    const newClickCount = (ad.clickCount || 0) + 1;
    await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.advertisementsCollectionId,
      adId,
      { clickCount: newClickCount }
    );

    return newClickCount;
  } catch (error) {
    console.error("Error incrementing ad click count:", error);
    return null;
  }
}

// Update Advertisement Payment Status
export async function updateAdvertisementPaymentStatus(adId, paymentStatus, paymentIntentId = null) {
  try {
    const updateData = { paymentStatus };
    if (paymentIntentId) {
      updateData.paymentIntentId = paymentIntentId;
    }

    const updatedAd = await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.advertisementsCollectionId,
      adId,
      updateData
    );

    return updatedAd;
  } catch (error) {
    console.error("Error updating advertisement payment status:", error);
    throw new Error(`Failed to update advertisement payment status: ${error.message}`);
  }
}

// Create Advertising Payment Record
export async function createAdvertisingPayment({
  advertiserId,
  advertisementId,
  amount,
  subscriptionPlan,
  paymentIntentId,
  status = "completed",
  currency = "USD"
}) {
  try {
    const payment = await databases.createDocument(
      appwriteConfig.databaseId,
      appwriteConfig.advertisingPaymentsCollectionId,
      ID.unique(),
      {
        advertiserId,
        advertisementId: advertisementId || "",
        amount: parseFloat(amount),
        subscriptionPlan,
        paymentIntentId: paymentIntentId || "",
        status, // 'pending', 'completed', 'failed', 'refunded'
        currency,
        createdAt: new Date().toISOString(),
      }
    );

    return payment;
  } catch (error) {
    console.error("Error creating advertising payment:", error);
    throw new Error(`Failed to create advertising payment: ${error.message}`);
  }
}

// Get Advertising Payments for Advertiser
export async function getAdvertiserPayments(advertiserId) {
  try {
    const payments = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.advertisingPaymentsCollectionId,
      [
        Query.equal("advertiserId", advertiserId),
        Query.orderDesc("$createdAt")
      ]
    );

    return payments.documents;
  } catch (error) {
    console.error("Error fetching advertiser payments:", error);
    return [];
  }
}

// Get Total Advertising Revenue (for platform/admin)
export async function getTotalAdvertisingRevenue() {
  try {
    const payments = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.advertisingPaymentsCollectionId,
      [
        Query.equal("status", "completed"),
        Query.orderDesc("$createdAt")
      ]
    );

    const totalRevenue = payments.documents.reduce((sum, payment) => {
      return sum + (parseFloat(payment.amount) || 0);
    }, 0);

    return totalRevenue;
  } catch (error) {
    console.error("Error calculating total advertising revenue:", error);
    return 0;
  }
}

// ==================== DONATION FUNCTIONS ====================

// Create Donation Record
export async function createDonation({
  donorId,
  creatorId,
  amount,
  platformFee,
  creatorReceives,
  message = "",
  paymentIntentId = null,
  status = "pending",
  currency = "USD"
}) {
  try {
    const now = new Date();
    const donation = await databases.createDocument(
      appwriteConfig.databaseId,
      appwriteConfig.donationsCollectionId,
      ID.unique(),
      {
        donorId,
        creatorId,
        amount: parseFloat(amount),
        platformFee: parseFloat(platformFee),
        creatorReceives: parseFloat(creatorReceives),
        message: message || "",
        paymentIntentId: paymentIntentId || "",
        status, // 'pending', 'completed', 'failed', 'refunded'
        currency: currency.toUpperCase(), // Required attribute - must be USD, EUR, GBP, or JPY
        donationDate: now.toISOString(), // Required attribute
        payoutMethod: "stripe", // Required attribute - default to stripe
        createdAt: now.toISOString(),
      }
    );

    return donation;
  } catch (error) {
    console.error("Error creating donation:", error);
    throw new Error(`Failed to create donation: ${error.message}`);
  }
}

// Update Donation Status
export async function updateDonationStatus(donationId, status, paymentIntentId = null) {
  try {
    const updateData = { status };
    if (paymentIntentId) {
      updateData.paymentIntentId = paymentIntentId;
    }

    const updatedDonation = await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.donationsCollectionId,
      donationId,
      updateData
    );

    return updatedDonation;
  } catch (error) {
    console.error("Error updating donation status:", error);
    throw new Error(`Failed to update donation status: ${error.message}`);
  }
}

// Get Donations for a Creator
export async function getCreatorDonations(creatorId) {
  try {
    const donations = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.donationsCollectionId,
      [
        Query.equal("creatorId", creatorId),
        Query.equal("status", "completed"),
        Query.orderDesc("$createdAt")
      ]
    );

    return donations.documents;
  } catch (error) {
    console.error("Error fetching creator donations:", error);
    return [];
  }
}

// Get Donations by Donor
export async function getDonorDonations(donorId) {
  try {
    const donations = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.donationsCollectionId,
      [
        Query.equal("donorId", donorId),
        Query.orderDesc("$createdAt")
      ]
    );

    return donations.documents;
  } catch (error) {
    console.error("Error fetching donor donations:", error);
    return [];
  }
}

// Get Total Donations for Creator
export async function getCreatorTotalDonations(creatorId) {
  try {
    const donations = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.donationsCollectionId,
      [
        Query.equal("creatorId", creatorId),
        Query.equal("status", "completed")
      ]
    );

    const total = donations.documents.reduce((sum, donation) => {
      return sum + (parseFloat(donation.creatorReceives) || 0);
    }, 0);

    return total;
  } catch (error) {
    console.error("Error calculating total donations:", error);
    return 0;
  }
}

// Get Total Platform Fees (ASAB Revenue)
export async function getTotalPlatformFees() {
  try {
    const donations = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.donationsCollectionId,
      [
        Query.equal("status", "completed")
      ]
    );

    const total = donations.documents.reduce((sum, donation) => {
      return sum + (parseFloat(donation.platformFee) || 0);
    }, 0);

    return total;
  } catch (error) {
    console.error("Error calculating total platform fees:", error);
    return 0;
  }
}

// Get Recent Donations (for display)
export async function getRecentDonations(creatorId, limit = 10) {
  try {
    const donations = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.donationsCollectionId,
      [
        Query.equal("creatorId", creatorId),
        Query.equal("status", "completed"),
        Query.orderDesc("$createdAt"),
        Query.limit(limit)
      ]
    );

    // Fetch donor details for each donation
    const donationsWithDonors = await Promise.all(
      donations.documents.map(async (donation) => {
        try {
          const donor = await databases.getDocument(
            appwriteConfig.databaseId,
            appwriteConfig.userCollectionId,
            donation.donorId
          );
          return {
            ...donation,
            donorName: donor.username || "Anonymous",
            donorAvatar: donor.avatar || ""
          };
        } catch (error) {
          return {
            ...donation,
            donorName: "Anonymous",
            donorAvatar: ""
          };
        }
      })
    );

    return donationsWithDonors;
  } catch (error) {
    console.error("Error fetching recent donations:", error);
    return [];
  }
}

// ==================== PAYOUT FUNCTIONS ====================

// Create Payout Record
export async function createPayout({
  creatorId,
  amount,
  donationIds = [],
  status = "pending",
  payoutMethod = "stripe",
  payoutAccountId = null,
  transactionId = null,
  currency = "USD"
}) {
  try {
    // Generate a unique payout ID
    const payoutId = `payout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    
    // Convert donationIds array to string (comma-separated)
    // Appwrite expects a string, not an array
    const donationIdsString = Array.isArray(donationIds) 
      ? donationIds.join(',') 
      : (donationIds || '');
    
    // Convert status to proper format (Appwrite expects: "Pending", "Completed", "Failed")
    const formatStatus = (status) => {
      const statusLower = (status || 'pending').toLowerCase();
      switch (statusLower) {
        case 'pending':
          return 'Pending';
        case 'completed':
          return 'Completed';
        case 'failed':
          return 'Failed';
        case 'processing':
          return 'Pending'; // Map processing to Pending if not supported
        default:
          return 'Pending';
      }
    };
    
    // Convert payoutMethod to proper format (Appwrite expects: "PayPal", "bankTransfer", "creditCard", "Cryptocurrency")
    const formatPayoutMethod = (method) => {
      const methodLower = (method || 'stripe').toLowerCase();
      switch (methodLower) {
        case 'stripe':
          return 'bankTransfer'; // Stripe payouts go to bank accounts
        case 'paypal':
          return 'PayPal';
        case 'banktransfer':
        case 'bank_transfer':
          return 'bankTransfer';
        case 'creditcard':
        case 'credit_card':
          return 'creditCard';
        case 'cryptocurrency':
        case 'crypto':
          return 'Cryptocurrency';
        default:
          return 'bankTransfer'; // Default to bankTransfer for Stripe
      }
    };
    
    const payout = await databases.createDocument(
      appwriteConfig.databaseId,
      appwriteConfig.payoutsCollectionId,
      ID.unique(),
      {
        creatorId,
        userId: creatorId, // Required attribute - same as creatorId
        amount: parseFloat(amount),
        donationIds: donationIdsString, // String format (comma-separated IDs)
        status: formatStatus(status), // Must be: "Pending", "Completed", or "Failed"
        payoutMethod: formatPayoutMethod(payoutMethod), // Must be: "PayPal", "bankTransfer", "creditCard", or "Cryptocurrency"
        payoutAccountId: payoutAccountId || "",
        transactionId: transactionId || "",
        payoutId: payoutId, // Required attribute
        currency: currency.toUpperCase() || "USD", // Required attribute
        payoutDate: now, // Required attribute - payout date
        createdAt: now,
      }
    );

    return payout;
  } catch (error) {
    console.error("Error creating payout:", error);
    throw new Error(`Failed to create payout: ${error.message}`);
  }
}

// Update Payout Status
export async function updatePayoutStatus(payoutId, status, transactionId = null) {
  try {
    // Convert status to proper format (Appwrite expects: "Pending", "Completed", "Failed")
    const formatStatus = (status) => {
      const statusLower = (status || 'pending').toLowerCase();
      switch (statusLower) {
        case 'pending':
          return 'Pending';
        case 'completed':
          return 'Completed';
        case 'failed':
          return 'Failed';
        case 'processing':
          return 'Pending'; // Map processing to Pending if not supported
        default:
          return 'Pending';
      }
    };
    
    const updateData = { status: formatStatus(status) };
    if (transactionId) {
      updateData.transactionId = transactionId;
    }

    const updatedPayout = await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.payoutsCollectionId,
      payoutId,
      updateData
    );

    return updatedPayout;
  } catch (error) {
    console.error("Error updating payout status:", error);
    throw new Error(`Failed to update payout status: ${error.message}`);
  }
}

// Get Payouts for Creator
export async function getCreatorPayouts(creatorId) {
  try {
    const payouts = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.payoutsCollectionId,
      [
        Query.equal("creatorId", creatorId),
        Query.orderDesc("$createdAt")
      ]
    );

    return payouts.documents;
  } catch (error) {
    console.error("Error fetching creator payouts:", error);
    return [];
  }
}

// Get Pending Payout Amount for Creator
export async function getPendingPayoutAmount(creatorId) {
  try {
    const donations = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.donationsCollectionId,
      [
        Query.equal("creatorId", creatorId),
        Query.equal("status", "completed")
      ]
    );

    // Check which donations have been paid out
    const payouts = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.payoutsCollectionId,
      [
        Query.equal("creatorId", creatorId),
        Query.equal("status", "completed")
      ]
    );

    // Get all donation IDs that have been paid out
    const paidOutDonationIds = new Set();
    payouts.documents.forEach(payout => {
      if (payout.donationIds && Array.isArray(payout.donationIds)) {
        payout.donationIds.forEach(id => paidOutDonationIds.add(id));
      }
    });

    // Calculate pending amount
    const pendingAmount = donations.documents
      .filter(donation => !paidOutDonationIds.has(donation.$id))
      .reduce((sum, donation) => {
        return sum + (parseFloat(donation.creatorReceives) || 0);
      }, 0);

    return pendingAmount;
  } catch (error) {
    console.error("Error calculating pending payout:", error);
    return 0;
  }
}

// ==================== ADMIN DONATION/PAYOUT QUERIES ====================
// Note: These require Appwrite permissions that allow the current user to read the collections.

export async function getAllDonations(limit = 50) {
  try {
    const res = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.donationsCollectionId,
      [Query.orderDesc("$createdAt"), Query.limit(limit)]
    );
    return res.documents;
  } catch (error) {
    console.error("Error fetching all donations:", error);
    return [];
  }
}

export async function getAllPayouts(limit = 50) {
  try {
    const res = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.payoutsCollectionId,
      [Query.orderDesc("$createdAt"), Query.limit(limit)]
    );
    return res.documents;
  } catch (error) {
    console.error("Error fetching all payouts:", error);
    return [];
  }
}

// ==================== SERVER URL HELPERS ====================

// Get server URL with better error handling
const getServerUrl = () => {
  return process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001';
};

// Helper to check if server is reachable
const isServerReachable = async (url) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${url}/api/health`, { 
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
};

// Process Payout via Stripe (calls server endpoint)
export async function processPayout(payoutId, creatorId, amount, currency = 'USD', destinationAccountId = null) {
  try {
    const serverUrl = getServerUrl();
    
    const response = await fetch(`${serverUrl}/api/process-payout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payoutId,
        creatorId,
        amount,
        currency,
        destinationAccountId
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error processing payout:", error);
    
    if (error.message.includes('Network request failed') || error.message.includes('Failed to fetch')) {
      const serverUrl = getServerUrl();
      throw new Error(
        `Cannot connect to payment server.\n\n` +
        `Server URL: ${serverUrl}\n\n` +
        `Please ensure the server is running and accessible.`
      );
    }
    
    throw new Error(`Failed to process payout: ${error.message}`);
  }
}

// ==================== STRIPE CONNECT FUNCTIONS ====================

// Create Stripe Connect Account for Creator
export async function createStripeAccount(creatorId, email, country = 'US') {
  try {
    const serverUrl = getServerUrl();
    
    // Check if server is reachable first
    const serverReachable = await isServerReachable(serverUrl).catch(() => false);
    
    if (!serverReachable) {
      throw new Error(
        `Payment server is not reachable at ${serverUrl}.\n\n` +
        `Please ensure:\n` +
        `1. Server is running (cd server && npm start)\n` +
        `2. For real devices, set EXPO_PUBLIC_SERVER_URL to your computer's IP (e.g., http://192.168.1.100:3001)\n` +
        `3. Both devices are on the same WiFi network\n` +
        `4. Restart Expo after changing .env`
      );
    }
    
    const response = await fetch(`${serverUrl}/api/create-stripe-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        creatorId,
        email,
        country
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error creating Stripe account:", error);
    
    // Provide more helpful error messages
    if (error.message.includes('Network request failed') || error.message.includes('Failed to fetch')) {
      const serverUrl = getServerUrl();
      throw new Error(
        `Cannot connect to payment server.\n\n` +
        `Server URL: ${serverUrl}\n\n` +
        `Solutions:\n` +
        `1. Make sure server is running: cd server && npm start\n` +
        `2. For real device, update .env with your computer's IP:\n` +
        `   EXPO_PUBLIC_SERVER_URL=http://YOUR_IP:3001\n` +
        `3. Restart Expo after changing .env\n` +
        `4. Check firewall settings`
      );
    }
    
    throw new Error(`Failed to create Stripe account: ${error.message}`);
  }
}

// Create Account Link for Onboarding
export async function createAccountLink(accountId, returnUrl, refreshUrl) {
  try {
    const serverUrl = getServerUrl();
    
    const response = await fetch(`${serverUrl}/api/create-account-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        accountId,
        returnUrl,
        refreshUrl
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error creating account link:", error);
    
    if (error.message.includes('Network request failed') || error.message.includes('Failed to fetch')) {
      const serverUrl = getServerUrl();
      throw new Error(
        `Cannot connect to payment server.\n\n` +
        `Server URL: ${serverUrl}\n\n` +
        `Please ensure the server is running and accessible.`
      );
    }
    
    throw new Error(`Failed to create account link: ${error.message}`);
  }
}

// Get Stripe Account Status
export async function getStripeAccountStatus(accountId) {
  try {
    const serverUrl = getServerUrl();
    
    const response = await fetch(`${serverUrl}/api/stripe-account-status/${accountId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error getting account status:", error);
    
    if (error.message.includes('Network request failed') || error.message.includes('Failed to fetch')) {
      const serverUrl = getServerUrl();
      throw new Error(
        `Cannot connect to payment server.\n\n` +
        `Server URL: ${serverUrl}\n\n` +
        `Please ensure the server is running and accessible.`
      );
    }
    
    throw new Error(`Failed to get account status: ${error.message}`);
  }
}

// Update User with Stripe Account ID
export async function updateUserStripeAccount(userId, stripeAccountId) {
  try {
    await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
      userId,
      {
        stripeAccountId: stripeAccountId
      }
    );
  } catch (error) {
    console.error("Error updating user Stripe account:", error);
    throw new Error(`Failed to update Stripe account: ${error.message}`);
  }
}


