# Deployment Checklist - Step by Step

## ✅ Step 1: Environment Variables (DONE!)
- [x] `APPWRITE_ENDPOINT` added
- [x] `APPWRITE_PROJECT_ID` added  
- [x] `APPWRITE_STORAGE_ID` added
- [x] `APPWRITE_API_KEY` added

**Next:** Verify values are correct (click `...` to view/edit)

---

## 🔧 Step 2: Build Command (IMPORTANT FIX!)

**Problem:** `apt-get` Appwrite Functions mein available nahi hai.

**Solution:** Build command ko simple rakhein:

```bash
npm install
```

**Why?** 
- Appwrite Functions mein system packages install karne ka direct way nahi hai
- Pehle check karein ki FFmpeg pre-installed hai ya nahi
- Agar nahi hai, to separate server use karein (already working hai)

**How:**
1. Build command field mein jao
2. Sirf `npm install` rakhein (ya kuch bhi nahi - default `npm install` chalega)
3. **Update** button click karein
4. Deploy karein aur test karein

**Agar FFmpeg Error Aaye:**
- Appwrite Functions mein FFmpeg support limited hai
- Separate server approach use karein (already setup hai)
- Ya cloud video processing service consider karein

---

## 📁 Step 3: Upload Function Code

**Option A: Upload Files**
1. Function page pe **Deployments** tab click karein
2. **Create Deployment** ya **Deploy** button click karein
3. Files upload karein:
   - `index.js` (from `appwrite-functions/process-video-filter/index.js`)
   - `package.json` (from `appwrite-functions/process-video-filter/package.json`)

**Option B: Use Editor**
1. Function page pe **Code** tab click karein
2. `index.js` file ka content paste karein
3. `package.json` file ka content paste karein

---

## 🚀 Step 4: Deploy Function

1. **Deployments** tab mein jao
2. **Create Deployment** click karein
3. Wait karein build complete hone tak (2-5 minutes)
4. Build successful hone ke baad:
   - Function **ID** note karein (ye client-side code mein use hogi)
   - Function **Status** check karein (should be "Active")

---

## 🧪 Step 5: Test Function

**Option A: Dashboard se Test**
1. Function page pe **Test** tab click karein
2. Test payload:
```json
{
  "videoFileId": "test-video-file-id",
  "filter": "vintage",
  "filterIntensity": 80,
  "videoSpeed": 1.0
}
```
3. **Execute** click karein

**Option B: Client-side se Test**
1. `.env` file mein add karein:
```
EXPO_PUBLIC_USE_APPWRITE_FUNCTIONS=true
EXPO_PUBLIC_APPWRITE_FUNCTION_ID=process-video-filter
```
2. App mein test karein:
```javascript
import { processVideoWithAppwrite } from './lib/videoProcessor';

const result = await processVideoWithAppwrite({
  video: { uri: '...', name: 'test.mp4', type: 'video/mp4' },
  filter: 'vintage',
  filterIntensity: 80
});
```

---

## ⚠️ Common Issues

### Build Fails
- Check build command is correct
- Verify `package.json` has all dependencies
- Check function logs for errors

### FFmpeg Not Found
- Verify build command includes `apt-get install -y ffmpeg`
- Re-deploy function after fixing build command

### Function Timeout
- Increase timeout to 300 seconds in function settings
- Process smaller videos for testing

### Storage Errors
- Verify `APPWRITE_STORAGE_ID` is correct
- Check API key has storage permissions
- Ensure storage bucket exists

---

## ✅ Success Indicators

- [ ] Build completed successfully
- [ ] Function status is "Active"
- [ ] Test execution returns success
- [ ] Processed video is saved in Appwrite Storage

---

**Next:** Once deployed, update client-side code to use the function!
