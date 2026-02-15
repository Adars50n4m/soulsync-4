# How to Fix Status Feature - Apply Migration

## Problem
The `caption` column doesn't exist in the `statuses` table, causing status uploads to fail.

## Solution
Apply the migration SQL to your Supabase database.

## Steps to Apply Migration

### Option 1: Via Supabase Dashboard (Recommended)

1. **Open Supabase Dashboard**
   - Go to: https://supabase.com/dashboard
   - Login to your account
   - Select your project: `xuipxbyvsawhuldopvjn`

2. **Open SQL Editor**
   - Click on "SQL Editor" in the left sidebar
   - Click "New query" button

3. **Copy and Run Migration**
   - Open the file: `mobile/supabase/migrations/fix_statuses_complete.sql`
   - Copy ALL the SQL code
   - Paste it into the SQL editor
   - Click "Run" button

4. **Verify Success**
   - You should see a message like "Success. No rows returned"
   - The last SELECT statement will show all columns including `caption`

### Option 2: Via Supabase CLI (If you have Docker)

```bash
cd mobile
npx supabase db reset
npx supabase migration up
```

## What This Migration Does

✅ Creates `statuses` table with ALL required columns including `caption`
✅ Enables Row Level Security (RLS) for data protection
✅ Sets up realtime sync so other users can see your status
✅ Creates indexes for faster queries
✅ Auto-cleans expired statuses (24h expiry)

## After Applying Migration

Your status feature will now:
- ✅ **Persist** - Statuses remain after refresh, logout, and re-login
- ✅ **Sync** - Other users can see your status in real-time
- ✅ **Auto-expire** - Statuses automatically disappear after 24 hours

## Test the Feature

1. **Login** as Shri or Hari
2. **Add Status** - Tap camera icon on home screen
3. **Upload** image/video with caption
4. **Refresh** the app - Status should still be there
5. **Login from another device** as the other user - They should see your status

## Troubleshooting

If status still doesn't work after migration:

1. **Check Realtime is enabled**:
   - Go to Supabase Dashboard → Database → Replication
   - Ensure `statuses` table is in publication

2. **Check for errors in console**:
   - Look for any Supabase errors in React Native logs

3. **Verify migration applied**:
   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'statuses' AND table_schema = 'public';
   ```
   You should see: id, user_id, user_name, user_avatar, media_url, media_type, **caption**, likes, views, expires_at, created_at

## Need Help?

Check the app logs for any Supabase errors. The migration includes all RLS policies needed for the feature to work.
