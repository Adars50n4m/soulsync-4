
# SoulSync 4

SoulSync 4 is a next-generation real-time chat and status app with premium liquid glass UI, WebRTC-based calling, and Supabase-powered realtime infrastructure. Built for seamless, encrypted peer-to-peer communication with a modern mobile-first experience.

## ✨ Features

- **Real-time Chat** – Instant messaging with typing indicators, reactions, and refined UI placement
- **Status & Media Flow** – Share moments with auto-expiring status, photos, and videos
- **Audio Messages** – Record and send voice notes with proper UI integration
- **Online Presence** – See who's online/offline with advanced presence logic
- **Liquid Glass Aesthetics** – Premium UI with progressive blur, shadows, and modern design language
- **WebRTC Calling** – Low-latency peer-to-peer calls with edge-optimized signaling
- **End-to-End Ready** – Supabase auth with encrypted realtime subscriptions
- **Mobile-First** – React Native/Expo client with seamless cross-platform support

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend / Mobile** | TypeScript, React Native, Expo |
| **Backend / Edge** | Cloudflare Worker, Cloudflare Proxy |
| **Database & Realtime** | Supabase (Auth, PostgreSQL, Realtime) |
| **Communication** | WebRTC (peer-to-peer), Custom Signaling |
| **Language** | TypeScript (primary), JavaScript |

## 📂 Project Structure

```
soulsync-4/
├── mobile/                    # React Native/Expo app (main client)
│   ├── screens/              # Chat, status, profile screens
│   └── App.tsx               # Entry point
├── src/
│   ├── webrtc/               # WebRTC logic, signaling, connection management
│   └── ...
├── screens/                  # Shared screen components and layouts
├── cloudflare-worker/        # Edge API logic and WebRTC signaling
├── cloudflare-proxy/         # Routing and media proxy configuration
├── supabase/                 # SQL migrations, schema definitions
├── APPLY_STATUS_MIGRATION.md # Database migration guide
├── App.tsx                   # Root app file
├── .nvmrc                    # Node.js version (v18+)
└── README.md                 # This file
```

## 🚀 Getting Started

### Prerequisites
- Node.js (check `.nvmrc` for version)
- npm or yarn
- Supabase project (free tier at [supabase.com](https://supabase.com))
- Cloudflare account (for Worker deployment)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Adars50n4m/soulsync-4.git
   cd soulsync-4
   ```

2. **Use the correct Node version:**
   ```bash
   nvm use
   ```

3. **Install mobile app dependencies:**
   ```bash
   cd mobile
   npm install  # or yarn
   ```

4. **Create `.env` files** for each service:

   **mobile/.env:**
   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   EXPO_PUBLIC_SIGNALING_URL=your_cloudflare_worker_url
   ```

   **cloudflare-worker/.env:**
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_KEY=your_service_key
   ```

5. **Set up the database:**
   - Follow `APPLY_STATUS_MIGRATION.md` to apply Supabase migrations
   - Run SQL scripts in `supabase/` folder

6. **Run the app:**
   ```bash
   npm run start
   ```
   Or for web preview:
   ```bash
   npm run web
   ```

7. **Deploy Cloudflare Worker:**
   ```bash
   cd cloudflare-worker
   wrangler publish
   ```

## 🗄️ Database & Migrations

All database logic is in `supabase/`:
- Tables: `users`, `messages`, `status`, `reactions`, etc.
- Realtime subscriptions for live chat and status updates
- Row-level security (RLS) policies for privacy

To apply migrations:
1. Open your Supabase dashboard
2. Go to SQL Editor
3. Run scripts from `APPLY_STATUS_MIGRATION.md`
4. Verify tables appear in the Table Editor

## 🔧 Configuration

### WebRTC Signaling
Update signaling server URL in `src/webrtc/config.ts`:
```typescript
const SIGNALING_SERVER = 'https://your-worker.workers.dev/signal';
```

### Supabase Auth
Enable desired providers in Supabase dashboard:
- Email/Password (default)
- Google OAuth
- GitHub OAuth

## 📚 API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|----------|
| `/signal` | POST | WebRTC signaling (offer, answer, ICE candidates) |
| `/messages` | GET/POST | Fetch/send chat messages |
| `/status` | GET/POST | Manage user status |
| `/media/upload` | POST | Upload photos/videos |

## 🎯 Roadmap

- [ ] Stories-style ephemeral status with expiration timers
- [ ] Group chat with admin controls
- [ ] Video calling with screen sharing
- [ ] Message search and filtering
- [ ] Push notifications (FCM/APNs)
- [ ] Background sync for offline messages
- [ ] E2E encryption (Signal protocol integration)
- [ ] Custom presence statuses ("in a meeting", "sleeping", etc.)
- [ ] Message reactions with custom emojis
- [ ] Voice message transcription with AI

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. **Fork the repository**
2. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes** and test thoroughly
4. **Commit with clear messages:**
   ```bash
   git commit -m "feat: add voice transcription"
   ```
5. **Push and create a Pull Request**

For large features, please open an issue first to discuss the approach.

## 📝 License

This project is licensed under the **MIT License** – see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Supabase for realtime backend
- Cloudflare for edge computing and WebRTC signaling
- React Native/Expo for cross-platform mobile development
- The open-source community for inspiration and tools

## 📧 Contact

- **GitHub Issues:** [Report bugs or request features](https://github.com/Adars50n4m/soulsync-4/issues)
- **Discussions:** [Share ideas and get help](https://github.com/Adars50n4m/soulsync-4/discussions)

---

**Made with ❤️ by Adars50n4m**

If you find this project useful, please consider giving it a ⭐ star!
