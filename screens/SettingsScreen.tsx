
import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, THEMES, ThemeName } from '../AppContext.tsx';

type ViewType = 'main' | 'theme' | 'privacy' | 'notification' | 'help' | 'account';

interface ImageAdjustModalProps {
  imageSrc: string;
  onCancel: () => void;
  onConfirm: (croppedImage: string) => void;
}

const ImageAdjustModal: React.FC<ImageAdjustModalProps> = ({ imageSrc, onCancel, onConfirm }) => {
  const [scale, setScale] = useState(1);
  const [minScale, setMinScale] = useState(0.1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  
  const dragStart = useRef({ x: 0, y: 0 });
  const initialOffset = useRef({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerSize = 280;

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const { naturalWidth, naturalHeight } = img;
    const scaleX = containerSize / naturalWidth;
    const scaleY = containerSize / naturalHeight;
    const initialFitScale = Math.max(scaleX, scaleY);
    setScale(initialFitScale);
    setMinScale(initialFitScale); 
    setIsLoaded(true);
  };

  const handleStart = (clientX: number, clientY: number) => {
    if (!isLoaded) return;
    setIsDragging(true);
    dragStart.current = { x: clientX, y: clientY };
    initialOffset.current = { ...offset };
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (!isDragging) return;
    const dx = clientX - dragStart.current.x;
    const dy = clientY - dragStart.current.y;
    setOffset({
      x: initialOffset.current.x + dx,
      y: initialOffset.current.y + dy
    });
  };

  const handleEnd = () => setIsDragging(false);

  const processCrop = () => {
    if (!imgRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const exportSize = 400;
    canvas.width = exportSize;
    canvas.height = exportSize;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, exportSize, exportSize);

    const img = imgRef.current;
    const renderWidth = img.naturalWidth * scale;
    const renderHeight = img.naturalHeight * scale;
    const factor = exportSize / containerSize;
    const exportWidth = renderWidth * factor;
    const exportHeight = renderHeight * factor;
    const exportX = (exportSize / 2) - (exportWidth / 2) + (offset.x * factor);
    const exportY = (exportSize / 2) - (exportHeight / 2) + (offset.y * factor);

    ctx.drawImage(img, exportX, exportY, exportWidth, exportHeight);
    onConfirm(canvas.toDataURL('image/jpeg', 0.9));
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black animate-fade-in flex flex-col items-center justify-center p-6 backdrop-blur-3xl">
      <div className="text-center mb-12">
        <h3 className="text-xl font-black text-white/40 uppercase tracking-[0.25em]">Profile Editor</h3>
        <p className="text-[10px] font-black text-primary uppercase tracking-[0.4em] mt-3">Adjust Photo</p>
      </div>
      
      <div 
        className="relative size-[280px] rounded-full cursor-move touch-none bg-zinc-900 group overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.5)]"
        onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
        onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={(e) => handleStart(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchMove={(e) => handleMove(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchEnd={handleEnd}
      >
        <img 
          ref={imgRef}
          src={imageSrc} 
          onLoad={handleImageLoad}
          draggable={false}
          className={`absolute max-w-none transition-opacity duration-500 pointer-events-none z-10 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
          style={{ 
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            top: '50%',
            left: '50%',
            translate: '-50% -50%',
            willChange: 'transform'
          }}
          alt="" 
        />
        <div className="absolute inset-0 rounded-full border border-white/5 pointer-events-none z-20"></div>
      </div>

      <div className="w-full max-w-xs mt-16 grid grid-cols-2 gap-5 animate-slide-up">
        <button 
          onClick={onCancel} 
          className="h-14 rounded-[1.8rem] bg-white/[0.03] border border-white/5 text-[10px] font-black uppercase tracking-widest text-white/30 ios-active hover:bg-white/5 transition-colors"
        >
          Cancel
        </button>
        <button 
          onClick={processCrop} 
          disabled={!isLoaded} 
          className="h-14 rounded-[1.8rem] bg-primary text-white text-[10px] font-black uppercase tracking-widest shadow-[0_15px_35px_rgba(244,63,94,0.25)] ios-active transition-transform disabled:opacity-50"
        >
          Confirm
        </button>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

const SettingsScreen: React.FC = () => {
  const { userName, userAvatar, updateUserName, updateUserAvatar, theme, setTheme } = useApp();
  const [view, setView] = useState<ViewType>('main');
  const [adjustingImage, setAdjustingImage] = useState<string | null>(null);
  const [status, setStatus] = useState("Exploring the soul sync.");
  const [notifStates, setNotifStates] = useState({ haptics: true, flash: false, audio: true });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  
  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setAdjustingImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleConfirmCrop = (croppedBase64: string) => {
    updateUserAvatar(croppedBase64);
    setAdjustingImage(null);
  };

  const handleLogout = () => {
    if (confirm("Are you sure you want to logout? All local data will be reset.")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  const menuItems = [
    { id: 'account', name: 'Account', sub: 'Security, change number', icon: 'key', color: 'text-primary' },
    { id: 'privacy', name: 'Privacy', sub: 'Block contacts, disappearing messages', icon: 'lock', color: 'text-blue-400' },
    { id: 'theme', name: 'Chats', sub: 'Theme, wallpapers, history', icon: 'chat', color: 'text-accent' },
    { id: 'notification', name: 'Notifications', sub: 'Message, group & call tones', icon: 'notifications', color: 'text-green-400' },
    { id: 'help', name: 'Help', sub: 'Help center, contact us', icon: 'help', color: 'text-white/40' },
  ];

  const renderContent = () => {
    switch(view) {
      case 'account':
        return (
          <div className="space-y-8 animate-slide-up px-2 pb-10">
            <div className="flex flex-col items-center gap-8">
              <div onClick={handleAvatarClick} className="relative group cursor-pointer">
                <div className="absolute inset-0 bg-primary/20 blur-[40px] rounded-full group-hover:bg-primary/30 transition-all"></div>
                <div className="relative size-36 rounded-full border border-primary/20 p-1 bg-black/50 backdrop-blur-xl">
                  <div className="w-full h-full rounded-full bg-center bg-cover overflow-hidden" style={{ backgroundImage: `url("${userAvatar}")` }}></div>
                </div>
                <div className="absolute bottom-2 right-2 size-10 rounded-full bg-primary border-4 border-black flex items-center justify-center text-white shadow-xl">
                  <span className="material-symbols-outlined text-lg">add_a_photo</span>
                </div>
              </div>
              
              <div className="w-full space-y-5">
                <div className="space-y-2.5">
                  <label className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em] ml-6">Name</label>
                  <div className="liquid-glass rounded-[2rem] px-6 h-14 flex items-center gap-4 border-white/5 focus-within:border-primary/30 transition-all">
                    <span className="material-symbols-outlined text-white/20 text-lg">person</span>
                    <input 
                      type="text" 
                      value={userName} 
                      onChange={(e) => updateUserName(e.target.value)}
                      className="bg-transparent border-none text-white text-[15px] font-bold focus:ring-0 w-full placeholder:text-white/10"
                      placeholder="Your name..."
                    />
                  </div>
                </div>

                <div className="space-y-2.5">
                  <label className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em] ml-6">About</label>
                  <div className="liquid-glass rounded-[2rem] px-6 h-14 flex items-center gap-4 border-white/5 focus-within:border-primary/30 transition-all">
                    <span className="material-symbols-outlined text-white/20 text-lg">info</span>
                    <input 
                      type="text" 
                      value={status} 
                      onChange={(e) => setStatus(e.target.value)}
                      className="bg-transparent border-none text-white text-[14px] font-medium focus:ring-0 w-full placeholder:text-white/10"
                      placeholder="About status..."
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      case 'theme':
        return (
          <div className="space-y-3 animate-slide-up px-2 pb-10">
             {(Object.keys(THEMES) as ThemeName[]).map((t) => (
               <div 
                key={t}
                onClick={() => setTheme(t)}
                className={`liquid-glass rounded-[2rem] p-5 flex items-center justify-between cursor-pointer border-white/5 transition-all group ios-active ${theme === t ? 'border-primary/40 bg-primary/5 shadow-[0_0_30px_rgba(244,63,94,0.1)]' : ''}`}
               >
                 <div className="flex items-center gap-5">
                    <div className="size-11 rounded-2xl border border-white/10 p-1 bg-black/40">
                       <div className="w-full h-full rounded-xl" style={{ backgroundColor: THEMES[t].primary }}></div>
                    </div>
                    <div>
                      <h4 className="font-black text-white text-[13px] uppercase tracking-[0.1em]">{t.replace('-', ' ')}</h4>
                      <p className="text-[9px] text-white/20 font-black uppercase tracking-widest mt-1">Refraction Mode</p>
                    </div>
                 </div>
                 {theme === t && (
                   <div className="size-6 rounded-full bg-primary flex items-center justify-center shadow-[0_0_15px_rgba(244,63,94,0.4)]">
                     <span className="material-symbols-outlined text-[14px] text-white font-black">check</span>
                   </div>
                 )}
               </div>
             ))}
          </div>
        );
      case 'notification':
        return (
          <div className="space-y-3 animate-slide-up px-2 pb-10">
            {[
              { id: 'haptics', label: 'Vibration', sub: 'Haptic feedback on taps', icon: 'vibration' },
              { id: 'flash', label: 'Screen Flash', sub: 'Visual flash for alerts', icon: 'flare' },
              { id: 'audio', label: 'Sound Effects', sub: 'In-app audio cues', icon: 'volume_up' }
            ].map(item => (
              <div 
                key={item.id}
                onClick={() => setNotifStates(prev => ({ ...prev, [item.id]: !prev[item.id as keyof typeof notifStates] }))}
                className="liquid-glass rounded-[2rem] p-5 flex items-center justify-between border-white/5 cursor-pointer ios-active"
              >
                <div className="flex items-center gap-4">
                  <div className="size-10 rounded-full bg-white/5 flex items-center justify-center text-white/20 border border-white/5">
                    <span className="material-symbols-outlined text-lg">{item.icon}</span>
                  </div>
                  <div>
                    <h4 className="text-white font-black text-[12px] uppercase tracking-[0.1em]">{item.label}</h4>
                    <p className="text-[9px] text-white/20 font-black uppercase tracking-widest mt-1">{item.sub}</p>
                  </div>
                </div>
                <div className={`w-10 h-5 rounded-full transition-all duration-500 flex items-center px-1 ${notifStates[item.id as keyof typeof notifStates] ? 'bg-primary shadow-[0_0_15px_rgba(244,63,94,0.3)]' : 'bg-white/10'}`}>
                  <div className={`size-3.5 bg-white rounded-full transition-all transform duration-500 ${notifStates[item.id as keyof typeof notifStates] ? 'translate-x-5' : ''}`}></div>
                </div>
              </div>
            ))}
          </div>
        );
      default:
        return (
          <div className="space-y-3 px-2 pb-10">
            {menuItems.map((item, i) => (
              <div 
                key={item.id} 
                onClick={() => setView(item.id as ViewType)}
                className="liquid-glass rounded-[2rem] p-5 flex items-center justify-between transition-all ios-active cursor-pointer border-white/5 group shadow-xl"
                style={{ animationDelay: `${0.1 + (i * 0.05)}s` }}
              >
                <div className="flex items-center gap-5">
                  <div className="size-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-primary/20 group-hover:bg-primary/5 transition-all">
                    <span className={`material-symbols-outlined ${item.color} text-[22px]`}>{item.icon}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <h4 className="font-black text-[13px] tracking-tight text-white/90 uppercase">{item.name}</h4>
                    <p className="text-[9px] text-white/20 font-black uppercase tracking-[0.15em]">{item.sub}</p>
                  </div>
                </div>
                <span className="material-symbols-outlined text-white/10 text-lg group-hover:text-primary transition-colors">chevron_right</span>
              </div>
            ))}
            
            <button 
              onClick={handleLogout}
              className="mt-8 liquid-glass rounded-[2rem] p-5 flex items-center gap-5 border-danger/20 group ios-active w-full text-left shadow-2xl"
            >
               <div className="size-12 rounded-2xl bg-danger/5 flex items-center justify-center border border-danger/20">
                  <span className="material-symbols-outlined text-danger text-[22px]">logout</span>
                </div>
                <div className="flex flex-col gap-1">
                  <h4 className="font-black text-[13px] tracking-tight text-danger uppercase">Logout</h4>
                  <p className="text-[9px] text-danger/30 font-black uppercase tracking-[0.15em]">Sign out of SoulSync</p>
                </div>
            </button>
          </div>
        );
    }
  };

  if (adjustingImage) return <ImageAdjustModal imageSrc={adjustingImage} onCancel={() => setAdjustingImage(null)} onConfirm={handleConfirmCrop} />;

  return (
    <div className="relative flex h-full w-full flex-col bg-transparent overflow-x-hidden animate-fade-in">
      {/* Header */}
      <header className="sticky top-0 z-[70] bg-black/50 backdrop-blur-[60px] px-6 pt-12 pb-5 border-b border-white/[0.05] flex items-center justify-between shadow-2xl">
        <div className="flex flex-col">
          <h1 className="text-xl font-black tracking-tight text-white uppercase leading-none">
            {view === 'main' ? 'Settings' : view === 'account' ? 'Profile' : view.toUpperCase()}
          </h1>
          <p className="text-[8px] font-black text-primary tracking-[0.4em] uppercase mt-1.5 opacity-60">App Preferences</p>
        </div>
        {view !== 'main' ? (
          <button 
            onClick={() => setView('main')}
            className="size-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 active:text-white transition-all ios-active"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
        ) : (
          <button 
            onClick={() => navigate(-1)}
            className="size-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 active:text-white transition-all ios-active"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        )}
      </header>

      <main className="relative z-10 flex-1 px-5 py-8 space-y-10 pb-48 overflow-y-auto no-scrollbar pt-6">
        {view === 'main' && (
          <section className="flex flex-col items-center animate-slide-up mb-4">
            <div className="relative group cursor-pointer" onClick={() => setView('account')}>
              <div className="absolute inset-0 bg-primary/20 blur-[50px] opacity-60 group-hover:opacity-80 transition-opacity rounded-full"></div>
              <div className="relative size-32 rounded-full p-1 border border-primary/30 shadow-[0_20px_60px_rgba(0,0,0,0.8)] bg-black/40">
                 <div className="w-full h-full rounded-full border border-white/5 bg-center bg-cover overflow-hidden" style={{ backgroundImage: `url("${userAvatar}")` }}></div>
              </div>
              <div className="absolute -bottom-1 -right-1 size-9 rounded-full bg-primary border-4 border-[#09090b] flex items-center justify-center text-white shadow-xl transition-transform hover:scale-110">
                <span className="material-symbols-outlined text-sm font-black">edit</span>
              </div>
            </div>
            <div className="mt-8 text-center space-y-2">
              <h2 className="text-2xl font-black tracking-tight text-white uppercase">{userName}</h2>
              <p className="text-[11px] text-white/30 font-bold tracking-tight italic">"{status}"</p>
            </div>
          </section>
        )}
        
        {renderContent()}
      </main>
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
    </div>
  );
};

export default SettingsScreen;
