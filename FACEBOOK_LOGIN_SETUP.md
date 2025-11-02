# Facebook Login Setup Guide

This guide will help you configure Facebook login for your ASAB app.

## Prerequisites

- A Facebook Developer account
- Your app already has the Facebook SDK installed (`react-native-fbsdk-next`)

## Step 1: Create a Facebook App
<!-- https://nyc.cloud.appwrite.io/v1/account/sessions/oauth2/callback/facebook/6854922e0036a1e8dee6 -->
1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Click "Create App" and select "Consumer" or "Other"
3. Fill in your app details:
   - **App Name**: ASAB
   - **App Contact Email**: Your email
   - **App Purpose**: Select appropriate purpose

## Step 2: Configure Facebook App Settings

### Basic Settings
1. In your Facebook App dashboard, go to "Settings" > "Basic"
2. Note down your **App ID** and **App Secret**
3. Add your app domains and contact email

### Add Platforms
1. Click "Add Platform" and select your platforms:

#### For iOS:
- **Bundle ID**: `com.anonymous.sora` (from your app.json)
- **iPhone Store ID**: (optional, for App Store)

#### For Android:
- **Package Name**: `com.anonymous.sora` (from your app.json)
- **Class Name**: `com.anonymous.sora.MainActivity`
- **Key Hashes**: You'll need to generate these (see below)

### Generate Android Key Hashes

Run these commands in your project directory:

```bash
# For debug keystore
keytool -exportcert -alias androiddebugkey -keystore ~/.android/debug.keystore | openssl sha1 -binary | openssl base64

# For release keystore (when you have one)
keytool -exportcert -alias your-key-alias -keystore your-release-key.keystore | openssl sha1 -binary | openssl base64
```

Add the generated key hashes to your Facebook App's Android settings.

## Step 3: Configure OAuth Redirect URIs

1. Go to "Facebook Login" > "Settings"
2. Add these Valid OAuth Redirect URIs:
   ```
   https://nyc.cloud.appwrite.io/v1/account/sessions/oauth2/callback/facebook
   ```

## Step 4: Update Your App Configuration

### Update app.json
Replace the placeholder values in your `app.json`:

```json
{
  "expo": {
    "facebookAppId": "YOUR_ACTUAL_FACEBOOK_APP_ID",
    "facebookDisplayName": "ASAB",
    "ios": {
      "infoPlist": {
        "CFBundleURLTypes": [
          {
            "CFBundleURLName": "facebook",
            "CFBundleURLSchemes": ["fbYOUR_ACTUAL_FACEBOOK_APP_ID"]
          }
        ]
      }
    },
    "plugins": [
      [
        "react-native-fbsdk-next",
        {
          "appID": "YOUR_ACTUAL_FACEBOOK_APP_ID",
          "clientToken": "YOUR_ACTUAL_CLIENT_TOKEN",
          "displayName": "ASAB"
        }
      ]
    ]
  }
}
```

### Update lib/facebook.js
Replace the placeholder values:

```javascript
export const facebookConfig = {
  appId: 'YOUR_ACTUAL_FACEBOOK_APP_ID',
  clientToken: 'YOUR_ACTUAL_CLIENT_TOKEN',
};
```

## Step 5: Configure Appwrite for Facebook OAuth

1. Go to your Appwrite Console
2. Navigate to your project settings
3. Go to "Auth" > "Providers"
4. Enable "Facebook" provider
5. Add your Facebook App ID and App Secret
6. Set the redirect URL to: `https://nyc.cloud.appwrite.io/v1/account/sessions/oauth2/callback/facebook`

## Step 6: Test Facebook Login

1. Build and run your app
2. Try the Facebook login button
3. Check the console for any errors
4. Verify that users are created in your Appwrite database

## Troubleshooting

### Common Issues:

1. **"Invalid Key Hash" Error**:
   - Make sure you've added the correct key hashes to Facebook App settings
   - Generate key hashes for both debug and release keystores

2. **"App Not Setup" Error**:
   - Ensure your Facebook App is in "Live" mode or add test users
   - Check that all required settings are configured

3. **"Redirect URI Mismatch"**:
   - Verify the OAuth redirect URI in Facebook App settings matches Appwrite's callback URL

4. **"Invalid App ID"**:
   - Double-check your Facebook App ID in all configuration files
   - Ensure the App ID is correct in app.json, facebook.js, and Appwrite settings

### Testing Tips:

- Use Facebook's "Test Users" feature to test without affecting real users
- Check Facebook App's "App Review" status
- Monitor Facebook App's "Analytics" for login attempts

## Security Notes

- Never commit your Facebook App Secret to version control
- Use environment variables for sensitive configuration
- Regularly rotate your App Secret
- Monitor your Facebook App for suspicious activity

## Next Steps

After successful setup:
1. Submit your Facebook App for review if you plan to go live
2. Add additional Facebook permissions if needed (e.g., user_friends, user_location)
3. Implement Facebook logout functionality
4. Add error handling for various Facebook login scenarios

## Support

If you encounter issues:
1. Check Facebook Developer documentation
2. Review Appwrite OAuth documentation
3. Check React Native FBSDK Next documentation
4. Look at the console logs for specific error messages
