/**
 * Verification Script for Call Setup
 * 
 * Run this to verify your Appwrite Calls collection is set up correctly
 * 
 * Usage: node verify-call-setup.js
 */

const { databases, appwriteConfig } = require('./lib/appwrite');

async function verifyCallSetup() {
  console.log('🔍 Verifying Call Setup...\n');

  try {
    // 1. Check if collection exists
    console.log('1. Checking collection...');
    try {
      const collection = await databases.getCollection(
        appwriteConfig.databaseId,
        appwriteConfig.callsCollectionId
      );
      console.log('   ✅ Collection found:', collection.name);
    } catch (error) {
      console.log('   ❌ Collection not found. Please check the collection ID.');
      return;
    }

    // 2. Check attributes
    console.log('\n2. Checking attributes...');
    const attributes = await databases.listAttributes(
      appwriteConfig.databaseId,
      appwriteConfig.callsCollectionId
    );

    const requiredAttributes = [
      'callerId',
      'receiverId',
      'callerUsername',
      'callType',
      'status',
      'channelName',
      'startTime',
      'acceptedAt',
      'endedAt',
      'duration',
    ];

    const existingAttributes = attributes.attributes.map(attr => attr.key);
    const missingAttributes = requiredAttributes.filter(
      attr => !existingAttributes.includes(attr)
    );

    if (missingAttributes.length === 0) {
      console.log('   ✅ All required attributes found');
    } else {
      console.log('   ⚠️  Missing attributes:', missingAttributes.join(', '));
      console.log('   Please add these attributes in Appwrite Console');
    }

    // 3. Check permissions
    console.log('\n3. Checking permissions...');
    const permissions = await databases.listPermissions(
      appwriteConfig.databaseId,
      appwriteConfig.callsCollectionId
    );

    if (permissions.permissions.length > 0) {
      console.log('   ✅ Permissions configured');
    } else {
      console.log('   ⚠️  No permissions found. Please set up permissions:');
      console.log('      - Create: Authenticated users');
      console.log('      - Read: Users (caller or receiver)');
      console.log('      - Update: Users (caller or receiver)');
    }

    // 4. Test document creation
    console.log('\n4. Testing document creation...');
    try {
      const testDoc = await databases.createDocument(
        appwriteConfig.databaseId,
        appwriteConfig.callsCollectionId,
        'unique()',
        {
          callerId: 'test_caller',
          receiverId: 'test_receiver',
          callerUsername: 'Test User',
          callType: 'video',
          status: 'calling',
          channelName: 'test_channel',
          startTime: new Date().toISOString(),
        }
      );

      // Clean up test document
      await databases.deleteDocument(
        appwriteConfig.databaseId,
        appwriteConfig.callsCollectionId,
        testDoc.$id
      );

      console.log('   ✅ Document creation/delete test passed');
    } catch (error) {
      console.log('   ❌ Document creation failed:', error.message);
      console.log('   This might be due to missing attributes or permissions');
    }

    console.log('\n✅ Setup verification complete!');
    console.log('\nNext steps:');
    console.log('1. Add CallButton component to your UI (e.g., in chat or profile)');
    console.log('2. Test with two devices/users');
    console.log('3. (Optional) Set up token server for production');

  } catch (error) {
    console.error('\n❌ Verification failed:', error.message);
    console.error('\nPlease check:');
    console.error('1. Appwrite credentials in lib/appwrite.js');
    console.error('2. Collection ID is correct');
    console.error('3. You have proper permissions');
  }
}

// Run verification
verifyCallSetup();
