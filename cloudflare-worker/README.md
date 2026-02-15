# SoulSync Upload Worker

Cloudflare Worker that handles media uploads (avatars, status images/videos) to Cloudflare R2 storage.

## Architecture

```
Mobile App → Worker (Auth + Validation) → R2 Bucket → Public URL
```

## Features

- ✅ Secure uploads with JWT authentication
- ✅ File validation (type, size)
- ✅ Support for images (jpg, png, webp, gif) and videos (mp4, mov, avi, mkv)
- ✅ Automatic content-type detection
- ✅ Unique filename generation
- ✅ CORS support for mobile apps
- ✅ Health check endpoint

## Prerequisites

1. **Cloudflare Account** with Workers and R2 enabled
2. **Wrangler CLI** installed globally:
   ```bash
   npm install -g wrangler
   ```
3. **Authenticated Wrangler**:
   ```bash
   wrangler login
   ```

## Setup Instructions

### 1. Create R2 Bucket

```bash
# Create the bucket
wrangler r2 bucket create soulsync-media

# Verify bucket was created
wrangler r2 bucket list
```

### 2. Configure Public Access

1. Go to Cloudflare Dashboard → R2
2. Select `soulsync-media` bucket
3. Go to Settings → Public Access
4. Connect a custom domain (e.g., `r2-media.yourdomain.com`)
5. Note the public URL for configuration

### 3. Install Dependencies

```bash
cd cloudflare-worker
npm install
```

### 4. Set Environment Secrets

```bash
# Set your Supabase JWT secret for token verification
wrangler secret put SUPABASE_JWT_SECRET
# Enter your Supabase JWT secret when prompted

# Set your R2 public domain
wrangler secret put R2_PUBLIC_DOMAIN
# Enter: https://r2-media.yourdomain.com
```

**Where to find SUPABASE_JWT_SECRET:**
- Go to Supabase Dashboard → Project Settings → API
- Copy the "JWT Secret" value

### 5. Deploy Worker

```bash
# Deploy to production
npm run deploy

# Or test locally first
npm run dev
```

After deployment, note the Worker URL (e.g., `https://soulsync-upload.your-subdomain.workers.dev`)

### 6. Configure Mobile App

Update `/Volumes/Work/soulsync-4/mobile/.env`:

```env
EXPO_PUBLIC_R2_WORKER_URL=https://soulsync-upload.YOUR-SUBDOMAIN.workers.dev
EXPO_PUBLIC_R2_PUBLIC_URL=https://r2-media.YOUR-DOMAIN.com
EXPO_PUBLIC_USE_R2=false
```

**Important:** Start with `USE_R2=false` for testing!

## Testing

### Test Health Endpoint

```bash
curl https://soulsync-upload.your-subdomain.workers.dev/health
```

Expected response:
```json
{"status":"ok","timestamp":"2024-02-14T..."}
```

### Test Upload (with auth token)

```bash
# Get a token from your mobile app or Supabase
TOKEN="your-jwt-token-here"

curl -X POST https://soulsync-upload.your-subdomain.workers.dev/upload/avatar \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test-image.jpg" \
  -F "folder=test-user"
```

Expected response:
```json
{
  "success": true,
  "publicUrl": "https://r2-media.your-domain.com/avatars/test-user/1707912345678.jpg",
  "filename": "test-user/1707912345678.jpg",
  "size": 123456,
  "contentType": "image/jpeg"
}
```

## API Endpoints

### `GET /health`
Health check endpoint

**Response:**
```json
{"status":"ok","timestamp":"2024-02-14T12:00:00.000Z"}
```

### `POST /upload/avatar`
Upload profile avatar (max 5MB)

**Headers:**
- `Authorization: Bearer <jwt-token>`

**Body (multipart/form-data):**
- `file`: Image file (jpg, png, webp)
- `folder`: Optional folder path (defaults to user ID from JWT)

**Response:**
```json
{
  "success": true,
  "publicUrl": "https://...",
  "filename": "...",
  "size": 123456,
  "contentType": "image/jpeg"
}
```

