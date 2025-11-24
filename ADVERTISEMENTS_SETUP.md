# Advertisements Collection Setup Guide

This guide will help you set up the Advertisements collection in Appwrite for the advertisement system.

## Collection Setup

### Step 1: Create the Collection

1. Go to your Appwrite Console
2. Navigate to **Databases** → Select your database
3. Click **Create Collection**
4. Name it: **Advertisements**
5. Copy the Collection ID and update it in `lib/appwrite.js`:
   ```javascript
   advertisementsCollectionId: "YOUR_COLLECTION_ID_HERE"
   ```

### Step 2: Add Attributes

Create the following attributes in the Advertisements collection:

| Attribute Name | Type | Size | Required | Array | Default |
|----------------|------|------|----------|-------|---------|
| title | String | 200 | Yes | No | - |
| description | String | 1000 | No | No | - |
| image | String | 500 | No | No | - |
| linkUrl | String | 500 | No | No | - |
| advertiserId | String | 100 | Yes | No | - |
| **⚠️ IMPORTANT:** Make sure the attribute name is exactly "advertiserId" (lowercase 'd'), NOT "advertiserID" (capital 'D'). Appwrite is case-sensitive! |
| advertiserName | String | 100 | No | No | - |
| subscriptionPlan | String | 20 | Yes | No | daily |
| startDate | String | 50 | Yes | No | - |
| endDate | String | 50 | Yes | No | - |
| isActive | Boolean | - | Yes | No | true |
| status | String | 20 | Yes | No | active |
| **Note:** Status can be: "active", "paused", or "expired" |
| clickCount | Integer | Min: 0 | Yes | No | 0 |
| viewCount | Integer | Min: 0 | Yes | No | 0 |
| targetAudience | String | 50 | No | No | all |

### Step 3: Create Indexes

Create the following indexes for better query performance:

1. **isActive_index**
   - Type: Key
   - Attributes: isActive
   - Order: ASC

2. **endDate_index**
   - Type: Key
   - Attributes: endDate
   - Order: ASC

3. **advertiserId_index**
   - Type: Key
   - Attributes: advertiserId
   - Order: DESC

4. **createdAt_index**
   - Type: Key
   - Attributes: $createdAt
   - Order: DESC

### Step 4: Set Permissions

**Step-by-Step Guide:**

1. **Go to your Advertisements collection in Appwrite Console**
2. **Click on "Settings" tab** (at the top)
3. **Scroll down to "Permissions" section**
4. **Enable "Document Security"** (toggle it ON if it's off)

**Now set these 4 permissions:**

#### 1. Read Access (Sab dekh sakte hain)
- Click **"Create Permission"** button under "Read Access"
- Dropdown se **"Role"** select karein
- Type karein: **"Any"** (exactly like this, capital A)
- Click **"Create"**
- ✅ Isse sabhi users (login ke bina bhi) ads dekh sakte hain

#### 2. Create Documents (Login users ads bana sakte hain)
- Click **"Create Permission"** button under "Create Documents"
- Dropdown se **"Role"** select karein
- Type karein: **"Users"** (exactly like this, capital U)
- Click **"Create"**
- ✅ Isse koi bhi logged-in user apna ad create kar sakta hai

#### 3. Update Documents (Login users apne ads update kar sakte hain)
- Click **"Create Permission"** button under "Update Documents"
- Dropdown se **"Role"** select karein
- Type karein: **"Users"** (exactly like this, capital U)
- Click **"Create"**
- ✅ **Important:** Appwrite me "own documents only" permission nahi hai
- ✅ **Lekin hamare code me check hai** - user sirf apne hi ads update kar sakta hai
- ✅ Code automatically check karta hai ki `ad.advertiserId === user.$id`
- ✅ Agar match nahi karta, to update nahi hoga

#### 4. Delete Documents (Login users apne ads delete kar sakte hain)
- Click **"Create Permission"** button under "Delete Documents"
- Dropdown se **"Role"** select karein
- Type karein: **"Users"** (exactly like this, capital U)
- Click **"Create"**
- ✅ **Important:** Same as Update - code me check hai
- ✅ User sirf apne hi ads delete kar sakta hai (code automatically verify karta hai)

**Summary (Jama Karo):**
- **Read:** "Any" → Sab dekh sakte hain
- **Create:** "Users" → Login users create kar sakte hain
- **Update:** "Users" → Login users update kar sakte hain (code sirf apne ads allow karega)
- **Delete:** "Users" → Login users delete kar sakte hain (code sirf apne ads allow karega)

**Security Note:**
- Update aur Delete ke liye Appwrite me built-in "own documents only" permission nahi hai
- Isliye hamare code (`app/(tabs)/advertisements.jsx`) me security check hai
- Code automatically verify karta hai ki user sirf apne hi ads edit/delete kar sakta hai
- Appwrite permission "Users" set karein - code security handle karega

## Subscription Plans

The system supports three subscription plans:

1. **Daily** - $10 per day
   - Advertisement runs for 1 day
   - End date is set to start date + 1 day

2. **Weekly** - $50 per week
   - Advertisement runs for 7 days
   - End date is set to start date + 7 days

3. **Monthly** - $150 per month
   - Advertisement runs for 30 days
   - End date is set to start date + 30 days

## Features

### For Advertisers:
- Create advertisements with images, titles, descriptions, and links
- Choose subscription plan (daily, weekly, monthly)
- View all their advertisements
- Edit existing advertisements
- Delete advertisements
- View statistics (views, clicks)

### For Users:
- See advertisements interspersed in their feed (every 5 posts)
- Click on advertisements to visit the linked URL
- View and click tracking is automatic

## Accessing the Advertisements Page

Users can access the advertisements management page by:
1. Going to their Profile page
2. Clicking the "Advertisements" button in the action buttons section

## Integration

Advertisements are automatically displayed:
- In the home feed (every 5 posts)
- With automatic view and click tracking
- Only active advertisements within their date range are shown

## Notes

- Make sure to update the `advertisementsCollectionId` in `lib/appwrite.js` with your actual collection ID
- The advertisement image is uploaded to the same storage bucket as other media
- Advertisements expire automatically based on their end date
- Only active advertisements that haven't expired are shown to users

