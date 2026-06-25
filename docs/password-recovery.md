# Password Recovery (Forgot Password) — Setup & Testing

## Why you saw "Invalid URI" / register client (auth)

Appwrite **`createRecovery` does not accept** custom app URLs like:

```
com.bilal.asab://auth/reset-password   ❌ rejected
```

It only accepts **`https://`** URLs whose **hostname** is registered as a **Web platform** in **Integrations → Platforms**.

The error mentioning **(auth)** happens because Appwrite parses `com.bilal.asab://auth/reset-password` and treats `auth` as the hostname.

**Fix:** use an **HTTPS Appwrite Function** that redirects to the app deep link `com.bilal.asab://reset-password?userId=...&secret=...`

---

## Setup checklist

### 1. Enable email/password

**Auth** → **Settings** → enable **Email/Password**.

### 2. SMTP (optional on Cloud)

**Settings** (gear) → **SMTP** — leave **Custom SMTP OFF** on Appwrite Cloud unless you need your own mail server.

### 3. Deploy the redirect function

Code: [`appwrite-functions/password-recovery-redirect/`](../appwrite-functions/password-recovery-redirect/)

1. **Functions** → **Create function** → `password-recovery-redirect`
2. Runtime: Node 18+
3. Paste `index.js` → **Deploy**
4. **Execute access**: **Any** (public GET for email links)
5. Copy HTTPS URL, e.g. `https://67abc123.appwrite.global`

### 4. Add Web platform (required)

**Integrations** → **Platforms** → **Add platform** → **Web app**

| Field | Example |
|-------|---------|
| Hostname | `67abc123.appwrite.global` |

No `https://`, no path — hostname only.

### 5. Mobile platforms (already needed for the app)

| Platform | Identifier |
|----------|------------|
| Apple app | `com.bilal.asab` |
| Android app | `com.bilal.asab` |

### 6. EAS environment variable

```bash
eas secret:create --scope project --name EXPO_PUBLIC_PASSWORD_RECOVERY_REDIRECT_URL --value https://67abc123.appwrite.global
```

Rebuild iOS/Android after setting this.

---

## How the flow works

```
App: Forgot Password → createRecovery(email, "https://67abc....appwrite.global")
        ↓
Email link → Appwrite → HTTPS function ?userId=&secret=
        ↓
Function HTML redirect → com.bilal.asab://reset-password?userId=&secret=
        ↓
App: Reset Password screen → updateRecovery → Sign In
```

---

## URLs reference

| Purpose | URL |
|---------|-----|
| Passed to `createRecovery` | `https://YOUR_FUNCTION.appwrite.global` |
| Opens in app after email | `com.bilal.asab://reset-password?userId=...&secret=...` |

Configured in:
- `lib/passwordRecovery.js` — reads `EXPO_PUBLIC_PASSWORD_RECOVERY_REDIRECT_URL`
- `appwrite-functions/password-recovery-redirect/index.js` — builds deep link

---

## Testing

1. Confirm EAS secret is set and app rebuilt
2. Sign In → **Forgot Password?** → enter email → **Send Reset Link** (should succeed, no Invalid URI)
3. Open email on same device → tap link → brief browser flash → **ASAB** opens on Reset Password
4. Set new password → Sign In

**Manual deep-link test:**

```bash
# iOS Simulator
xcrun simctl openurl booted "com.bilal.asab://reset-password?userId=test&secret=test"
```

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| Invalid URI / register (auth) | Use HTTPS function URL, not `com.bilal.asab://` in `createRecovery` |
| Redirect not allowed | Add function hostname as **Web** platform |
| Not configured on this build | Set `EXPO_PUBLIC_PASSWORD_RECOVERY_REDIRECT_URL` + rebuild |
| Email not received | Check spam; Auth user exists; SMTP if self-hosted |
| Link opens browser, not app | Rebuild native app; confirm `com.bilal.asab` platforms exist |