### `POST /upload/status`
Upload status media (max 50MB)

**Headers:**
- `Authorization: Bearer <jwt-token>`

**Body (multipart/form-data):**
- `file`: Image or video file
- `folder`: Optional folder path

**Response:** Same as `/upload/avatar`

## File Size Limits

- **Avatars:** 5MB (configured in `MAX_AVATAR_SIZE_MB`)
- **Status Media:** 50MB (configured in `MAX_FILE_SIZE_MB`)

## Allowed File Types

**Avatars:**
- Images: jpg, png, webp

**Status Media:**
- Images: jpg, png, webp, gif
- Videos: mp4, mov, avi, mkv

## Security

### Authentication
- All uploads require a valid Supabase JWT token
- Worker verifies token and extracts user ID
- User ID is used for folder organization

### Rate Limiting
- Currently no rate limiting (add if needed)
- Consider adding Cloudflare Workers Rate Limiting

### File Validation
- Content type validation
- File size limits enforced
- Malicious file detection (basic)

## Monitoring

### View Logs
```bash
# Stream live logs
wrangler tail

# View logs in dashboard
# Cloudflare Dashboard → Workers → soulsync-upload-worker → Logs
```

### Metrics to Monitor
- Request count
- Success/error rate
- Upload duration (p50, p95, p99)
- R2 storage usage

## Troubleshooting

### Error: "Bucket not found"
- Verify R2 bucket exists: `wrangler r2 bucket list`
- Check `wrangler.toml` has correct bucket name

### Error: "Unauthorized"
- Check `SUPABASE_JWT_SECRET` is set correctly
- Verify mobile app is sending valid JWT token
- Test token at https://jwt.io

### Error: "File too large"
- Check file size limits in `wrangler.toml`
- Increase `MAX_FILE_SIZE_MB` if needed
- Consider client-side compression

### CORS Errors
- CORS is configured to allow all origins (`*`)
- If issues persist, check browser dev console
- Verify OPTIONS requests are handled correctly

## Cost Estimate

### R2 Storage (1000 users)
- Storage: 120GB × $0.015/GB = **$1.80/month**
- Writes: 60k × $4.50/million = **$0.27/month**
- Reads: Free
- Egress: **$0** (key advantage!)

### Workers
- 60k requests/month (well within free tier)
- Cost: **$0/month**

**Total: ~$2/month**

## Lifecycle Rules

To auto-delete status media after 24 hours:

1. Go to Cloudflare Dashboard → R2 → soulsync-media
2. Settings → Lifecycle Rules
3. Add rule:
   - Name: "Delete expired statuses"
   - Prefix: `status-media/`
   - Delete after: 1 day

## Rollback

If issues occur:

1. **Immediate:** Disable in mobile app
   ```env
   EXPO_PUBLIC_USE_R2=false
   ```

2. **Investigate:** Check Worker logs
   ```bash
   wrangler tail
   ```

3. **Rollback Worker:** Deploy previous version
   ```bash
   wrangler rollback
   ```

## Development

### Local Testing
```bash
npm run dev
```

Access at: `http://localhost:8787`

### TypeScript Support
Worker uses TypeScript with `@cloudflare/workers-types`

### Debugging
- Use `console.log()` in Worker code
- View logs with `wrangler tail`
- Test locally before deploying

## Production Checklist

Before enabling R2 in production (`USE_R2=true`):

- [ ] R2 bucket created and configured
- [ ] Custom domain connected for public access
- [ ] Worker deployed successfully
- [ ] Secrets configured (`SUPABASE_JWT_SECRET`, `R2_PUBLIC_DOMAIN`)
- [ ] Health check passing
- [ ] Test upload successful (avatar + status)
- [ ] Mobile app configured with correct URLs
- [ ] Lifecycle rules configured (24h deletion)
- [ ] Monitoring/logging enabled
- [ ] Gradual rollout plan (10% → 50% → 100%)

## Support

For issues or questions:
- Check Worker logs: `wrangler tail`
- Review Cloudflare R2 docs: https://developers.cloudflare.com/r2/
- Check mobile app logs for upload errors
