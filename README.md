# 💕 Soul

**Soul** is a private, intimate messaging and moment-sharing app designed exclusively for couples. It's a sacred space where you and your partner can share your stories, memories, feelings, and milestones in complete privacy and security.

## ✨ Features

### Communication
- **Private Couple Chat** – End-to-end encrypted messages for just you and your partner
- **Voice Messages** – Record intimate voice notes for a more personal touch
- **Read Receipts** – See when your partner has read your messages
- **Typing Indicators** – Know when your partner is typing

### Memories & Moments
- **Memory Timeline** – Save and revisit special moments, love notes, and inside jokes
- **Photo & Video Sharing** – Private media gallery that only you two can see
- **Moment Highlights** – Mark your favorite conversations and moments
- **Search Memories** – Easily find past conversations and photos

### Connection & Goals
- **Couple Goals** – Set and track shared dreams and milestones together
- **Anniversary Tracking** – Remember and celebrate relationship milestones
- **Mood Check-ins** – Share how you're feeling with beautiful mood indicators
- **Love Calendar** – Mark special dates and upcoming anniversaries

### Privacy & Security
- **End-to-End Encryption** – Military-grade encryption protects all your messages and media
- **Zero Knowledge** – We cannot access your conversations or memories
- **Couple Verification** – Only verified partners can connect
- **No Data Selling** – Your intimate moments are yours alone
- **Offline Support** – Messages sync securely when you're back online

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend / Mobile** | TypeScript, React Native, Expo |
| **Backend / Edge** | Cloudflare Worker, Cloudflare Proxy |
| **Database & Realtime** | Supabase (Auth, PostgreSQL, Realtime) |
| **Encryption** | E2E Encryption (Signal Protocol) |
| **Communication** | WebRTC (secure peer-to-peer) |
| **Storage** | Encrypted cloud backup |

## 📂 Project Structure

```
soul/
├── mobile/                      # React Native/Expo mobile app
│   ├── screens/
│   │   ├── ChatScreen.tsx      # Main couple chat interface
│   │   ├── MemoriesScreen.tsx  # Timeline and memory vault
│   │   ├── GoalsScreen.tsx     # Shared goals and milestones
│   │   ├── MoodScreen.tsx      # Mood check-ins
│   │   ├── ProfileScreen.tsx   # Couple profile & settings
│   │   └── AuthScreen.tsx      # Couple pairing & login
│   ├── components/             # Reusable UI components
│   └── App.tsx                 # Entry point
├── src/
│   ├── encryption/             # E2E encryption logic
│   ├── webrtc/                 # Secure peer-to-peer calls
│   ├── utils/                  # Couple verification, pairing
│   └── types/                  # TypeScript interfaces
├── cloudflare-worker/          # Edge API & WebRTC signaling
├── cloudflare-proxy/           # Secure media proxy
├── supabase/                   # Database migrations & schema
├── .nvmrc                      # Node.js version (v18+)
└── README.md                   # This file
```

## 🚀 Getting Started

### Prerequisites

- Node.js v18+ (check `.nvmrc`)
- npm or yarn
- Supabase account (free tier available)
- Cloudflare account (for Worker deployment)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Adars50n4m/soul.git
   cd soul
   ```

2. **Use the correct Node version:**
   ```bash
   nvm use
   ```

3. **Install dependencies:**
   ```bash
   cd mobile
   npm install
   ```

4. **Set up environment variables:**

   Create `mobile/.env`:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   EXPO_PUBLIC_ENCRYPTION_KEY=your_encryption_master_key
   EXPO_PUBLIC_SIGNALING_URL=your_cloudflare_worker_url
   ```

   Create `cloudflare-worker/.env`:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_KEY=your_service_key
   ENCRYPTION_MASTER_KEY=your_encryption_master_key
   ```

5. **Set up the database:**
   - Follow migrations in `supabase/migrations/`
   - Tables: chats, messages, memories, goals, moods, users, couple_pairs

6. **Run the app:**
   ```bash
   npm run start
   ```

7. **Deploy Cloudflare Worker:**
   ```bash
   cd cloudflare-worker
   wrangler publish
   ```

## 🔐 Security Architecture

### Encryption
- All messages encrypted before leaving your device
- Signal Protocol for end-to-end encryption
- Encrypted media storage with secure keys

### Authentication
- Phone/Email verification
- Unique couple pairing code
- Two-factor authentication (optional)
- Session management with token rotation

### Privacy
- No access logs for couple conversations
- No data collection beyond what's necessary
- GDPR compliant
- Right to export your data anytime

## 💕 How It Works

1. **Download & Sign Up** – Create account with phone/email verification
2. **Invite Your Partner** – Share unique couple code with your partner
3. **Verify & Connect** – Both approve the couple pairing
4. **Start Sharing** – All messages are instantly encrypted and synced
5. **Build Memories** – Favorite moments automatically save to timeline
6. **Stay Connected** – Encrypted access from any device

## 🎯 Roadmap

- [ ] Voice/Video Calls (encrypted peer-to-peer)
- [ ] Live Location Sharing (optional, encrypted)
- [ ] Couple Calendar (shared events & anniversaries)
- [ ] Love Notes (daily prompts for deeper connection)
- [ ] Memories Export (encrypted backup & export)
- [ ] Relationship Stats & Timeline Charts
- [ ] Custom Themes & Dark Mode
- [ ] Photo Collages & Memory Books
- [ ] Couples Quiz & Compatibility Games
- [ ] In-app Date Night Ideas & Suggestions
- [ ] Push Notifications with Privacy
- [ ] Message Reactions & Emojis

## 🤝 Contributing

We love contributions! Please follow these guidelines:

1. **Fork the repository**
2. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature
   ```
3. **Make changes and test thoroughly**
4. **Commit with clear messages:**
   ```bash
   git commit -m "feat: add love notes feature"
   ```
5. **Submit a Pull Request**

For major changes, please open an issue first to discuss.

## 📝 License

MIT License – See [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Supabase for secure realtime backend
- Cloudflare for edge encryption and WebRTC
- React Native/Expo for cross-platform development
- Signal Protocol team for encryption standards
- All our beta couples for their feedback ❤️

## 📧 Support

- **GitHub Issues:** [Report bugs](https://github.com/Adars50n4m/soul/issues)
- **Discussions:** [Share ideas & get help](https://github.com/Adars50n4m/soul/discussions)
- **Email:** hello@soulsync.app

## 💬 Community

Join couples building deeper connections:

- Share your couple milestones
- Get relationship inspiration
- Connect with other couples
- Celebrate love stories

---

**Made with 💕 by Adars50n4m**

*"The greatest gift you can give to another person is your presence, your authentic self, and your time. Soul makes that easier."*

⭐ **If you love Soul, please give us a star and share with your partner!**
