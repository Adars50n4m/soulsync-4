# Cloudflare R2 Integration Guide

This guide walks you through integrating Cloudflare R2 for media storage in the Soul mobile app.

## Overview

We're migrating from Supabase Storage to Cloudflare R2 for:
- **Cost savings:** $0 egress fees (vs Supabase)
- **Performance:** Global CDN for faster delivery
- **Scalability:** Better high-traffic handling

## Architecture

```
┌──────────────┐      ┌──────────────────┐      ┌─────────────┐
│  Mobile App  │─────▶│ Cloudflare Worker│─────▶│  R2 Bucket  │
│              │      │  (Auth + Proxy)  │      │             │
└──────────────┘      └──────────────────┘      └─────────────┘
                              │                        │
                              │                        ▼
                              │              ┌──────────────────┐
                              └─────────────▶│  Public URL      │
                                             │  (via CDN)       │
                                             └──────────────────┘
```

## Step-by-Step Setup

### Part 1: Cloudflare Infrastructure

#### 1.1 Install Wrangler CLI

```bash
npm install -g wrangler
wrangler login
```

#### 1.2 Create R2 Bucket

```bash
cd /Volumes/Work/Soul-4/cloudflare-worker
wrangler r2 bucket create Soul-media
```

#### 1.3 Configure Public Access

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → R2
2. Click on `Soul-media` bucket
3. Go to **Settings** → **Public Access**
4. Click **Connect Domain**
5. Choose a domain/subdomain (e.g., `r2-media.yourdomain.com`)
6. Wait for DNS to propagate (~5 minutes)
7. **Save the public URL** - you'll need it later!

#### 1.4 Configure Lifecycle Rules (Auto-delete after 24h)

1. In the `Soul-media` bucket settings
2. Go to **Lifecycle Rules**
3. Click **Add Rule**
4. Configure:
   - **Rule name:** Delete expired statuses
   - **Prefix:** `status-media/`
   - **Delete after:** 1 day
5. Save

### Part 2: Deploy Cloudflare Worker

#### 2.1 Install Worker Dependencies

```bash
cd /Volumes/Work/Soul-4/cloudflare-worker
npm install
```

#### 2.2 Configure Secrets

You need two secrets:

**SUPABASE_JWT_SECRET** (for authentication):
```bash
wrangler secret put SUPABASE_JWT_SECRET
```
When prompted, paste your Supabase JWT secret:
- Find it in: Supabase Dashboard → Project Settings → API → JWT Secret

**R2_PUBLIC_DOMAIN** (for generating URLs):
```bash
wrangler secret put R2_PUBLIC_DOMAIN
```
When prompted, enter your R2 public domain from step 1.3:
```
https://r2-media.yourdomain.com
```

#### 2.3 Deploy Worker

```bash
npm run deploy
```

Expected output:
```
✨ Successfully published your script
https://Soul-upload.YOUR-SUBDOMAIN.workers.dev
```

**Save this Worker URL** - you'll need it for mobile app configuration!

#### 2.4 Test Worker Deployment

```bash
curl https://Soul-upload.YOUR-SUBDOMAIN.workers.dev/health
```

Expected response:
```json
{"status":"ok","timestamp":"2024-02-14T..."}
```

### Part 3: Configure Mobile App

#### 3.1 Create .env File

Create `/Volumes/Work/Soul-4/mobile/.env`:

```env
# Cloudflare R2 Configuration
EXPO_PUBLIC_R2_WORKER_URL=https://Soul-upload.YOUR-SUBDOMAIN.workers.dev
EXPO_PUBLIC_R2_PUBLIC_URL=https://r2-media.YOUR-DOMAIN.com
EXPO_PUBLIC_USE_R2=false

# Start with false for testing, then gradually enable
```

**Replace:**
- `YOUR-SUBDOMAIN` with your actual Worker subdomain
- `YOUR-DOMAIN` with your R2 public domain

#### 3.2 Verify Configuration

Check that the config is loaded:

```bash
cd /Volumes/Work/Soul-4/mobile
npx expo start -c
```

The app should start without errors.

