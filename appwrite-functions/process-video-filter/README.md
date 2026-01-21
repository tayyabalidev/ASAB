# Appwrite Function: Process Video Filter

Ye Appwrite Function video processing ke liye use hoti hai. FFmpeg use karke videos par filters apply karti hai.

## Setup Instructions

### 1. Appwrite Dashboard Mein Function Create Karein

1. Appwrite Console mein jao: https://cloud.appwrite.io
2. Apne project mein jao
3. **Functions** section mein jao
4. **Create Function** click karein
5. Function details:
   - **Name:** `process-video-filter`
   - **Runtime:** Node.js 18.0 or higher
   - **Timeout:** 300 seconds (video processing ke liye)

### 2. Code Upload Karein

1. `index.js` file ko Appwrite Function mein upload karein
2. `package.json` file ko bhi upload karein (dependencies ke liye)

### 3. Environment Variables Set Karein

**Kya hain Environment Variables?**
Environment variables wo settings hain jo function ko batati hain ki:
- Appwrite server ka address kya hai
- Kaunsa project use karna hai
- Storage bucket ka ID kya hai
- API key kya hai (security ke liye)

**Kahan Add Karein (Step-by-Step):**

1. **Appwrite Dashboard mein jao:**
   - https://cloud.appwrite.io pe login karein
   - Apne project ko select karein

2. **Function ke Settings mein jao:**
   - Left sidebar se **Functions** click karein
   - Apni function `process-video-filter` ko click karein
   - Function page pe **Settings** tab click karein (ya **Variables** section)

3. **Environment Variables Add Karein:**
   - **Variables** ya **Environment Variables** section mein jao
   - **Add Variable** ya **+** button click karein
   - Har variable ko individually add karein:

   **Variable 1:**
   - **Key:** `APPWRITE_ENDPOINT`
   - **Value:** `https://nyc.cloud.appwrite.io/v1`
   - **Save** click karein

   **Variable 2:**
   - **Key:** `APPWRITE_PROJECT_ID`
   - **Value:** `6854922e0036a1e8dee6`
   - **Save** click karein

   **Variable 3:**
   - **Key:** `APPWRITE_STORAGE_ID`
   - **Value:** `6854976e000db585d780`
   - **Save** click karein

   **Variable 4: API Key (Important!):**
   - Left sidebar se **Settings** → **API Keys** pe jao
   - **Create API Key** click karein
   - **Name:** `Video Processing Function Key` (ya koi bhi name)
   - **Scopes:** Select karein:
     - ✅ `files.read` (files read karne ke liye)
     - ✅ `files.write` (files write karne ke liye)
     - ✅ `files.delete` (files delete karne ke liye - optional)
   - **Create** click karein
   - **Important:** API Key copy karein (ye sirf ek baar dikhayi degi!)
   - Ab function ke **Variables** section mein:
     - **Key:** `APPWRITE_API_KEY`
     - **Value:** (jo API key copy ki thi, paste karein)
     - **Save** click karein

**Note:** Agar Appwrite Dashboard mein exact navigation different hai, to:
- Function page pe **Settings** tab dekho
- Ya **Configuration** section dekho
- Ya **Environment** section dekho
- Har Appwrite version mein thoda different ho sakta hai, lekin concept same hai

**Environment Variables Ka Kaam:**

| Variable Name | Value | Kaam Kya Hai |
|--------------|-------|--------------|
| `APPWRITE_ENDPOINT` | `https://nyc.cloud.appwrite.io/v1` | Appwrite server ka address - function ko pata chalta hai ki kahan connect karna hai |
| `APPWRITE_PROJECT_ID` | `6854922e0036a1e8dee6` | Aapke project ka unique ID - function ko pata chalta hai ki kaunsa project use karna hai |
| `APPWRITE_STORAGE_ID` | `6854976e000db585d780` | Storage bucket ka ID - jahan videos store honge |
| `APPWRITE_API_KEY` | (Generated key) | Security key - function ko permission deti hai ki wo files access kar sake |

**Important Notes:**
- ✅ Sabhi variables **required** hain - function kaam nahi karega agar koi bhi missing hai
- ✅ API Key ko **secret** rakhein - kisi ko share mat karein
- ✅ Agar values different hain (different project), to apne values use karein

**Agar Values Different Hain:**
- Agar aapka project ID different hai, to `lib/appwrite.js` file mein check karein
- `appwriteConfig.projectId` se project ID mil jayega
- `appwriteConfig.storageId` se storage ID mil jayega
- `appwriteConfig.endpoint` se endpoint mil jayega

### 4. FFmpeg Installation

**Important:** Appwrite Functions mein system packages install karne ka direct way nahi hai. Try these options:

**Option 1: Check if FFmpeg is Pre-installed (Recommended)**
1. Build command ko simple rakhein: `npm install`
2. Function deploy karein
3. Test karein - shayad FFmpeg already available hai

**Option 2: Use Custom Docker Image (If Supported)**
Agar Appwrite Functions custom Docker images support karti hai:
- Dockerfile banayein with FFmpeg pre-installed
- Function settings mein Docker image specify karein

**Option 3: Use Alternative Approach**
Agar FFmpeg available nahi hai, to:
- Separate server use karein (already working hai)
- Ya cloud video processing service use karein

**Note:** Pehle Option 1 try karein - build command mein sirf `npm install` rakhein aur test karein.

### 5. Deploy Function

1. Function ko **Deploy** karein
2. Function ID note karein (ye client-side code mein use hogi)

## Supported Features

- ✅ Video filters (vintage, blackwhite, sepia, etc.)
- ✅ Filter intensity (0-100)
- ✅ Video speed adjustment
- ✅ Video trimming
- ✅ Music mixing (optional)
- ✅ Music volume control

## Usage

Client-side se function call karein:

```javascript
import { processVideoWithAppwrite } from './lib/videoProcessor';

const result = await processVideoWithAppwrite({
  video: { uri: '...', name: 'video.mp4', type: 'video/mp4' },
  filter: 'vintage',
  filterIntensity: 80,
  videoSpeed: 1.0,
  trim: { start: 0, end: 10 },
  music: { uri: '...', name: 'music.mp3', type: 'audio/mpeg' },
  musicVolume: 0.5
});
```

## Available Filters

- `none` - No filter
- `vintage` - Vintage effect
- `blackwhite` - Black and white
- `sepia` - Sepia tone
- `cool` - Cool tone
- `warm` - Warm tone
- `contrast` - High contrast
- `bright` - Bright effect
- `dramatic` - Dramatic effect
- `portrait` - Portrait mode
- `cinema` - Cinema effect
- `noir` - Film noir
- `vivid` - Vivid colors
- `fade` - Fade effect
- `chrome` - Chrome effect
- Location filters: `wavy`, `paris`, `losangeles`, `oslo`, `tokyo`, `london`, `moscow`, `berlin`, `rome`, `madrid`, `amsterdam`

## Troubleshooting

### FFmpeg Not Found Error
- Ensure FFmpeg is installed in the function environment
- Check build commands in function settings

### Timeout Errors
- Increase function timeout (max 300 seconds for video processing)
- Consider processing smaller videos or using async execution

### Storage Errors
- Verify `APPWRITE_STORAGE_ID` is correct
- Check API key has storage permissions
- Ensure storage bucket exists and is accessible

## Notes

- Function automatically cleans up temporary files
- Processed videos are stored in Appwrite Storage
- Original uploaded files are optionally deleted after processing (configurable)
