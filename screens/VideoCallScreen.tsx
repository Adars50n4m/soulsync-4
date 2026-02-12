
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../AppContext.tsx';
import { useWebRTC } from '../src/webrtc/useWebRTC';

const VideoCallScreen: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { activeCall, endCall, toggleMinimizeCall, toggleMute, contacts } = useApp();
  const [swapped, setSwapped] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const contact = contacts.find(c => c.id === id) || contacts.find(c => c.id === activeCall?.contactId);

  const roomId = activeCall?.roomId || (contact ? `callRoom-${contact.id}` : '');

  const { localStream, remoteStream, cleanup } = useWebRTC({
    roomId,
    callType: 'video',
    isMuted: activeCall?.isMuted ?? false,
    active: !!(activeCall && !activeCall.isMinimized && contact),
  });

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const bgVideoRef = useRef<HTMLVideoElement>(null);

  // Attach remote stream to the background & main video element
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    if (bgVideoRef.current && remoteStream) {
      bgVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, swapped]);

  // Attach local stream to the local preview video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, swapped]);

  useEffect(() => {
    if (!activeCall) {
      navigate('/');
      return;
    }

    if (activeCall.isMinimized) {
      // If we are on this screen but state says minimized, we must have just restored it.
      // Wait, the logic in App.tsx handles navigation on restore. 
      // We just need to ensure if we are HERE, we shouldn't be minimized in state.
    }

    const timer = setInterval(() => {
      setSeconds(Math.floor((Date.now() - (activeCall?.startTime || Date.now())) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [activeCall, navigate]);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleEndCall = () => {
    cleanup();
    endCall();
    navigate(-1);
  };

  const handleMinimize = () => {
    toggleMinimizeCall(true);
    // Navigation is handled by the user navigating away, or we can force it
    navigate(-1);
  };

  const fragments = useMemo(() => Array.from({ length: 15 }).map((_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    size: Math.random() * 3 + 1,
    duration: Math.random() * 8 + 4
  })), []);

  if (!activeCall || activeCall.isMinimized || !contact) return null;

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-black animate-fade-in z-[100]">
      {/* Background Feed Container */}
      <div className="absolute inset-0 z-0 overflow-hidden transform-gpu bg-black">
        <video
          ref={bgVideoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700 animate-slow-breath opacity-60"
        />

        {/* Dark Dramatic Overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/60"></div>
        <div className="absolute inset-0 bg-black/20"></div>

        {/* Floating Soul Fragments */}
        {fragments.map(f => (
          <div
            key={f.id}
            className="absolute bg-white/10 rounded-full animate-blob blur-[1px]"
            style={{
              left: f.left,
              top: f.top,
              width: f.size,
              height: f.size,
              animationDuration: `${f.duration}s`,
              animationDelay: `${f.id * 0.2}s`
            }}
          />
        ))}
      </div>

      {/* Header */}
      <header className="relative z-20 flex items-center justify-between p-6 pt-12 animate-slide-up transform-gpu">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <div className={`size-2 rounded-full ${activeCall.isMuted ? 'bg-danger shadow-[0_0_10px_#ef4444]' : 'bg-primary shadow-[0_0_10px_var(--color-primary)]'} animate-pulse`}></div>
            <h2 className="text-white text-lg font-black tracking-tight uppercase">{swapped ? "Local Stream" : contact.name}</h2>
          </div>
          <p className="text-white/40 text-[9px] font-black uppercase tracking-[0.3em] ml-4 tabular-nums">{formatTime(seconds)}</p>
        </div>
        <button onClick={handleMinimize} className="size-11 rounded-full bg-white/10 backdrop-blur-2xl flex items-center justify-center border border-white/20 active:scale-90 transition-all shadow-2xl">
          <span className="material-symbols-outlined text-[20px] text-white/80">close_fullscreen</span>
        </button>
      </header>

      {/* Local Preview (Floating PiP) */}
      <div
        onClick={() => setSwapped(!swapped)}
        className="absolute z-40 top-24 right-6 w-28 aspect-[3/4] rounded-[2.5rem] overflow-hidden border border-white/30 shadow-[0_20px_50px_rgba(0,0,0,0.5)] cursor-pointer active:scale-95 transition-all transform-gpu hover:scale-105"
      >
        <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover pointer-events-none" />
        <div className="absolute inset-0 bg-black/10"></div>
      </div>

      {/* Controls Area */}
      <div className="mt-auto relative z-30 pb-12 px-6 animate-slide-up transform-gpu">
        <div className="liquid-glass max-w-sm mx-auto rounded-full p-2.5 flex items-center justify-between mb-8 shadow-[0_20px_60px_rgba(0,0,0,0.8)] border-white/10">
          <button
            onClick={toggleMute}
            className={`size-14 rounded-full flex items-center justify-center transition-all active:scale-90 ${activeCall.isMuted ? 'bg-danger text-white shadow-lg' : 'bg-white/5 hover:bg-white/10 text-white'}`}
          >
            <span className="material-symbols-outlined text-[24px]">{activeCall.isMuted ? 'mic_off' : 'mic'}</span>
          </button>

          <button
            onClick={handleEndCall}
            className="size-20 rounded-full bg-danger flex items-center justify-center shadow-[0_0_40px_rgba(239,68,68,0.6)] active:scale-90 transition-all border-4 border-black/20"
          >
            <span className="material-symbols-outlined text-[36px] fill-1 text-white">call_end</span>
          </button>

          <button className={`size-14 rounded-full bg-white/5 flex items-center justify-center transition-all active:scale-90 hover:bg-white/10 text-white`}>
            <span className="material-symbols-outlined text-[24px]">switch_video</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoCallScreen;
