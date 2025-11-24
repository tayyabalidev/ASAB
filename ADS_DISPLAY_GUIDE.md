# Advertisement Display Guide (Ads Kahan Aur Kaise Show Hote Hain)

## 📍 Ads Kahan Show Hote Hain

### 1. **Home Page Feed (Main Feed)**
- **Location:** `app/(tabs)/home.jsx`
- **Kaise:** Home page par videos/photos ke beech mein ads show hote hain
- **Frequency:** Har **5 posts** ke baad ek ad show hota hai
- **Example:**
  ```
  Post 1 (Video)
  Post 2 (Photo)
  Post 3 (Video)
  Post 4 (Photo)
  Post 5 (Video)
  🎯 ADVERTISEMENT (Ad yahan show hoga)
  Post 6 (Video)
  Post 7 (Photo)
  ...
  Post 10 (Video)
  🎯 ADVERTISEMENT (Phir se ad)
  ```

### 2. **Display Format**
- Ads full screen height par show hote hain (same as videos)
- User scroll karega to ad dikhega
- Ad card mein:
  - **"Ad" badge** (top right corner)
  - **Advertisement image** (if available)
  - **Title**
  - **Description**
  - **"Learn more →" link** (if URL provided)

## 🎨 Ads Kaise Show Hote Hain

### Visual Structure:
```
┌─────────────────────────────────┐
│                    [Ad Badge]   │
│                                 │
│      Advertisement Image        │
│      (200px height)             │
│                                 │
│  ┌───────────────────────────┐  │
│  │ Advertisement Title       │  │
│  │ Description text here...  │  │
│  │ Learn more →              │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

### Code Implementation:

#### 1. **Home Page Integration** (`app/(tabs)/home.jsx`)

```javascript
// Ads har 5 posts ke baad insert hote hain
const adInterval = 5;

// Posts array mein ads mix hote hain
displayPostsWithAds = [
  post1,
  post2,
  post3,
  post4,
  post5,
  advertisement, // ← Ad yahan
  post6,
  ...
]
```

#### 2. **Advertisement Card Component** (`components/AdvertisementCard.jsx`)

- **Automatic View Tracking:** Jab ad screen par aata hai, automatically view count increment hota hai
- **Click Tracking:** User ad par click kare to click count increment hota hai
- **Link Opening:** Agar ad mein URL hai, to click par browser open hota hai

## ⚙️ Configuration Options

### Ad Frequency Change Karne Ke Liye:

**File:** `app/(tabs)/home.jsx` (Line ~1079)

```javascript
const adInterval = 5; // Change this number
```

**Examples:**
- `adInterval = 3` → Har 3 posts ke baad ad
- `adInterval = 10` → Har 10 posts ke baad ad
- `adInterval = 1` → Har post ke baad ad (not recommended)

### Ad Display Style Change Karne Ke Liye:

**File:** `components/AdvertisementCard.jsx`

Yahan aap modify kar sakte hain:
- Image height
- Card design
- Colors
- Layout

## 📊 Tracking Features

### Automatic Tracking:
1. **View Count:** Jab ad screen par visible hota hai, view count automatically increment hota hai
2. **Click Count:** User ad par click kare to click count increment hota hai

### Where to See Statistics:
- Advertisers apne profile se "Advertisements" page par jaa kar dekh sakte hain
- Har ad ke neeche views aur clicks count dikhta hai

## 🔄 Ad Rotation

- Agar multiple active ads hain, to wo rotate hote hain
- Example: Agar 3 ads hain:
  - 5th post ke baad → Ad 1
  - 10th post ke baad → Ad 2
  - 15th post ke baad → Ad 3
  - 20th post ke baad → Ad 1 (phir se start)

## ✅ Active Ads Only

- Sirf **active** ads show hote hain
- **Expired** ads automatically hide ho jate hain
- Ads jo apni end date cross kar chuke hain, wo show nahi hote

## 🎯 Current Implementation Summary

| Feature | Status | Location |
|---------|--------|----------|
| Home Feed Ads | ✅ Active | `app/(tabs)/home.jsx` |
| Ad Component | ✅ Active | `components/AdvertisementCard.jsx` |
| View Tracking | ✅ Active | Automatic on view |
| Click Tracking | ✅ Active | On user click |
| Ad Rotation | ✅ Active | Multiple ads rotate |
| Expired Ads Filter | ✅ Active | Only active ads show |

## 📝 Notes

1. **Ads sirf active hote hain jo:**
   - `isActive = true` hai
   - `endDate` abhi tak nahi aayi hai

2. **Ads automatically hide ho jate hain:**
   - Subscription plan ki end date ke baad
   - Agar manually `isActive = false` kar diya ho

3. **Ad frequency change karne ke liye:**
   - `home.jsx` mein `adInterval` value change karein

4. **Ad design customize karne ke liye:**
   - `components/AdvertisementCard.jsx` edit karein

