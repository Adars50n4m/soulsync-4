# 🛠️ Soul App - Reliability & Security Fix Guide

This document outlines technical fixes required to make Soul as reliable as WhatsApp.

## 1. 🔐 Implement End-to-End Encryption (E2EE)
**Issue:** Messages are currently sent in plaintext.
**Solution:** Use the Signal Protocol for encryption.

### Implementation Steps:
1. **Install Libsignal:**
   ```bash
   npm install libsignal
   ```
2. **Encryption Wrapper:**
   Create `mobile/src/encryption/SignalService.ts`:
   ```typescript
   export const encryptMessage = async (plaintext: string, recipientId: string) => {
     // 1. Fetch recipient's public key from Supabase
     // 2. Establish session
     // 3. Encrypt and return ciphertext
   };
   ```
3. **Modify ChatService:**
   In `sendMessage()`, encrypt before inserting to DB:
   ```typescript
   const encryptedText = await SignalService.encrypt(text, partnerId);
   // Send encryptedText to Supabase
   ```

## 2. 🛡️ Database Security (RLS Policies)
**Issue:** Any user can currently read/write any message.
**Solution:** Enable Row-Level Security in Supabase.

### SQL to run in Supabase Editor:
```sql
-- Enable RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Policy: Only sender or receiver can see the message
CREATE POLICY "Users can only see their own messages" 
ON messages FOR SELECT 
USING (auth.uid() = sender OR auth.uid() = receiver);

-- Policy: Only sender can insert
CREATE POLICY "Users can only insert messages they send" 
ON messages FOR INSERT 
WITH CHECK (auth.uid() = sender);
```

## 3. 📡 Network Reliability & Retries
**Issue:** Weak retry logic and misleading connectivity checks.
**Solution:** Implement robust queue management.

### Improvements:
- **Unlimited Retries:** Remove `MAX_RETRY_COUNT` and use exponential backoff that caps at 5 minutes.
- **Accurate Connectivity:**
  ```typescript
  // In ChatService.ts
  if (error.name === 'AbortError') return false; // Don't assume online!
  ```
- **Foreground Sync:** Use `NetInfo` from `@react-native-community/netinfo` instead of manual pings.

## 4. 🆔 Message Deduplication & Idempotency
**Issue:** Duplicate messages on network retry.
**Solution:** Use client-generated UUIDs as primary keys on the server.

### Steps:
1. Change `messages.id` from `BIGINT` (auto-inc) to `UUID` in Supabase.
2. Generate UUID on client: `const id = crypto.randomUUID();`
3. Supabase will reject duplicates of the same ID.

## 5. 🔔 Fix Push Notifications
**Issue:** Notifications are not reaching the partner.
**Solution:** Deploy Supabase Edge Functions.

### Deployment:
1. Install Supabase CLI: `npm install supabase --save-dev`
2. Initialize: `npx supabase init`
3. Deploy function:
   ```bash
   npx supabase functions deploy send-message-push
   ```
4. Ensure `receiver_id` has a valid FCM/APNs token in the `profiles` table.

## 🏎️ Performance Optimizations
- **Message Indexing:** Add composite index on `(sender, receiver, created_at)`.
- **Pagination:** Implement `Range` headers for fetching messages (limit to 50 initially).
- **SQLite Performance:** Use `db.withTransactionAsync` for batch message inserts.

---
**Prepared by Adars50n4m & Comet**
