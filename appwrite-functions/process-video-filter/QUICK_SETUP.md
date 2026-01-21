# Quick Setup Guide - Environment Variables

## 🎯 Kya Karna Hai?

Appwrite Function ko 4 environment variables add karne hain. Ye function ko batayenge ki:
- Kaunsa Appwrite server use karna hai
- Kaunsa project use karna hai  
- Kahan videos store karne hain
- Security key kya hai

## 📍 Kahan Add Karein?

1. **Appwrite Dashboard** → https://cloud.appwrite.io
2. **Functions** (left sidebar)
3. **process-video-filter** function click karein
4. **Settings** tab (ya **Variables** section)
5. **Environment Variables** / **Variables** section

## ✅ Variables List (Copy-Paste Ready)

### Variable 1: APPWRITE_ENDPOINT
```
Key: APPWRITE_ENDPOINT
Value: https://nyc.cloud.appwrite.io/v1
```

### Variable 2: APPWRITE_PROJECT_ID
```
Key: APPWRITE_PROJECT_ID
Value: 6854922e0036a1e8dee6
```

### Variable 3: APPWRITE_STORAGE_ID
```
Key: APPWRITE_STORAGE_ID
Value: 6854976e000db585d780
```

### Variable 4: APPWRITE_API_KEY (Important!)

**Pehle API Key generate karein:**
1. **Settings** → **API Keys** (left sidebar)
2. **Create API Key** click karein
3. **Name:** `Video Processing Function`
4. **Scopes:** Select karein:
   - ✅ `files.read`
   - ✅ `files.write`
   - ✅ `files.delete` (optional)
5. **Create** click karein
6. **API Key copy karein** (ye sirf ek baar dikhayi degi!)

**Phir variable add karein:**
```
Key: APPWRITE_API_KEY
Value: [jo API key copy ki thi, yahan paste karein]
```

## ⚠️ Important Notes

- ✅ Sabhi 4 variables **required** hain
- ✅ API Key ko **secret** rakhein
- ✅ Values exactly same honi chahiye (no spaces)
- ✅ Function deploy karne se pehle sab variables add kar lein

## 🔍 Verification

Variables add karne ke baad:
1. Function ke **Settings** mein check karein ki sab 4 variables dikh rahi hain
2. Values correct hain ya nahi verify karein
3. Function **Deploy** karein

## ❓ Problem?

Agar variables add karne mein problem ho:
- **Settings** tab check karein
- **Variables** section check karein  
- **Environment** section check karein
- Appwrite version ke according UI thoda different ho sakta hai

---

**Next Step:** FFmpeg installation (Step 4 in main README)
