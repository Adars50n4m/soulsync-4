# Reliability & Performance Upgrade Plan

This plan addresses the critical architectural issues identified to make Soulsync-4 as reliable as WhatsApp.

## 1. Offline-First Architecture (Critical)

**Goal**: Ensure the app opens immediately with cached data and works without internet.

### Implementation Details:

- **Database**: Integrate `expo-sqlite` (modern API) with `drizzle-orm` (optional, or raw SQL for speed) for local storage.
- **Schema**:
  - `users`: Store profiles.
  - `contacts`: Store friend list and status.
  - `messages`: Store all chat history locally.
  - `sync_queue`: Store actions (send message, update status) performed while offline.
- **Sync Logic**:
  - **On Startup (Load)**: Read from SQLite -> Render UI immediately.
  - **Background Sync**: Check `sync_queue`. If items exist, push to Supabase.
  - **Pull Sync**: Fetch new rows from Supabase where `created_at > last_sync_timestamp`.

### Tasks:

1.  [ ] Install `expo-sqlite`.
2.  [ ] Create `database/` module.
3.  [ ] Define Tables (`messages`, `users`, `queue`).
4.  [ ] Implement `OfflineService` to read/write to DB.
5.  [ ] Refactor `AppContext` to load from `OfflineService` instead of `AsyncStorage`.
6.  [ ] Implement `SyncService` to handle background synchronization.

## 2. Media Optimization & Caching

**Goal**: Instant media loading and efficient bandwidth usage.

### Implementation Details:

- **Client-side Compression**: Use `expo-image-manipulator` to compress images/video before upload.
- **Progressive Loading**:
  - Show a small blurhash or low-res thumbnail first.
  - Use `expo-image` for aggressive caching and transition effects.
- **Upload Queue**:
  - Media uploads should happen in the background. If upload fails, retry automatically.

### Tasks:

1.  [ ] Install `expo-image-manipulator`.
2.  [ ] Update `StorageService` to compress media before `fetch` upload.
3.  [ ] Replace standard `<Image />` with `expo-image` (`<Image />` from `expo-image`) app-wide.
4.  [ ] Implement generic `MediaCache` logic if needed (though `expo-image` handles most).

## 3. Real-time Connection Stability

**Goal**: Stable chat and battery-efficient calls.

### Implementation Details:

- **Chat**: Move strictly to **Supabase Realtime**. It is lightweight and sufficient for text/status.
- **Calls**: Keep **WebRTC + Socket.io** (or move signaling to Supabase if possible, but distinct is fine).
- **Reconnection**:
  - Implementing "Silent Reconnect" logic.
  - If socket disconnects, retry with exponential backoff.
  - Queue `emit` events if disconnected.

### Tasks:

1.  [ ] Audit `AppContext` usage of `socket`. Ensure _only_ calls and detailed presence use it.
2.  [ ] Ensure text messages mainly use Supabase `INSERT` + Realtime Subscription (which we partially have).
3.  [ ] Implement `ConnectionManager` to centralize connection states and retries.

## Execution Order

1.  **Step 1**: Offline-First (Local DB) - This provides the biggest UX win.
2.  **Step 2**: Real-time logic refinement.
3.  **Step 3**: Media optimization.
