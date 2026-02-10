
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../AppContext.tsx';
import { Message, Song } from '../types.ts';
import { GoogleGenAI } from "@google/genai";

const MusicPlayerSaavn: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { musicState, playSong, togglePlayMusic, toggleFavoriteSong } = useApp();
  const [searchResults, setSearchResults] = useState<Song[]>([]);
  const [progress, setProgress] = useState(0);
  const [activeTab, setActiveTab] = useState<'discovery' | 'favorites'>('discovery');
  const lastClickTime = useRef<{ [key: string]: number }>({});

  useEffect(() => {
    if (isOpen && activeTab === 'discovery') {
      fetch(`https://saavn.sumit.co/api/search/songs?query=TopHits`)
        .then(res => res.json())
        .then(data => {
          const songs = data?.data?.results?.map((s: any) => ({
            id: s.id,
            name: s.name,
            artist: s.primaryArtists,
            image: s.image?.[2]?.url || s.image?.[1]?.url || '',
            url: s.downloadUrl?.[s.downloadUrl.length - 1]?.url || ''
          })).filter((s: any) => s.url);
          setSearchResults(songs || []);
        }).catch(() => {});
    }
  }, [isOpen, activeTab]);

  useEffect(() => {
    let interval: any;
    if (musicState.isPlaying) {
      interval = setInterval(() => {
        setProgress(p => (p + 0.1) % 100);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [musicState.isPlaying]);

  const handleSongInteraction = (song: Song) => {
    const now = Date.now();
    const lastTime = lastClickTime.current[song.id] || 0;
    
    if (now - lastTime < 300) {
      // Double tap detected
      toggleFavoriteSong(song);
      if (window.navigator.vibrate) window.navigator.vibrate(40);
      // Optional: show a heart animation overlay
    } else {
      // Single tap - play the song
      playSong(song);
    }
    lastClickTime.current[song.id] = now;
  };

  const isFavorite = (songId: string) => musicState.favorites.some(s => s.id === songId);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-md animate-fade-in" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-[200] bg-[#09090b]/95 backdrop-blur-3xl border-t border-white/10 rounded-t-[3rem] flex flex-col shadow-[0_-40px_100px_rgba(0,0,0,1)] overflow-hidden animate-spring-up" style={{ height: '80%' }}>
        {/* Drag Handle */}
        <div className="flex flex-col items-center pt-4 pb-2 shrink-0 cursor-pointer" onClick={onClose}>
          <div className="w-12 h-1 bg-white/20 rounded-full mb-4"></div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-6 pb-32">
          {/* Active Player State */}
          <div className="flex flex-col items-center text-center mb-8 mt-2">
            <div className="relative mb-6">
              <div className={`size-44 rounded-[2.5rem] overflow-hidden border border-white/10 shadow-2xl transition-all duration-1000 ${musicState.isPlaying ? 'scale-105 rotate-2' : 'scale-95'}`}>
                <img 
                  src={musicState.currentSong?.image || 'https://images.unsplash.com/photo-1614850523296-d8c1af93d400?w=400&h=400&fit=crop'} 
                  className="w-full h-full object-cover grayscale-[0.2] contrast-[1.1]" 
                  alt="" 
                />
              </div>
              {musicState.isPlaying && (
                <div className="absolute -inset-4 bg-primary/20 blur-[40px] animate-pulse rounded-full -z-10" />
              )}
            </div>

            <h2 className="text-xl font-black text-white tracking-tighter uppercase mb-1 truncate w-full px-4">
              {musicState.currentSong?.name || "Neural Silence"}
            </h2>
            <p className="text-primary text-[9px] font-black uppercase tracking-[0.4em] opacity-80 mb-6">
              {musicState.currentSong?.artist || "Standby for Sync"}
            </p>

            <div className="w-full space-y-6">
              <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-1000 shadow-[0_0_10px_var(--color-primary)]" 
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              
              <div className="flex items-center justify-between px-6">
                <button className="text-white/20 ios-active hover:text-white/40"><span className="material-symbols-outlined text-[24px]">shuffle</span></button>
                <div className="flex items-center gap-6">
                  <button className="text-white/40 ios-active hover:text-white"><span className="material-symbols-outlined text-[28px] fill-1">skip_previous</span></button>
                  <button 
                    onClick={togglePlayMusic} 
                    className="size-16 rounded-full bg-white flex items-center justify-center text-black shadow-[0_0_40px_rgba(255,255,255,0.2)] ios-active transition-all active:scale-90"
                  >
                    <span className="material-symbols-outlined text-[40px] fill-1">
                      {musicState.isPlaying ? 'pause' : 'play_arrow'}
                    </span>
                  </button>
                  <button className="text-white/40 ios-active hover:text-white"><span className="material-symbols-outlined text-[28px] fill-1">skip_next</span></button>
                </div>
                <button className="text-white/20 ios-active hover:text-white/40"><span className="material-symbols-outlined text-[24px]">repeat</span></button>
              </div>
            </div>
          </div>

          {/* Section Switcher */}
          <div className="flex justify-center mb-8">
            <div className="bg-white/[0.03] p-1 rounded-full border border-white/10 flex relative w-full max-w-[280px]">
              <button 
                onClick={() => setActiveTab('discovery')}
                className={`flex-1 text-center py-2.5 px-4 rounded-full text-[9px] font-black uppercase tracking-widest z-10 transition-all duration-500 ${activeTab === 'discovery' ? 'bg-primary text-white shadow-lg' : 'text-white/30'}`}
              >
                Discovery
              </button>
              <button 
                onClick={() => setActiveTab('favorites')}
                className={`flex-1 text-center py-2.5 px-4 rounded-full text-[9px] font-black uppercase tracking-widest z-10 transition-all duration-500 ${activeTab === 'favorites' ? 'bg-accent text-white shadow-lg' : 'text-white/30'}`}
              >
                Collection ({musicState.favorites.length})
              </button>
            </div>
          </div>

          {/* List Content */}
          <div className="space-y-4 animate-fade-in" key={activeTab}>
            {activeTab === 'discovery' ? (
              <>
                <div className="flex items-center justify-between px-2">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-white/20">Global Sync</h3>
                  <span className="text-[8px] font-bold text-white/10 uppercase italic">Double tap to like</span>
                </div>
                <div className="grid grid-cols-1 gap-2.5">
                  {searchResults.map((song, i) => (
                    <div 
                      key={song.id} 
                      onClick={() => handleSongInteraction(song)}
                      className={`flex items-center gap-4 p-3.5 rounded-[1.6rem] border transition-all ios-active ${musicState.currentSong?.id === song.id ? 'bg-primary/20 border-primary/40' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                    >
                      <div className="size-12 rounded-xl overflow-hidden shadow-lg flex-none">
                        <img src={song.image} className="w-full h-full object-cover" alt="" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-black text-white truncate uppercase tracking-tight mb-0.5">{song.name}</p>
                        <p className="text-[9px] font-bold text-white/30 truncate uppercase tracking-widest">{song.artist}</p>
                      </div>
                      <div className="flex items-center gap-3 pr-1">
                        {isFavorite(song.id) && (
                          <span className="material-symbols-outlined text-[18px] text-primary fill-1 animate-pulse">favorite</span>
                        )}
                        {musicState.currentSong?.id === song.id && musicState.isPlaying && (
                          <div className="flex gap-1 h-3 items-end">
                            {[0.4, 0.8, 0.6].map((h, j) => (
                              <div key={j} className="w-0.5 bg-primary rounded-full animate-bounce" style={{ height: `${h * 100}%`, animationDelay: `${j * 0.15}s` }}></div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-white/20 px-2">Liked Tracks</h3>
                {musicState.favorites.length === 0 ? (
                  <div className="h-40 flex flex-col items-center justify-center text-white/5 border border-white/5 border-dashed rounded-[2rem]">
                    <span className="material-symbols-outlined text-4xl mb-3 opacity-10">favorite</span>
                    <p className="text-[9px] font-black uppercase tracking-[0.3em] opacity-20 text-center px-10 leading-relaxed">Your neural collection is empty.<br/>Like songs in Discovery Matrix.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2.5">
                    {musicState.favorites.map((song, i) => (
                      <div 
                        key={song.id} 
                        onClick={() => playSong(song)}
                        className={`flex items-center gap-4 p-3.5 rounded-[1.6rem] border transition-all ios-active ${musicState.currentSong?.id === song.id ? 'bg-accent/20 border-accent/40 shadow-lg' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                      >
                        <div className="size-12 rounded-xl overflow-hidden shadow-lg flex-none">
                          <img src={song.image} className="w-full h-full object-cover" alt="" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-black text-white truncate uppercase tracking-tight mb-0.5">{song.name}</p>
                          <p className="text-[9px] font-bold text-white/30 truncate uppercase tracking-widest">{song.artist}</p>
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); toggleFavoriteSong(song); }}
                          className="size-10 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[20px] text-accent fill-1">favorite</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

const CallChoiceMenu: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void;
  onVoice: () => void;
  onVideo: () => void;
}> = ({ isOpen, onClose, onVoice, onVideo }) => {
  if (!isOpen) return null;
  return (
    <>
      <div className="fixed inset-0 z-[140] bg-black/40 backdrop-blur-[12px]" onClick={onClose} />
      <div className="absolute top-24 right-6 w-56 z-[150] liquid-glass rounded-[2rem] p-2 flex flex-col gap-1 shadow-[0_40px_100px_rgba(0,0,0,0.9)] border border-white/10 animate-ios-pop origin-top-right">
        <button 
          onClick={(e) => { e.stopPropagation(); onVoice(); onClose(); }}
          className="flex items-center gap-3 w-full px-4 py-3 hover:bg-white/10 rounded-[1.4rem] transition-all active:scale-95 group"
        >
          <div className="size-9 rounded-full bg-white/5 flex items-center justify-center border border-white/10 group-hover:bg-primary/20 transition-all shadow-lg">
            <span className="material-symbols-outlined text-[18px] text-primary">call</span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[10px] font-black uppercase tracking-wider text-white group-hover:text-primary transition-colors">Neural Voice</span>
            <span className="text-[7px] font-bold uppercase tracking-widest text-white/30">Secure Link</span>
          </div>
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); onVideo(); onClose(); }}
          className="flex items-center gap-3 w-full px-4 py-3 hover:bg-white/10 rounded-[1.4rem] transition-all active:scale-95 group"
        >
          <div className="size-9 rounded-full bg-white/5 flex items-center justify-center border border-white/10 group-hover:bg-accent/20 transition-all shadow-lg">
            <span className="material-symbols-outlined text-[18px] text-accent">videocam</span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[10px] font-black uppercase tracking-wider text-white group-hover:text-accent transition-colors">Spectral Video</span>
            <span className="text-[7px] font-bold uppercase tracking-widest text-white/30">Full Optic Sync</span>
          </div>
        </button>
      </div>
    </>
  );
};

const NeuralGalleryModal: React.FC<{ isOpen: boolean; onSelect: (url: string) => void; onClose: () => void }> = ({ isOpen, onSelect, onClose }) => {
  if (!isOpen) return null;
  const images = [
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1633167606207-d840b5070fc2?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1614850523296-d8c1af93d400?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?w=300&h=300&fit=crop',
  ];

  return (
    <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-fade-in">
      <div className="liquid-glass w-full max-w-md rounded-[3rem] p-6 animate-ios-pop">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-[12px] font-black uppercase tracking-[0.4em] text-primary">Neural Gallery</h3>
          <button onClick={onClose} className="size-8 rounded-full bg-white/5 flex items-center justify-center"><span className="material-symbols-outlined text-[20px]">close</span></button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {images.map((img, i) => (
            <div 
              key={i} 
              onClick={() => onSelect(img)}
              className="aspect-square rounded-2xl overflow-hidden border border-white/10 ios-active cursor-pointer"
            >
              <img src={img} className="w-full h-full object-cover" alt="" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const CaptureFrameModal: React.FC<{ isOpen: boolean; onCapture: (url: string) => void; onClose: () => void }> = ({ isOpen, onCapture, onClose }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[150] bg-black flex flex-col animate-fade-in">
      <div className="flex-1 bg-zinc-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="material-symbols-outlined text-white/5 text-[120px]">photo_camera</span>
        </div>
        <div className="absolute top-12 left-6 right-6 flex justify-between">
          <button onClick={onClose} className="size-11 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10"><span className="material-symbols-outlined">close</span></button>
          <button className="size-11 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10"><span className="material-symbols-outlined">flash_on</span></button>
        </div>
      </div>
      <div className="h-40 bg-black flex items-center justify-center px-10">
        <button 
          onClick={() => onCapture('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&fit=crop')}
          className="size-20 rounded-full border-4 border-white flex items-center justify-center active:scale-90 transition-transform"
        >
          <div className="size-16 rounded-full bg-white scale-90" />
        </button>
      </div>
    </div>
  );
};

const MediaShareMenu: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void;
  onGallery: () => void;
  onCapture: () => void;
  onFile: () => void;
  onLocation: () => void;
}> = ({ isOpen, onClose, onGallery, onCapture, onFile, onLocation }) => {
  if (!isOpen) return null;
  return (
    <>
      <div className="fixed inset-0 z-[140] bg-black/40 backdrop-blur-[12px]" onClick={onClose} />
      <div className="absolute bottom-20 left-0 w-64 z-[150] liquid-glass rounded-[2rem] p-2 flex flex-col gap-1 shadow-[0_40px_100px_rgba(0,0,0,0.9)] border border-white/10 animate-ios-pop origin-bottom-left">
        {[
          { icon: 'image', label: 'Neural Gallery', color: 'text-primary', onClick: onGallery },
          { icon: 'photo_camera', label: 'Capture Frame', color: 'text-accent', onClick: onCapture },
          { icon: 'description', label: 'Data Fragments', color: 'text-blue-400', onClick: onFile },
          { icon: 'location_on', label: 'Sync Location', color: 'text-green-400', onClick: onLocation }
        ].map((item, idx) => (
          <button 
            key={idx}
            onClick={(e) => { e.stopPropagation(); item.onClick(); onClose(); }}
            className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-white/10 rounded-[1.4rem] transition-all active:scale-95 group"
          >
            <div className="size-9 rounded-full bg-white/5 flex items-center justify-center border border-white/10 group-hover:scale-110 group-hover:bg-white/10 transition-all shadow-lg">
              <span className={`material-symbols-outlined text-[18px] ${item.color}`}>{item.icon}</span>
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 group-hover:text-white transition-colors">{item.label}</span>
          </button>
        ))}
      </div>
    </>
  );
};

const DeleteMenu: React.FC<{ messageId: string; onConfirm: () => void; onCancel: () => void }> = ({ onConfirm, onCancel }) => (
  <>
    <div className="fixed inset-0 z-[200] bg-black/20 backdrop-blur-[4px]" onClick={onCancel} />
    <div className="absolute top-0 right-0 z-[210] animate-ios-pop origin-top-right">
       <button 
         onClick={(e) => { e.stopPropagation(); onConfirm(); }}
         className="bg-danger/80 backdrop-blur-xl border border-white/20 text-white px-4 py-2 rounded-full flex items-center gap-2 shadow-2xl active:scale-95 transition-all"
       >
         <span className="material-symbols-outlined text-sm">delete</span>
         <span className="text-[10px] font-black uppercase tracking-widest">Wipe Data</span>
       </button>
    </div>
  </>
);

const MessageReceipts: React.FC<{ status?: 'sent' | 'delivered' | 'read' }> = ({ status }) => {
  if (!status) return null;
  return (
    <div className="flex items-center ml-1 opacity-60">
      {status === 'sent' && (
        <span className="material-symbols-outlined text-[12px] text-white/40">check</span>
      )}
      {status === 'delivered' && (
        <div className="flex -space-x-1.5">
          <span className="material-symbols-outlined text-[12px] text-white/40">check</span>
          <span className="material-symbols-outlined text-[12px] text-white/40">check</span>
        </div>
      )}
      {status === 'read' && (
        <div className="flex -space-x-1.5 drop-shadow-[0_0_5px_rgba(244,63,94,0.6)]">
          <span className="material-symbols-outlined text-[12px] text-primary font-bold">check</span>
          <span className="material-symbols-outlined text-[12px] text-primary font-bold">check</span>
        </div>
      )}
    </div>
  );
};

const SingleChatScreen: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { messages, contacts, addMessage, updateMessageStatus, deleteMessage, userName, startCall, musicState } = useApp();
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showMediaMenu, setShowMediaMenu] = useState(false);
  const [showCallMenu, setShowCallMenu] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showMusicPlayer, setShowMusicPlayer] = useState(false);
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const longPressTimer = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const contact = contacts.find(c => c.id === id);
  const chatMessages = messages[id || ''] || [];

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) transcript += event.results[i][0].transcript;
        }
        if (transcript) setInputText(prev => (prev ? prev + ' ' : '') + transcript);
      };
      recognition.onerror = () => setIsRecording(false);
      recognition.onend = () => setIsRecording(false);
      recognitionRef.current = recognition;
    }
  }, []);

  // Use correct variable name 'isTyping' instead of 'i.isTyping' in the dependency array
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isTyping]);

  const handleSendMessage = async (text?: string, media?: Message['media']) => {
    if (!id || !contact) return;
    const content = text || inputText.trim();
    if (!content && !media) return;
    
    const msgId = addMessage(id, content, 'me', media);
    if (!text) setInputText('');
    
    setTimeout(() => {
      updateMessageStatus(id, msgId, 'delivered');
    }, 1200);

    setIsTyping(true);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const history = chatMessages.slice(-5).map(m => `${m.sender === 'me' ? userName : contact.name}: ${m.text}`).join('\n');
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ parts: [{ text: `You are chatting as ${contact.name} in a futuristic social app called SoulSync. Be immersive, concise, and slightly futuristic. The user's name is ${userName}. History:\n${history}\n${userName}: ${content || '[Media Fragment sent]'}\n${contact.name}:` }] }],
      });
      
      updateMessageStatus(id, msgId, 'read');
      
      setIsTyping(false);
      const reply = response.text || "Connection unstable.";
      addMessage(id, reply, 'them');
    } catch (e) {
      console.error(e);
      setIsTyping(false);
      addMessage(id, "Neural link dropped. Re-syncing...", 'them');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && id) {
      handleSendMessage('', { type: 'file', url: '#', name: file.name });
    }
  };

  const handleStartAudioCall = () => {
    if (!id) return;
    startCall(id, 'audio');
    navigate(`/audio-call/${id}`);
  };

  const handleStartVideoCall = () => {
    if (!id) return;
    startCall(id, 'video');
    navigate(`/video-call/${id}`);
  };

  const toggleRecording = () => {
    if (!recognitionRef.current) return alert("System not compatible.");
    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (e) { console.error(e); }
    }
  };

  const handleActionClick = () => {
    inputText.trim() ? handleSendMessage() : toggleRecording();
  };

  const handleMsgTouchStart = (msgId: string) => {
    longPressTimer.current = setTimeout(() => {
      setSelectedMsgId(msgId);
      if (window.navigator.vibrate) window.navigator.vibrate(50);
    }, 600);
  };

  const handleMsgTouchStartWrapper = (msgId: string) => {
    handleMsgTouchStart(msgId);
  }

  const handleMsgTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const handleDeleteConfirm = (msgId: string) => {
    if (id) deleteMessage(id, msgId);
    setSelectedMsgId(null);
  };

  if (!contact) return null;

  return (
    <div className="relative min-h-screen flex flex-col bg-transparent overflow-hidden animate-fade-in" onClick={() => {
      setSelectedMsgId(null);
      setShowCallMenu(false);
    }}>
      {/* Hidden File Input */}
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        onChange={handleFileSelect}
      />

      <NeuralGalleryModal 
        isOpen={showGallery} 
        onClose={() => setShowGallery(false)} 
        onSelect={(url) => {
          handleSendMessage('', { type: 'image', url });
          setShowGallery(false);
        }} 
      />

      <CaptureFrameModal 
        isOpen={showCamera} 
        onClose={() => setShowCamera(false)} 
        onCapture={(url) => {
          handleSendMessage('', { type: 'image', url });
          setShowCamera(false);
        }} 
      />

      <CallChoiceMenu 
        isOpen={showCallMenu} 
        onClose={() => setShowCallMenu(false)} 
        onVoice={handleStartAudioCall} 
        onVideo={handleStartVideoCall} 
      />

      <MusicPlayerSaavn 
        isOpen={showMusicPlayer} 
        onClose={() => setShowMusicPlayer(false)} 
      />

      {/* Fixed Immersive Header */}
      <header className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-between px-6 pt-[calc(1rem+env(safe-area-inset-top,10px))] pb-5 bg-black/60 backdrop-blur-[60px] border-b border-white/[0.08] shadow-2xl">
        <div className="flex items-center gap-4 min-w-0">
          <button onClick={() => navigate(-1)} className="ios-active flex items-center justify-center size-10 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
            <span className="material-symbols-outlined text-white/80 text-[20px]">arrow_back</span>
          </button>
          
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate(`/profile/${contact.id}`)}>
             <div className="relative">
                <div className="size-11 rounded-full border border-primary/20 p-0.5">
                  <img src={contact.avatar} className="w-full h-full rounded-full object-cover" alt="" />
                </div>
                {contact.status === 'online' && (
                  <div className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-primary border-2 border-black"></div>
                )}
             </div>
             <div className="flex flex-col">
                <h2 className="text-white text-[15px] font-black uppercase tracking-tight leading-none">{contact.name}</h2>
                <span className="text-[8px] font-black text-primary tracking-[0.25em] uppercase mt-1.5 flex items-center gap-1.5">
                  Active Sync
                </span>
             </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowMusicPlayer(!showMusicPlayer)}
            className={`size-10 rounded-full ios-active border flex items-center justify-center transition-all ${
              showMusicPlayer || musicState.isPlaying 
                ? 'bg-primary/20 border-primary text-primary shadow-[0_0_15px_rgba(244,63,94,0.3)]' 
                : 'bg-white/5 border-white/10 text-white/40 hover:text-white'
            }`}
          >
            <span className={`material-symbols-outlined text-[22px] ${musicState.isPlaying ? 'animate-spin-slow' : ''}`}>music_note</span>
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); setShowCallMenu(!showCallMenu); }} 
            className={`size-10 rounded-full ios-active border flex items-center justify-center transition-all ${showCallMenu ? 'bg-primary/20 border-primary text-primary' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}
          >
            <span className="material-symbols-outlined text-[22px]">call</span>
          </button>
        </div>
      </header>

      {/* Main Chat Feed */}
      <main className="flex-1 overflow-y-auto px-6 pt-[calc(90px+env(safe-area-inset-top,16px))] pb-32 space-y-7 no-scrollbar scroll-smooth">
        {chatMessages.length === 0 ? (
          <div className="h-[50vh] flex flex-col items-center justify-center text-white/5">
             <span className="material-symbols-outlined text-[48px] mb-4 opacity-10">lock_open</span>
             <p className="text-[10px] font-black uppercase tracking-[0.4em] opacity-20">Secure Channel Established</p>
          </div>
        ) : (
          chatMessages.map((msg, i) => (
            <div 
              key={msg.id} 
              className={`flex flex-col ${msg.sender === 'me' ? 'items-end' : 'items-start'} stagger-item group relative`} 
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div 
                onMouseDown={() => handleMsgTouchStartWrapper(msg.id)}
                onMouseUp={handleMsgTouchEnd}
                onMouseLeave={handleMsgTouchEnd}
                onTouchStart={() => handleMsgTouchStartWrapper(msg.id)}
                onTouchEnd={handleMsgTouchEnd}
                className={`relative px-5 py-4 max-w-[85%] shadow-xl transition-all duration-300 select-none ${msg.sender === 'me' ? 'bubble-me' : 'bubble-them'} ${selectedMsgId === msg.id ? 'scale-[0.98] ring-1 ring-white/20 blur-[1px]' : 'active:scale-[0.99]'}`}
              >
                {msg.media && (
                  <div className="mb-3">
                    {msg.media.type === 'image' ? (
                      <img src={msg.media.url} className="rounded-xl w-full max-h-60 object-cover border border-white/10 shadow-lg" alt="" />
                    ) : (
                      <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/10">
                        <span className="material-symbols-outlined text-primary">description</span>
                        <div className="min-w-0">
                          <p className="text-[12px] font-bold text-white truncate">{msg.media.name}</p>
                          <p className="text-[9px] font-black text-white/20 uppercase tracking-widest">Data Fragment</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {msg.text && (
                  <p className="text-[14.5px] leading-relaxed font-medium text-white/95 break-words">{msg.text}</p>
                )}
                {selectedMsgId === msg.id && (
                  <DeleteMenu 
                    messageId={msg.id} 
                    onConfirm={() => handleDeleteConfirm(msg.id)} 
                    onCancel={() => setSelectedMsgId(null)} 
                  />
                )}
              </div>
              <div className="flex items-center mt-2 px-2">
                <span className="text-[9px] text-white/20 font-black uppercase tracking-widest tabular-nums">{msg.timestamp}</span>
                {msg.sender === 'me' && <MessageReceipts status={msg.status} />}
              </div>
            </div>
          ))
        )}
        {isTyping && (
          <div className="flex gap-2 items-center pl-2 py-3">
            {[0, 0.2, 0.4].map(d => (
              <div key={d} className="size-1.5 rounded-full bg-primary/30 animate-bounce" style={{ animationDelay: `${d}s` }}></div>
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Futuristic Fixed Footer - Slimmer & Smaller UI */}
      <footer className="fixed bottom-0 left-0 right-0 px-6 pb-[calc(1.2rem+env(safe-area-inset-bottom,20px))] pt-4 bg-gradient-to-t from-black via-black/80 to-transparent z-[80]">
        <div className="flex items-center gap-2.5 animate-spring-up max-w-xl mx-auto">
          {/* Media Pod */}
          <div className="relative">
            <MediaShareMenu 
              isOpen={showMediaMenu} 
              onClose={() => setShowMediaMenu(false)}
              onGallery={() => setShowGallery(true)}
              onCapture={() => setShowCamera(true)}
              onFile={() => fileInputRef.current?.click()}
              onLocation={() => handleSendMessage('[Sync Location: User Current Coordinates]')}
            />
            <button 
              onClick={() => setShowMediaMenu(!showMediaMenu)}
              className={`size-11 rounded-full flex items-center justify-center transition-all duration-500 ios-active liquid-glass border-white/10 shrink-0 shadow-2xl ${
                showMediaMenu ? 'bg-primary/30 text-primary rotate-[135deg] border-primary/40' : 'text-white/50 hover:text-white hover:bg-white/10'
              }`}
            >
              <span className="material-symbols-outlined text-[20px] font-bold">add</span>
            </button>
          </div>

          {/* Input Pod */}
          <div className="flex-1 h-11 liquid-glass rounded-[1.4rem] flex items-center px-4 border-white/10 bg-black/40 shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)] group focus-within:border-primary/30 focus-within:ring-1 focus-within:ring-primary/10 transition-all duration-300">
            <input 
              value={inputText} 
              onChange={(e) => setInputText(e.target.value)} 
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} 
              className="flex-1 bg-transparent border-none text-[13px] text-white placeholder:text-white/20 focus:ring-0 font-medium tracking-tight" 
              placeholder={isRecording ? "Listening..." : "Sync fragment..."} 
            />
          </div>

          {/* Action Pod */}
          <button 
            onClick={handleActionClick} 
            className={`size-11 rounded-full flex items-center justify-center transition-all duration-500 ios-active shrink-0 liquid-glass border-white/10 shadow-2xl ${
              inputText.trim() 
                ? 'bg-primary/25 text-primary border-primary/40 scale-105 shadow-primary/20' 
                : isRecording 
                  ? 'bg-danger/25 text-danger border-danger/40 animate-pulse' 
                  : 'text-white/50 hover:text-white hover:bg-white/10'
            }`}
          >
            <span className="material-symbols-outlined text-[20px] font-bold">
              {inputText.trim() ? 'arrow_upward' : 'mic'}
            </span>
          </button>
        </div>
      </footer>
    </div>
  );
};

export default SingleChatScreen;
