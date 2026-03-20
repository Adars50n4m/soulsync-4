# Setup with Your Existing R2 Bucket ✅

You already have an R2 bucket! Let's use it. 🎉

## Your Existing Bucket

- **Bucket Name:** `Soul`
- **Internal URL:** `https://89f30de5dacc7b409e4abdae5f99a3a6.r2.cloudflarestorage.com/Soul`

## Quick Setup (10 mins)

### Step 1: Get Public URL (FREE r2.dev)

1. Go to https://dash.cloudflare.com/ → **R2**
2. Click on `Soul` bucket
3. Go to **Settings** tab
4. Under **Public Access**, click **Allow Access**
5. Click **Connect R2.dev subdomain** (FREE!)
6. Copy the URL shown (e.g., `https://pub-abc123.r2.dev`)

### Step 2: Deploy Worker

```bash
cd /Volumes/Work/Soul-4/cloudflare-worker

# Install
npm install

# Set Supabase JWT secret
wrangler secret put SUPABASE_JWT_SECRET
# Get from: Supabase Dashboard → Settings → API → JWT Secret

# Set R2 public URL
wrangler secret put R2_PUBLIC_DOMAIN
# Paste: https://pub-abc123.r2.dev (from Step 1)

# Deploy (FREE!)
npm run deploy
```

Save the Worker URL! (e.g., `https://Soul-upload-worker.xyz.workers.dev`)

### Step 3: Configure Mobile App

Create `/Volumes/Work/Soul-4/mobile/.env`:

```env
EXPO_PUBLIC_R2_WORKER_URL=https://Soul-upload-worker.YOUR-SUBDOMAIN.workers.dev
EXPO_PUBLIC_R2_PUBLIC_URL=https://pub-XXXXXXXXXXXX.r2.dev
EXPO_PUBLIC_USE_R2=false
```

Replace with your actual URLs from Steps 1 & 2!

### Step 4: Test

```bash
# Test Worker
curl https://Soul-upload-worker.YOUR-SUBDOMAIN.workers.dev/health

# Test mobile app
cd /Volumes/Work/Soul-4/mobile
npx expo start -c
```

1. Edit `.env` → `EXPO_PUBLIC_USE_R2=true`
2. Restart app
3. Upload avatar/status
4. Check for: `✅ Upload successful`

### Step 5: Verify

Dashboard → R2 → `Soul` → Objects

You should see:
```
avatars/{userId}/{timestamp}.jpg
status-media/{userId}/{timestamp}.mp4
```

## Done! 🎉

Your existing `Soul` bucket is now integrated!

**Important:** The wrangler.toml has been updated to use `bucket_name = "Soul"` ✅

## FREE Tier Limits

- ✅ 10GB storage
- ✅ 1M writes/month
- ✅ 100k Worker requests/day
- ✅ Good for 1,000+ users!

## Next: Enable Auto-Delete

Save storage by auto-deleting old statuses:

1. R2 → `Soul` → Settings → Lifecycle Rules
2. Add Rule:
   - Prefix: `status-media/`
   - Delete after: 1 day
3. Save

This keeps storage usage low! 📉
