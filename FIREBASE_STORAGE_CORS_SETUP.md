# Firebase Storage — CORS Setup for Canvas Image Rendering

## Why this is needed

When a browser loads an image from a different domain (cross-origin) **and** that image
is drawn onto an HTML `<canvas>` element, the browser requires the image server to
explicitly allow cross-origin access via CORS headers.

Without CORS headers the browser either:
- blocks the image entirely (if `crossOrigin="anonymous"` is set on the `<img>`), or
- taints the canvas (making `toDataURL`, `getImageData`, and `stamp()` throw a `SecurityError`)

Firebase Storage does **not** send CORS headers by default. This must be configured
once per bucket using the `gsutil` command-line tool.

---

## Ready-to-use `cors.json`

A `cors.json` file is already included in this repository. Its contents:

```json
[
  {
    "origin": ["https://talr0704.github.io"],
    "method": ["GET", "HEAD"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
```

If you deploy to a different domain, add its origin to the `"origin"` array.

---

## Command to apply CORS

```bash
gsutil cors set cors.json gs://YOUR_BUCKET_NAME
```

Replace `YOUR_BUCKET_NAME` with your actual bucket name.  
For this project the bucket is **`codekids-8a2ab.firebasestorage.app`**:

```bash
gsutil cors set cors.json gs://codekids-8a2ab.firebasestorage.app
```

> **Prerequisite:** `gsutil` must be installed and authenticated.
> Install via [Google Cloud SDK](https://cloud.google.com/sdk/docs/install), then run:
> ```bash
> gcloud auth login
> ```

---

## How to verify it worked

```bash
gsutil cors get gs://codekids-8a2ab.firebasestorage.app
```

You should see your `cors.json` config echoed back.

You can also test via `curl`:

```bash
curl -I -H "Origin: https://talr0704.github.io" \
  "https://firebasestorage.googleapis.com/v0/b/codekids-8a2ab.firebasestorage.app/o/SOME_FILE_PATH?alt=media"
```

A successful response includes:
```
access-control-allow-origin: https://talr0704.github.io
```

---

## Cost note

Setting CORS rules is **free** and has no direct cost.  
Firebase Storage usage (storage space, download bandwidth) may incur costs if you
exceed the [Spark plan free tier](https://firebase.google.com/pricing):
- 5 GB storage
- 1 GB/day download

For a small project with 1 MB image uploads, you are unlikely to hit these limits.

---

## What happens without CORS configured

- `img.crossOrigin = 'anonymous'` is set in `turtle-engine.js`
- Without the CORS header the browser blocks the image load
- The turtle engine catches this via `img.onerror` and falls back to the built-in `classic` shape
- No crash — the turtle remains visible, just with the default arrow shape instead of the custom image