### Part 4: Testing

#### 4.1 Test with R2 Enabled

1. Edit `.env` and set:
   ```env
   EXPO_PUBLIC_USE_R2=true
   ```

2. Restart the app:
   ```bash
   npx expo start -c
   ```

3. Test avatar upload:
   - Open Profile Edit screen
   - Tap on avatar to change
   - Select a photo
   - Check console logs for upload status

4. Test status upload:
   - Go to Status tab
   - Tap Camera button
   - Select an image or video
   - Post status
   - Verify it appears correctly

#### 4.2 Monitor Uploads

Watch Worker logs in real-time:
```bash
cd /Volumes/Work/Soul-4/cloudflare-worker
wrangler tail
```

Check mobile app logs:
```
Look for:
✅ "📤 Using Cloudflare R2 for upload"
✅ "Upload successful: ..."
❌ Check for any error messages
```

#### 4.3 Verify Files in R2

1. Go to Cloudflare Dashboard → R2 → `Soul-media`
2. Browse objects
3. You should see:
   ```
   avatars/
     {userId}/
       {timestamp}.jpg
   status-media/
     {userId}/
       {timestamp}.jpg
   ```

#### 4.4 Test Public URLs

Copy a public URL from the upload response and open in browser:
```
https://r2-media.yourdomain.com/avatars/user123/1707912345.jpg
```

The image should load successfully!

### Part 5: Gradual Rollout

Don't enable R2 for all users at once! Follow this plan:

#### Phase 1: Development Testing (Day 1-2)
```env
EXPO_PUBLIC_USE_R2=true  # Only on your dev device
```
- Test all upload scenarios
- Verify no errors in logs
- Check public URLs work

#### Phase 2: Staging/Beta (Day 3-5)
- Deploy to TestFlight/Internal Testing
- Monitor upload success rate
- Gather feedback from beta testers

#### Phase 3: 10% Rollout (Day 6-7)
- Enable for 10% of users
- Monitor metrics:
  - Upload success rate (target: >95%)
  - Average upload time (target: <5s)
  - Error rate (target: <5%)
- Check Worker logs for issues

#### Phase 4: 50% Rollout (Week 2)
- If Phase 3 successful, increase to 50%
- Continue monitoring
- Be ready to rollback if needed

#### Phase 5: 100% Rollout (Week 3)
- Enable for all users
- Monitor for 48 hours closely
- Celebrate! 🎉

### Part 6: Rollback Plan

If something goes wrong:

**Immediate Rollback (< 1 minute):**
1. Edit `.env`:
   ```env
   EXPO_PUBLIC_USE_R2=false
   ```
2. Restart app or redeploy

**Investigate:**
```bash
# Check Worker logs
cd /Volumes/Work/Soul-4/cloudflare-worker
wrangler tail

# Check Worker metrics
# Cloudflare Dashboard → Workers → Soul-upload-worker → Metrics
```

**Common Issues:**

| Issue | Solution |
|-------|----------|
| "Unauthorized" errors | Check SUPABASE_JWT_SECRET is correct |
| "Bucket not found" | Verify R2 bucket exists and binding is correct |
| CORS errors | Check Worker CORS headers |
| Upload timeouts | Check file sizes, increase timeout in config |
| Public URLs don't work | Verify R2_PUBLIC_DOMAIN is correct |

## Migration Strategy

### Handling Existing Media

**Option 1: No Migration (Recommended)**
- New uploads → R2
- Old Supabase URLs stay valid
- Status media expires naturally (24h)
- Avatars stay on Supabase (works fine)

**Option 2: Gradual Migration**
- Create a migration script to copy Supabase → R2
- Update database URLs in batches
- Run over several weeks

**Recommendation:** Use Option 1. It's simpler and works perfectly fine to have media in both places.

### Database Schema

No changes needed! The database just stores URLs:
```sql
-- Works with both Supabase and R2 URLs
media_url TEXT  -- Can be either:
  -- https://supabase.co/storage/v1/object/public/...
  -- https://r2-media.yourdomain.com/avatars/...
```

## Monitoring & Maintenance

