# Mux direct upload (Appwrite Function)

## 405 Method Not Allowed on `createExecution`

Appwrite often sends **`post`** (lowercase). Compare with `String(req.method).toUpperCase() === "POST"` (see `index.js` in this folder). Redeploy after pulling changes.

## `TypeError: ... reading 'status'` at `main.js:59`

That happens when Express-style code is deployed to Appwrite:

```js
// WRONG on Appwrite — `res.status` does not exist
res.status(500).json({ error: '...' });
```

Use the Appwrite response API (see `index.js` in this folder):

```js
return res.json({ error: '...' }, 500, cors);
```

## Deploy

1. Create a new function in Appwrite (e.g. `mux-direct-upload`), Node 18+.
2. Set **entrypoint** to `index.js` (or copy this file to your repo’s `main.js` and fix all `res.status` usages).
3. Add **variables**: `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `APPWRITE_DATABASE_ID`, `APPWRITE_VIDEO_COLLECTION_ID`.
4. **Scopes**: grant the function **databases.read** and **databases.write** (so `x-appwrite-key` can patch the video document).
5. Connect Git or upload this folder; build command: `npm install`.

## App `.env`

`EXPO_PUBLIC_MUX_DIRECT_UPLOAD_FUNCTION_ID=<this function’s id>`

Use this function’s id — **not** `muxWebhookHandler`.
