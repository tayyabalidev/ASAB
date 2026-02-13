

import { Client, Databases, ID } from "react-native-appwrite";

const appwriteConfig = {
  endpoint: "https://nyc.cloud.appwrite.io/v1",
  projectId: "6854922e0036a1e8dee6",
  databaseId: "685494a1002f8417c2b2",
  photoCollectionId: "691cb9d500277594ea2d",
};

const client = new Client();
client
  .setEndpoint(appwriteConfig.endpoint)
  .setProject(appwriteConfig.projectId)
  .setPlatform("com.jsm.asabcorp");

const databases = new Databases(client);

/**
 * Create likes attribute in Photo Collection
 * Note: This might require admin permissions
 */
export async function createLikesAttribute() {
  try {
    // Note: Appwrite SDK doesn't directly support creating attributes
    // You need to use the REST API or Appwrite Console
    
    console.log("To create the attribute, use one of these methods:");
    console.log("1. Use Appwrite Console (recommended)");
    console.log("2. Use Appwrite REST API");
    console.log("3. Use Appwrite CLI");
    
    // Alternative: Try to update a document with likes to see if it auto-creates
    // This won't work if the attribute doesn't exist in schema
    
    return {
      success: false,
      message: "Use Appwrite Console or REST API to create attributes"
    };
  } catch (error) {
    console.error("Error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * REST API Method (use in Postman or curl)
 * 
 * POST https://nyc.cloud.appwrite.io/v1/databases/685494a1002f8417c2b2/collections/691cb9d500277594ea2d/attributes/string
 * 
 * Headers:
 * X-Appwrite-Project: 6854922e0036a1e8dee6
 * Content-Type: application/json
 * 
 * Body:
 * {
 *   "key": "likes",
 *   "size": 255,
 *   "required": false,
 *   "array": true,
 *   "default": null
 * }
 */
