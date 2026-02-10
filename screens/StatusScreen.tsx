
import React, { useState, useEffect } from 'react';
import { useApp } from '../AppContext.tsx';

interface ActiveStory {
  id: string;
  name: string;
  avatar: string;
  image: string;
  time: string;
  caption?: string;
}

const StatusComposer: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void; 
  onSync: (caption: string) => void;
  userAvatar: string;
}> = ({ isOpen, onClose, onSync, userAvatar }) => {
  const [caption, setCaption] = useState('');
  const MAX_CHARS = 100;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-2xl flex items-center justify-center p-6 animate-fade-in">
      <div className="liquid-glass w-full max-w-md rounded-[3rem] p-6 animate-ios-pop flex flex-col gap-6">
        <div className="flex justify-between items-center">
          <h3 className="text-[12px] font-black uppercase tracking-[0.4em] text-primary">Status Composer</h3>
          <button onClick={onClose} className="size-8 rounded-full bg-white/5 flex items-center justify-center">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="relative aspect-video rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl">
          <img 
            src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800" 
            className="w-full h-full object-cover grayscale-[0.2] blur-[1px] opacity-40" 
            alt="preview" 
          />
          <div className="absolute inset-0 flex items-center justify-center">
             <span className="material-symbols-outlined text-white/20 text-5xl">photo_library</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center px-4">
             <label className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em]">Fragment Caption</label>
             <span className={`text-[10px] font-black tabular-nums tracking-widest ${caption.length >= MAX_CHARS ? 'text-danger' : 'text-white/40'}`}>
                {caption.length} / {MAX_CHARS}
             </span>
          </div>
          <div className="liquid-glass rounded-[1.8rem] px-5 py-4 border-white/5 focus-within:border-primary/30 transition-all bg-black/20">
            <textarea
              autoFocus
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, MAX_CHARS))}
              placeholder="What's synchronizing in your soul?..."
              className="w-full bg-transparent border-none text-white text-[14px] font-medium focus:ring-0 resize-none h-24 placeholder:text-white/10"
            />
          </div>
        </div>

        <button 
          onClick={() => { onSync(caption); setCaption(''); }}
          className="h-14 w-full rounded-full bg-primary text-white text-[11px] font-black uppercase tracking-[0.3em] shadow-[0_15px_35px_rgba(244,63,94,0.3)] active:scale-95 transition-all flex items-center justify-center gap-3"
        >
          <span className="material-symbols-outlined text-[20px]">bolt</span>
          Sync Fragment
        </button>
      </div>
    </div>
  );
};

