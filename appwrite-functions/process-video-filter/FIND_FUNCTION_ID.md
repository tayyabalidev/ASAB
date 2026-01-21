# Function ID Kahan Milta Hai? 🔍

## 📍 Method 1: Browser URL (Easiest!)

1. **Function page pe jao** (Settings tab pe ho)
2. **Browser ke address bar mein dekho**
3. URL mein function ID dikhega:

```
https://cloud.appwrite.io/console/project-xxx/functions/function-id-here
                                                      ^^^^^^^^^^^^^^^^
                                                      Ye Function ID hai!
```

**Example:**
```
https://cloud.appwrite.io/console/project-6854922e0036a1e8dee6/functions/6854abc123def456
                                                                        ^^^^^^^^^^^^^^^^
                                                                        Function ID
```

---

## 📍 Method 2: Settings Tab

1. **Settings tab pe jao** (jo abhi open hai)
2. **Page scroll karein** - Function ID usually neeche dikhta hai
3. Ya **Function Overview** section mein
4. Look for: **"Function ID"** ya **"ID"** label

**Note:** Kuch Appwrite versions mein ye directly visible nahi hota, to Method 1 use karein.

---

## 📍 Method 3: Deployments Tab

1. **Deployments** tab click karein
2. **Function ID** usually deployment details mein dikhta hai
3. Ya **API** section mein

---

## 📍 Method 4: Function Name se (If Same)

**Important:** Function ID aur Function Name **different** hain!

- **Function Name:** `process-video-filter` (ye aapne set kiya)
- **Function ID:** `6854xxxxx` (ye Appwrite automatically generate karta hai)

**Note:** Agar aapne function name `process-video-filter` rakha hai, to **Function ID different hoga**. Function name se ID nahi milta - actual ID use karein.

---

## ✅ Quick Check: Function ID Format

Function ID usually **24 characters** ka alphanumeric string hota hai:
- Format: `6854xxxxx1234567890abcd` (example)
- Always starts with numbers
- Contains letters and numbers

**Example IDs:**
- ✅ `6854922e0036a1e8dee6` (24 characters)
- ✅ `6854abc123def456789012` (24 characters)
- ❌ `process-video-filter` (ye name hai, ID nahi)
- ❌ `2121212121` (ye ID nahi lag raha - too short)

---

## 🎯 What to Do Next

1. **Function ID copy karein** (browser URL se - Method 1)
2. **`.env` file mein add karein:**
   ```
   EXPO_PUBLIC_USE_APPWRITE_FUNCTIONS=true
   EXPO_PUBLIC_APPWRITE_FUNCTION_ID=your-actual-function-id-here
   ```
3. **Function name ko ID se replace karein** (agar same use kiya ho)

---

## 💡 Pro Tip

**Browser URL se Function ID copy karna sabse easy hai!**

1. Address bar mein URL select karein
2. Function ID wala part copy karein (last part after `/functions/`)
3. `.env` file mein paste karein

**Example:**
- URL: `.../functions/6854abc123def456`
- Copy: `6854abc123def456`
- Paste in `.env`: `EXPO_PUBLIC_APPWRITE_FUNCTION_ID=6854abc123def456`

---

**Still can't find it?** Browser URL check karein - wahan definitely dikhega! 🎯
