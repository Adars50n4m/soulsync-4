# 🚀 Quick Start - FREE Cloudflare R2 (15 mins)

**100% FREE setup. No credit card needed!**

## Commands to Run (Copy-Paste)

### 1. Install Wrangler & Login
```bash
npm install -g wrangler
wrangler login
```
Browser opens → Click "Allow"

### 2. Enable R2 (Free Tier)
Go to: https://dash.cloudflare.com/
- Click **R2** in sidebar
- Click **Purchase R2 Plan**
- Select **Free** (no payment!)
- Click Confirm

### 3. Create Bucket & Deploy Worker
```bash
cd /Volumes/Work/soulsync-4/cloudflare-worker

# Create bucket (FREE)
wrangler r2 bucket create soulsync-media

# Install dependencies
npm install

# Set Supabase JWT secret
wrangler secret put SUPABASE_JWT_SECRET
# Paste from: Supabase Dashboard → Settings → API → JWT Secret

# Deploy Worker (FREE)
npm run deploy
```

**Save the Worker URL shown!** (e.g., `https://soulsync-upload-worker.abc123.workers.dev`)

### 4. Get R2 Public URL (FREE r2.dev)
Go to: https://dash.cloudflare.com/ → R2 → `soulsync-media`
- Click **Settings** tab
- Under **Public Access**, click **Allow Access**
- Click **Connect R2.dev subdomain**
- **Copy the URL** (e.g., `https://pub-xyz123.r2.dev`)

### 5. Set R2 Public Domain Secret
```bash
wrangler secret put R2_PUBLIC_DOMAIN
# Paste your r2.dev URL: https://pub-xyz123.r2.dev
```

### 6. Test Worker
```bash
# Replace with YOUR Worker URL
curl https://soulsync-upload-worker.YOUR-SUBDOMAIN.workers.dev/health
```

Should show: `{"status":"ok","timestamp":"..."}`

### 7. Configure Mobile App
Create `/Volumes/Work/soulsync-4/mobile/.env`:
```env
EXPO_PUBLIC_R2_WORKER_URL=https://soulsync-upload-worker.YOUR-SUBDOMAIN.workers.dev
EXPO_PUBLIC_R2_PUBLIC_URL=https://pub-XXXXXXXXXXXX.r2.dev
EXPO_PUBLIC_USE_R2=false
```

Replace `YOUR-SUBDOMAIN` and `XXXXXXXXXXXX` with your actual values!

### 8. Test in App
```bash
cd /Volumes/Work/soulsync-4/mobile
npx expo start -c
```

1. Open app
2. Edit `.env` → Set `EXPO_PUBLIC_USE_R2=true`
3. Restart app
4. Upload an avatar or status
5. Check console for: `✅ Upload successful`

### 9. Verify Upload
Go to: https://dash.cloudflare.com/ → R2 → `soulsync-media` → **Objects**

You should see your uploaded file! 🎉

## Done! 🎉

You're now using **FREE** Cloudflare R2 for media storage!

**FREE TIER LIMITS:**
- ✅ 10GB storage
- ✅ 1M writes/month
- ✅ 100k Worker requests/day
- ✅ Good for 1,000+ users!

## Next Steps

1. Enable 24h auto-delete for statuses (saves storage)
2. Monitor usage in Cloudflare Dashboard
3. Gradually roll out to all users

## Need Help?

📖 Full guide: [FREE_TIER_SETUP.md](FREE_TIER_SETUP.md)
📖 Detailed docs: [CLOUDFLARE_R2_SETUP.md](CLOUDFLARE_R2_SETUP.md)

---

**Total Cost: $0.00 Forever!** 💰