const StatusScreen: React.FC = () => {
  const { statuses, addStatus, userName, userAvatar } = useApp();
  const [selectedStory, setSelectedStory] = useState<ActiveStory | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [progress, setProgress] = useState(0);

  // Story Progress Logic
  useEffect(() => {
    let timer: any;
    if (selectedStory) {
      setProgress(0);
      timer = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            setSelectedStory(null);
            return 100;
          }
          return prev + 1;
        });
      }, 50);
    }
    return () => clearInterval(timer);
  }, [selectedStory]);

  const handleSyncStatus = (caption: string) => {
    addStatus({
      contactName: userName,
      avatar: userAvatar,
      time: 'Just now',
      previewImage: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800',
      caption: caption.trim() || undefined
    });
    setShowComposer(false);
  };

  const openStory = (status: any) => {
    setSelectedStory({
      id: status.id,
      name: status.contactName,
      avatar: status.avatar,
      image: status.previewImage,
      time: status.time,
      caption: status.caption
    });
  };

  return (
    <div className="relative h-full w-full bg-transparent overflow-hidden flex flex-col animate-fade-in">
      {/* Header */}
      <header className="relative z-50 px-6 pt-12 pb-6 flex items-center justify-between bg-black/20 backdrop-blur-3xl border-b border-white/[0.05]">
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-white uppercase leading-none">STATUS</h1>
          <p className="text-[10px] font-bold text-accent tracking-[0.3em] uppercase opacity-70 mt-1">Fragment Matrix</p>
        </div>
        <button className="size-10 flex items-center justify-center rounded-full bg-white/5 border border-white/10 active:scale-90 transition-all">
          <span className="material-symbols-outlined text-white text-[20px]">more_vert</span>
        </button>
      </header>

      <main className="flex-1 relative z-10 px-4 space-y-6 pb-40 overflow-y-auto no-scrollbar pt-4">
        {/* User Status */}
        <section className="animate-slide-up">
          <div 
            onClick={() => setShowComposer(true)}
            className="liquid-glass rounded-[2rem] p-4 flex items-center gap-4 cursor-pointer hover:bg-white/5 transition-all group"
          >
            <div className="relative">
              <div className="size-14 rounded-full border-2 border-primary/40 p-1">
                <div className="w-full h-full rounded-full bg-center bg-cover overflow-hidden" style={{ backgroundImage: `url("${userAvatar}")` }}></div>
              </div>
              <div className="absolute bottom-0 right-0 size-6 rounded-full bg-primary flex items-center justify-center text-white border-4 border-[#09090b] group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-[16px] font-black">add</span>
              </div>
            </div>
            <div>
              <h4 className="font-black text-white text-[15px] tracking-tight">My Fragment</h4>
              <p className="text-[11px] text-white/30 font-bold uppercase tracking-widest">Tap to sync link</p>
            </div>
          </div>
        </section>

        {/* Recent Updates */}
        <section className="space-y-4 animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-white/20 px-4">Node Updates</h3>
          {statuses.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center text-white/10">
               <span className="material-symbols-outlined text-4xl mb-2">blur_circular</span>
               <p className="text-[10px] font-black uppercase tracking-widest">No active fragments</p>
            </div>
          ) : (
            statuses.map((status, i) => (
              <div 
                key={status.id}
                onClick={() => openStory(status)}
                className="liquid-glass rounded-[2rem] p-4 flex items-center gap-4 cursor-pointer hover:bg-white/5 active:scale-95 transition-all animate-glass-bloom"
                style={{ animationDelay: `${0.2 + (i * 0.05)}s` }}
              >
                <div className="size-14 rounded-full border-2 border-accent/60 p-1">
                  <div className="w-full h-full rounded-full bg-center bg-cover overflow-hidden" style={{ backgroundImage: `url("${status.avatar}")` }}></div>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-black text-white text-[15px] tracking-tight truncate">{status.contactName}</h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-[11px] text-white/30 font-bold uppercase tracking-widest">{status.time}</p>
                    {status.caption && (
                      <span className="size-1 bg-white/10 rounded-full"></span>
                    )}
                    {status.caption && (
                      <p className="text-[11px] text-primary font-bold truncate opacity-80">{status.caption}</p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </section>
      </main>

      <StatusComposer 
        isOpen={showComposer} 
        onClose={() => setShowComposer(false)} 
        onSync={handleSyncStatus}
        userAvatar={userAvatar}
      />

      {/* Story Viewer Overlay */}
      {selectedStory && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-fade-in">
          {/* Progress Bars */}
          <div className="absolute top-10 left-4 right-4 z-[110] flex gap-1.5">
            <div className="h-1 flex-1 bg-white/20 rounded-full overflow-hidden">
               <div className="h-full bg-white transition-all duration-75" style={{ width: `${progress}%` }}></div>
            </div>
          </div>

          {/* Header */}
          <div className="absolute top-16 left-4 right-4 z-[110] flex items-center justify-between">
             <div className="flex items-center gap-3">
               <div className="size-10 rounded-full border border-white/20 overflow-hidden">
                 <img src={selectedStory.avatar} className="w-full h-full object-cover" />
               </div>
               <div>
                 <h4 className="text-white text-sm font-bold tracking-tight">{selectedStory.name}</h4>
                 <p className="text-white/40 text-[9px] font-black uppercase tracking-widest">{selectedStory.time}</p>
               </div>
             </div>
             <button onClick={() => setSelectedStory(null)} className="size-10 flex items-center justify-center rounded-full bg-white/10 backdrop-blur-md">
               <span className="material-symbols-outlined text-white">close</span>
             </button>
          </div>

          <div className="flex-1 w-full relative flex items-center justify-center overflow-hidden">
            <div className="absolute inset-0 bg-center bg-cover" style={{ backgroundImage: `url("${selectedStory.image}")` }}></div>
            
            {/* Caption Overlay */}
            {selectedStory.caption && (
              <div className="absolute bottom-28 left-6 right-6 z-[110] animate-spring-up">
                 <div className="liquid-glass rounded-[2rem] p-6 border-white/20 shadow-[0_30px_60px_rgba(0,0,0,0.6)]">
                    <p className="text-white text-[15px] leading-relaxed font-medium text-center">
                      {selectedStory.caption}
                    </p>
                 </div>
              </div>
            )}
          </div>
          
          {/* Reply Bar */}
          <div className="p-6 pb-12 bg-gradient-to-t from-black to-transparent z-[120]">
             <div className="liquid-glass rounded-full h-14 flex items-center px-6 gap-4 border-white/10">
               <input 
                 className="flex-1 bg-transparent border-none text-white text-sm focus:ring-0 placeholder:text-white/30" 
                 placeholder="Reply to fragment..." 
                 type="text" 
               />
               <button className="size-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                 <span className="material-symbols-outlined text-[20px]">send</span>
               </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StatusScreen;