### Metrics to Track

**Worker Metrics:**
- Requests per day
- Success rate (%)
- Error rate (%)
- Average response time
- P95/P99 latency

**R2 Metrics:**
- Storage used (GB)
- Number of objects
- Class A operations (writes)
- Class B operations (reads)

**Mobile App Metrics:**
- Upload success rate
- Upload duration
- User-reported issues

### View Metrics

**Cloudflare Dashboard:**
1. Go to Workers → Soul-upload-worker → Metrics
2. View graphs for requests, errors, duration
3. Set up alerts for high error rates

**R2 Dashboard:**
1. Go to R2 → Soul-media → Metrics
2. View storage usage and operations
3. Monitor costs

### Alerts to Set Up

1. **High Error Rate:** Alert if error rate > 5%
2. **High Latency:** Alert if P95 > 10 seconds
3. **Storage Limit:** Alert if storage > 80% of quota
4. **Cost Alert:** Alert if monthly cost > $10

## Cost Breakdown

### Current Costs (1000 active users, 2 uploads/day)

**R2 Storage:**
- Storage: 120GB × $0.015/GB = $1.80/month
- Class A ops (writes): 60k × $4.50/1M = $0.27/month
- Class B ops (reads): Free
- Egress: $0 (this is the big win!)

**Cloudflare Workers:**
- 60k requests/month
- Free tier: 100k requests/day
- Cost: $0/month

**Total: ~$2/month** 💰

Compare to Supabase Storage:
- 120GB × $0.021/GB = $2.52/month (storage)
- Egress charges (can be significant!)
- Total: $5-15/month depending on traffic

**Savings: ~60-80%**

## Troubleshooting

### Worker won't deploy
```bash
# Check wrangler is logged in
wrangler whoami

# Re-login if needed
wrangler login

# Check wrangler.toml syntax
cat wrangler.toml
```

### Uploads failing with "Unauthorized"
```bash
# Verify JWT secret is set
wrangler secret list

# Re-set if needed
wrangler secret put SUPABASE_JWT_SECRET
```

### Public URLs return 404
- Check R2_PUBLIC_DOMAIN is set correctly
- Verify custom domain is connected in R2 settings
- Wait for DNS propagation (can take 5-10 minutes)
- Test bucket access directly

### Mobile app can't reach Worker
- Check Worker URL in .env is correct
- Verify Worker is deployed: visit /health endpoint
- Check device internet connection
- Look for CORS errors in console

## Security Best Practices

✅ **DO:**
- Keep `SUPABASE_JWT_SECRET` secret
- Verify JWT tokens server-side (Worker does this)
- Validate file types and sizes
- Use unique filenames (timestamp-based)
- Monitor for abuse/spam uploads
- Set up rate limiting if needed

❌ **DON'T:**
- Expose R2 credentials in mobile app
- Allow unlimited file sizes
- Skip JWT verification
- Use predictable filenames
- Store sensitive data in R2 (it's public!)

## Next Steps

After successful deployment:

1. **Monitor for 1 week:** Watch metrics, check for errors
2. **Gradual rollout:** 10% → 50% → 100% over 2-3 weeks
3. **Optimize if needed:**
   - Add image compression/resizing
   - Implement presigned URLs for faster uploads
   - Add rate limiting to prevent abuse
4. **Clean up:**
   - Remove old Supabase buckets after 30 days
   - Archive migration documentation
5. **Celebrate!** You've successfully migrated to R2! 🎉

## Support

**Documentation:**
- [Cloudflare R2 Docs](https://developers.cloudflare.com/r2/)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Docs](https://developers.cloudflare.com/workers/wrangler/)

**Worker Code:**
- `/Volumes/Work/Soul-4/cloudflare-worker/`

**Mobile Integration:**
- `/Volumes/Work/Soul-4/mobile/services/R2StorageService.ts`
- `/Volumes/Work/Soul-4/mobile/config/r2.ts`

**Logs:**
```bash
# Real-time Worker logs
wrangler tail

# Mobile app logs
npx expo start
```

Happy deploying! 🚀
