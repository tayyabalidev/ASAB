#!/usr/bin/env node

/**
 * Automated Setup Script for Agora SDK
 * This script will help you set up Agora SDK with minimal effort
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting Agora SDK Setup...\n');

// Check if react-native-agora is installed
function checkAgoraInstalled() {
  try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    return packageJson.dependencies && packageJson.dependencies['react-native-agora'];
  } catch (error) {
    return false;
  }
}

// Run commands with error handling
function runCommand(command, description) {
  console.log(`\n📦 ${description}...`);
  try {
    execSync(command, { stdio: 'inherit' });
    console.log(`✅ ${description} completed successfully!`);
    return true;
  } catch (error) {
    console.error(`❌ Error: ${description} failed`);
    console.error(error.message);
    return false;
  }
}

// Main setup function
function setupAgora() {
  // Step 1: Check if Agora is installed
  if (!checkAgoraInstalled()) {
    console.log('⚠️  react-native-agora not found in package.json');
    console.log('Installing react-native-agora...');
    if (!runCommand('npm install react-native-agora', 'Installing react-native-agora')) {
      console.error('❌ Failed to install react-native-agora');
      process.exit(1);
    }
  } else {
    console.log('✅ react-native-agora is already installed');
  }

  // Step 2: Run prebuild
  console.log('\n🔧 Step 1: Generating native folders...');
  if (!runCommand('npx expo prebuild --clean', 'Running Expo prebuild')) {
    console.error('❌ Prebuild failed. Please check the errors above.');
    process.exit(1);
  }

  // Step 3: Install iOS pods (if ios folder exists)
  if (fs.existsSync('ios')) {
    console.log('\n🍎 Step 2: Installing iOS dependencies...');
    runCommand('cd ios && pod install && cd ..', 'Installing CocoaPods');
  } else {
    console.log('⚠️  iOS folder not found. Skipping pod install.');
  }

  // Step 4: Instructions
  console.log('\n✅ Setup completed!\n');
  console.log('📱 Next Steps:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('For Android:');
  console.log('  npm run android');
  console.log('');
  console.log('For iOS:');
  console.log('  npm run ios');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n⚠️  Important:');
  console.log('- This will take 5-10 minutes for the first build');
  console.log('- Make sure you have Xcode (iOS) or Android Studio (Android) installed');
  console.log('- You cannot use Expo Go - must use development build\n');
}

// Run setup
setupAgora();


