# FREE Cloudflare R2 Setup (No Credit Card!)

Complete guide to set up Cloudflare R2 using **only free tiers**. Zero cost! 💸

## Free Tier Limits

✅ **Cloudflare Workers** (100% FREE)
- 100,000 requests/day
- 10ms CPU time per request
- More than enough for your app!

✅ **Cloudflare R2** (FREE up to)
- 10 GB storage
- 1 million Class A operations/month (writes)
- 10 million Class B operations/month (reads)
- Unlimited egress (this alone saves $$!)

**Perfect for:** Up to 5,000 active users uploading 2MB files daily

## Quick Start (15 minutes)

### Step 1: Create Free Cloudflare Account

1. Go to https://dash.cloudflare.com/sign-up
2. Sign up with email (no credit card required!)
3. Verify email
4. Skip domain setup (not needed)

### Step 2: Enable R2 (Free)

1. In Cloudflare Dashboard, click **R2** in sidebar
2. Click **Purchase R2 Plan**
3. Select **Free** plan (no payment needed)
4. Confirm

### Step 3: Install Wrangler CLI

```bash
# Install globally
npm install -g wrangler

# Login to Cloudflare
wrangler login
```

Browser will open → Click "Allow" to authorize

### Step 4: Create R2 Bucket

```bash
cd /Volumes/Work/soulsync-4/cloudflare-worker

# Create bucket
wrangler r2 bucket create soulsync-media

# Verify it was created
wrangler r2 bucket list
```

Expected output:
```
✅ Created bucket 'soulsync-media'
```

### Step 5: Enable Public Access (FREE R2.dev domain)

**Option 1: Using Cloudflare Dashboard (Easier)**

1. Go to R2 → `soulsync-media` bucket
2. Click **Settings** tab
3. Under **Public Access**, click **Allow Access**
4. Click **Connect R2.dev subdomain**
5. Your public URL will be: `https://pub-XXXXXXXXXXXX.r2.dev`
6. **SAVE THIS URL!** You'll need it later

**Option 2: Using API**

Wrangler will automatically create a public URL when you upload files.

### Step 6: Deploy Worker (FREE)

```bash
cd /Volumes/Work/soulsync-4/cloudflare-worker

# Install dependencies
npm install

# Set secrets
wrangler secret put SUPABASE_JWT_SECRET
# Paste your Supabase JWT secret (from Supabase Dashboard → Settings → API)

wrangler secret put R2_PUBLIC_DOMAIN
# Enter your R2.dev URL: https://pub-XXXXXXXXXXXX.r2.dev

# Deploy to FREE tier
npm run deploy
```

Expected output:
```
✨ Successfully published your script
🌍 https://soulsync-upload-worker.YOUR-SUBDOMAIN.workers.dev
```

**SAVE THIS WORKER URL!**

### Step 7: Test Worker

```bash
# Replace with your actual Worker URL
curl https://soulsync-upload-worker.YOUR-SUBDOMAIN.workers.dev/health
```

Expected response:
```json
{"status":"ok","timestamp":"2024-02-14T..."}
```

✅ If you see this, Worker is deployed successfully!

### Step 8: Configure Mobile App

Create `/Volumes/Work/soulsync-4/mobile/.env`:

```env
# Replace with YOUR actual URLs from steps above!
EXPO_PUBLIC_R2_WORKER_URL=https://soulsync-upload-worker.YOUR-SUBDOMAIN.workers.dev
EXPO_PUBLIC_R2_PUBLIC_URL=https://pub-XXXXXXXXXXXX.r2.dev
EXPO_PUBLIC_USE_R2=false
```

**Important:** Start with `USE_R2=false` for testing!

### Step 9: Test Uploads

```bash
cd /Volumes/Work/soulsync-4/mobile

# Start app
npx expo start -c
```

1. Open app in simulator/device
2. Go to Profile → Edit Profile
3. Tap avatar to upload
4. Check console logs for:
   ```
   📤 Using Supabase Storage for upload
   ```

5. Now enable R2 in `.env`:
   ```env
   EXPO_PUBLIC_USE_R2=true
   ```

6. Restart app:
   ```bash
   npx expo start -c
   ```

7. Upload another avatar
8. Check logs for:
   ```
   📤 Using Cloudflare R2 for upload
   ✅ Upload successful: user123/1707912345.jpg (123456 bytes)
   ```

### Step 10: Verify in R2 Dashboard

1. Go to Cloudflare Dashboard → R2 → `soulsync-media`
2. Click **Browse** or **Objects**
3. You should see your uploaded file:
   ```
   avatars/
     user-id/
       1707912345.jpg
   ```

4. Click the file → Get public URL
5. Open URL in browser → Image should load! ✅

## Free Tier Monitoring

### Check Usage

**Dashboard:**
1. Cloudflare Dashboard → R2 → `soulsync-media`
2. View **Metrics** tab
3. See storage used, operations

**Workers:**
1. Cloudflare Dashboard → Workers & Pages
2. Click `soulsync-upload-worker`
3. View **Metrics** tab
4. See requests/day

### Usage Estimates (Free Tier Safe)

**100 users × 2 uploads/day:**
- Storage: ~1GB/month ✅ (10GB free)
- Writes: 6k/month ✅ (1M free)
- Requests: 6k/month ✅ (100k/day free)

**1,000 users × 2 uploads/day:**
- Storage: ~10GB/month ✅ (at limit)
- Writes: 60k/month ✅ (well within 1M)
- Requests: 60k/month ✅ (well within 100k/day)

