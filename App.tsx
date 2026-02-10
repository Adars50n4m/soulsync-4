
import React, { memo, useMemo, useState, useEffect, useRef } from 'react';
import { HashRouter as Router, Routes, Route, useLocation, Link, useNavigate } from 'react-router-dom';
import { AppProvider, useApp } from './AppContext.tsx';
import { getActiveStreams, onStreamsChange } from './src/webrtc/useWebRTC';

// Screens
import HomeScreen from './screens/HomeScreen.tsx';
import SingleChatScreen from './screens/SingleChatScreen.tsx';
import ContactsScreen from './screens/ContactsScreen.tsx';
import StatusScreen from './screens/StatusScreen.tsx';
import CallsScreen from './screens/CallsScreen.tsx';
import ProfileScreen from './screens/ProfileScreen.tsx';
import SettingsScreen from './screens/SettingsScreen.tsx';
import VideoCallScreen from './screens/VideoCallScreen.tsx';
import AudioCallScreen from './screens/AudioCallScreen.tsx';

const HomeIndicator: React.FC = () => (
  <div className="fixed bottom-1 w-24 h-1 bg-white/5 rounded-full left-1/2 -translate-x-1/2 z-[100] pointer-events-none md:hidden"></div>
);

const PipOverlay: React.FC = () => {
  const { activeCall, contacts, toggleMinimizeCall } = useApp();
  const navigate = useNavigate();
  const [position, setPosition] = useState({ x: window.innerWidth - 130, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const lastTap = useRef<number>(0);
  const pipVideoRef = useRef<HTMLVideoElement>(null);
  const [hasRemoteStream, setHasRemoteStream] = useState(false);

  const contact = contacts.find(c => c.id === activeCall?.contactId);

  // Subscribe to active WebRTC streams for live PiP video
  useEffect(() => {
    const updateStream = () => {
      const { remote } = getActiveStreams();
      if (pipVideoRef.current && remote) {
        pipVideoRef.current.srcObject = remote;
        setHasRemoteStream(true);
      } else {
        setHasRemoteStream(false);
      }
    };
    updateStream();
    const unsub = onStreamsChange(updateStream);
    return unsub;
  }, [activeCall]);

  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => ({
        x: Math.min(window.innerWidth - 120, prev.x),
        y: Math.min(window.innerHeight - 160, prev.y)
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!activeCall || !activeCall.isMinimized || !contact) return null;

  const handleStart = (e: any) => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    setIsDragging(true);
    setHasMoved(false);
    dragStart.current = { x: clientX - position.x, y: clientY - position.y };
  };

  const handleMove = (e: any) => {
    if (!isDragging) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    let newX = clientX - dragStart.current.x;
    let newY = clientY - dragStart.current.y;

    if (Math.abs(newX - position.x) > 5 || Math.abs(newY - position.y) > 5) {
      setHasMoved(true);
    }

    const margin = 12;
    newX = Math.max(margin, Math.min(window.innerWidth - 110 - margin, newX));
    newY = Math.max(margin, Math.min(window.innerHeight - 150 - margin, newY));

    setPosition({ x: newX, y: newY });
  };

  const handleEnd = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleEnd);
      window.addEventListener('touchmove', handleMove);
      window.addEventListener('touchend', handleEnd);
    } else {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging]);

  const handleInteraction = () => {
    if (hasMoved) return;

    const now = Date.now();
    const isDoubleTap = now - lastTap.current < 300;
    lastTap.current = now;

    toggleMinimizeCall(false);
    const route = activeCall.type === 'video' ? `/video-call/${contact.id}` : `/audio-call/${contact.id}`;
    navigate(route);
  };

  return (
    <div
      onMouseDown={handleStart}
      onTouchStart={handleStart}
      onClick={handleInteraction}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transition: isDragging ? 'none' : 'all 0.15s cubic-bezier(0.2, 0.8, 0.2, 1)'
      }}
      className={`fixed z-[999] w-[110px] h-[150px] rounded-[2.2rem] overflow-hidden border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.6)] cursor-grab active:cursor-grabbing transform-gpu select-none ${isDragging ? 'scale-105 shadow-[0_30px_70px_rgba(0,0,0,0.7)]' : 'hover:scale-105'} animate-ios-pop`}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-xl">
        {activeCall.type === 'video' ? (
          <video
            ref={pipVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover opacity-70"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3">
            <div className="size-14 rounded-full border border-primary/30 p-1 animate-pulse shadow-[0_0_20px_rgba(244,63,94,0.3)]">
              <img src={contact.avatar} className="w-full h-full rounded-full object-cover" alt="avatar" draggable={false} />
            </div>
            <div className="flex gap-1.5 items-center">
              <div className="size-1.5 bg-primary rounded-full animate-bounce"></div>
              <div className="size-1.5 bg-primary rounded-full animate-bounce [animation-delay:0.2s]"></div>
              <div className="size-1.5 bg-primary rounded-full animate-bounce [animation-delay:0.4s]"></div>
            </div>
          </div>
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-transparent pointer-events-none"></div>
      <div className="absolute top-3 right-3">
        <div className="size-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_var(--color-primary)]"></div>
      </div>
      <div className="absolute bottom-3 left-0 right-0 text-center">
        <span className="text-[7px] font-black uppercase tracking-[0.2em] text-white/30">Spectral Sync</span>
      </div>
    </div>
  );
};

const BottomNav: React.FC = memo(() => {
  const location = useLocation();
  const tabs = useMemo(() => [
    { path: '/', icon: 'home', label: 'Sync' },
    { path: '/status', icon: 'blur_circular', label: 'Pulse' },
    { path: '/calls', icon: 'call', label: 'Mesh' },
    { path: '/settings', icon: 'settings', label: 'Core' },
  ], []);

  const activeTab = useMemo(() => {
    if (location.pathname === '/') return '/';
    const match = tabs.find(t => t.path !== '/' && location.pathname.startsWith(t.path));
    return match ? match.path : '/';
  }, [location.pathname, tabs]);

  const hideNav = location.pathname.includes('/chat/') ||
    location.pathname.includes('/video-call/') ||
    location.pathname.includes('/audio-call/') ||
    location.pathname.includes('/profile/');

  if (hideNav) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[80] px-6 pb-[calc(1.2rem+env(safe-area-inset-bottom,20px))] pt-4 bg-gradient-to-t from-black via-black/90 to-transparent">
      <div className="liquid-glass rounded-[2rem] p-2 flex items-center justify-around border-white/10 shadow-2xl max-w-lg mx-auto backdrop-blur-3xl">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.path;
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`flex flex-col items-center gap-1.5 px-6 py-2.5 rounded-full transition-all duration-500 ios-active relative ${isActive ? 'bg-primary/10 text-primary shadow-[0_0_20px_rgba(244,63,94,0.1)]' : 'text-white/30 hover:text-white/50'}`}
            >
              <span className={`material-symbols-outlined text-[24px] ${isActive ? 'fill-1' : ''}`}>
                {tab.icon}
              </span>
              <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${isActive ? 'opacity-100' : 'opacity-0 scale-75'} transition-all`}>
                {tab.label}
              </span>
              {isActive && (
                <div className="absolute -top-1 size-1 bg-primary rounded-full shadow-[0_0_8px_var(--color-primary)]"></div>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
});

const App: React.FC = () => {
  return (
    <AppProvider>
      <Router>
        <div className="relative h-screen w-full bg-black text-white overflow-hidden font-sans select-none">
          <Routes>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/chat/:id" element={<SingleChatScreen />} />
            <Route path="/status" element={<StatusScreen />} />
            <Route path="/calls" element={<CallsScreen />} />
            <Route path="/contacts" element={<ContactsScreen />} />
            <Route path="/profile/:id" element={<ProfileScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
            <Route path="/video-call/:id" element={<VideoCallScreen />} />
            <Route path="/audio-call/:id" element={<AudioCallScreen />} />
          </Routes>
          <BottomNav />
          <PipOverlay />
          <HomeIndicator />
        </div>
      </Router>
    </AppProvider>
  );
};

export default App;
