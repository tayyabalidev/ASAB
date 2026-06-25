# Password recovery redirect (Appwrite Function)

Appwrite **rejects** `com.bilal.asab://...` in `createRecovery`. This function is the required HTTPS bridge.

## Deploy in Appwrite Console

1. **Functions** → **Create function** → name: `password-recovery-redirect`
2. Runtime: **Node.js 18** (or latest)
3. Paste `index.js` (or connect Git / upload)
4. **Settings** → **Execute access**: **Any** (public — email links have no JWT)
5. **Deploy** the function
6. Copy the **HTTPS domain**, e.g. `https://67abc123.appwrite.global`

## Register Web platform (required)

1. **Integrations** → **Platforms** → **Add platform** → **Web app**
2. **Hostname**: only the host from the function URL, e.g. `67abc123.appwrite.global`
   - No `https://`
   - No path

## Configure the mobile app

Add to **EAS Secrets** (production + preview):

```
EXPO_PUBLIC_PASSWORD_RECOVERY_REDIRECT_URL=https://67abc123.appwrite.global
```

Rebuild the app after setting the secret.

## Test

1. Open `https://67abc123.appwrite.global?userId=test&secret=test` in mobile Safari/Chrome
2. You should be prompted to open **ASAB** (deep link: `com.bilal.asab://reset-password?...`)