**You're safe up to 1,000 active users on free tier!**

## Free Tier Limits & Solutions

### If You Hit Storage Limit (10GB)

**Solution 1: Enable 24h Auto-Delete**
```bash
# Status media auto-deletes after 24h
# This keeps storage low automatically!
```

1. R2 Dashboard → `soulsync-media` → Settings
2. Lifecycle Rules → Add Rule
3. Prefix: `status-media/`
4. Delete after: 1 day
5. Save

**Solution 2: Compress Images Client-Side**

Add to `R2StorageService.ts`:
```typescript
// Before upload, compress images
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

const compressed = await manipulateAsync(
  uri,
  [{ resize: { width: 1920 } }],
  { compress: 0.7, format: SaveFormat.JPEG }
);
```

This can reduce storage by 50-70%!

### If You Hit Request Limit (unlikely)

100k requests/day = very hard to hit with normal usage!

If you do:
1. Add caching in mobile app
2. Batch uploads
3. Use CDN for media delivery

## No Custom Domain? No Problem!

The free `r2.dev` subdomain works perfectly:
```
https://pub-abc123xyz.r2.dev/avatars/user/photo.jpg
```

**Pros:**
- ✅ Free forever
- ✅ Fast (Cloudflare CDN)
- ✅ SSL included
- ✅ No domain needed

**Cons:**
- ❌ Not branded (has r2.dev in URL)
- ❌ Can't customize subdomain

**For production with custom domain:**
- Need a domain (can get free from Freenom, or use existing)
- Connect in R2 settings (still free!)

## Troubleshooting (Free Tier)

### "Bucket not found"
```bash
# List buckets to verify
wrangler r2 bucket list

# Recreate if needed
wrangler r2 bucket create soulsync-media
```

### "Worker not found"
```bash
# Check deployment
wrangler deployments list

# Redeploy
npm run deploy
```

### "Unauthorized"
```bash
# Check secrets are set
wrangler secret list

# Should show:
# SUPABASE_JWT_SECRET
# R2_PUBLIC_DOMAIN
```

### Public URL not working
1. Check R2 bucket has public access enabled
2. Verify R2_PUBLIC_DOMAIN secret matches your r2.dev URL
3. Wait 1-2 minutes for changes to propagate

### Mobile app can't connect
1. Verify `.env` has correct Worker URL
2. Check Worker is deployed: visit `/health` endpoint
3. Restart Expo: `npx expo start -c`

## Free Tier Best Practices

### 1. Enable Auto-Delete for Statuses
Status media expires in 24h anyway, so delete automatically:
```
Lifecycle rule: status-media/* → Delete after 1 day
```

### 2. Compress Images Before Upload
```typescript
// Reduce from 5MB to 500KB
const compressed = await manipulateAsync(uri,
  [{ resize: { width: 1920 } }],
  { compress: 0.7 }
);
```

### 3. Monitor Usage Weekly
```bash
# Check current usage
wrangler r2 bucket list --show-size
```

### 4. Set Up Alerts
In Cloudflare Dashboard:
1. Notifications → Add
2. Alert when storage > 8GB (80% of free tier)
3. Alert when requests > 80k/day

## Costs When You Exceed Free Tier

**If you grow beyond free tier:**

| Service | Free Tier | After Free Tier |
|---------|-----------|-----------------|
| R2 Storage | 10GB | $0.015/GB/month |
| R2 Writes | 1M/month | $4.50/million |
| Workers | 100k req/day | $5/mo for 10M req |

**Example: 5,000 users**
- Storage: 50GB → Extra 40GB × $0.015 = $0.60/month
- Writes: 300k/month → Still free! ✅
- Workers: 300k/month → Still free! ✅

**Total: $0.60/month** (basically free!)

## Gradual Rollout (Free Tier Safe)

### Week 1: Testing (You + Beta Testers)
```env
EXPO_PUBLIC_USE_R2=true  # On your device only
```
- Test all features
- Upload avatars and statuses
- Verify public URLs work
- Check R2 dashboard for files

### Week 2: 10% of Users
```env
# Use feature flag or user ID-based rollout
EXPO_PUBLIC_USE_R2=true
```
- Monitor free tier usage (should be <1GB)
- Check Worker metrics (should be <1k req/day)
- Gather feedback

### Week 3: 50% of Users
- Monitor storage (should be <5GB)
- Check for any errors

### Week 4: 100% Rollout
- Enable for everyone
- Monitor for 48 hours
- Celebrate staying on free tier! 🎉

## Summary

**Setup Time:** 15 minutes
**Cost:** $0.00 (FREE FOREVER!)
**Storage:** 10GB free
**Requests:** 100k/day free
**Good for:** Up to 1,000 active users

## Next Steps

1. ✅ Create free Cloudflare account
2. ✅ Enable R2 (free tier)
3. ✅ Create bucket: `wrangler r2 bucket create soulsync-media`
4. ✅ Deploy Worker: `npm run deploy`
5. ✅ Get R2.dev public URL from dashboard
6. ✅ Configure mobile app `.env`
7. ✅ Test with `USE_R2=true`
8. ✅ Enable for all users
9. ✅ Enjoy free media storage! 🎉

**Questions?** Check [CLOUDFLARE_R2_SETUP.md](CLOUDFLARE_R2_SETUP.md) for detailed troubleshooting!

---

**Made with ❤️ using Cloudflare's generous free tier!**
