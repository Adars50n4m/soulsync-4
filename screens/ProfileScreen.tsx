
import React, { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../AppContext.tsx';

type MediaCategory = 'Neural Media' | 'Data Logs' | 'Audio Echoes';

const ProfileScreen: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { contacts } = useApp();
  const [activeTab, setActiveTab] = useState<MediaCategory>('Neural Media');
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  const contact = contacts.find(c => c.id === id);

  const sharedMedia = useMemo(() => ({
    Media: [
      { url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=600" },
      { url: "https://images.unsplash.com/photo-1633167606207-d840b5070fc2?auto=format&fit=crop&q=80&w=600" },
      { url: "https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?auto=format&fit=crop&q=80&w=600" },
      { url: "https://images.unsplash.com/photo-1614850523296-d8c1af93d400?auto=format&fit=crop&q=80&w=600" },
      { url: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&q=80&w=600" },
      { url: "https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?auto=format&fit=crop&q=80&w=600" }
    ],
    Docs: [
      { name: 'Identity_Manifest.pdf', size: '4.2 MB', date: '2d ago' },
      { name: 'Neural_Buffer.dat', size: '156 KB', date: '1w ago' },
      { name: 'Soul_Fragment.json', size: '1.1 MB', date: '3w ago' }
    ],
    Audio: [
      { title: 'Ambient Pulse 04', length: '02:45' },
      { title: 'Voice Memo_Sync', length: '00:12' }
    ]
  }), []);

  if (!contact) return null;

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-hidden bg-black animate-fade-in">
      {/* Immersive Background Header */}
      <div className="absolute top-0 left-0 right-0 h-[75%] z-0">
         <div 
          className="absolute inset-0 bg-center bg-cover scale-105 transition-transform duration-[15s] ease-linear" 
          style={{ backgroundImage: `url("${contact.avatar}")` }}
         />
         <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black" />
         <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-95" />
      </div>

      {/* Navigation */}
      <header className="relative z-[100] flex items-center justify-between px-6 pt-[calc(1rem+env(safe-area-inset-top,10px))]">
        <button 
          onClick={() => navigate(-1)} 
          className="size-10 rounded-full flex items-center justify-center bg-black/40 backdrop-blur-3xl border border-white/10 ios-active"
        >
          <span className="material-symbols-outlined text-white text-[20px]">arrow_back</span>
        </button>
        <button className="size-10 rounded-full flex items-center justify-center bg-black/40 backdrop-blur-3xl border border-white/10 ios-active">
          <span className="material-symbols-outlined text-white text-[20px]">more_vert</span>
        </button>
      </header>

      <main className="relative z-10 flex-1 flex flex-col pt-[58vh]">
        {/* Core Identity - Positioned low as requested previously */}
        <section className="px-8 flex flex-col items-center mb-8">
          <h1 className="text-6xl font-black text-white tracking-tighter uppercase mb-2 drop-shadow-[0_15px_30px_rgba(0,0,0,1)] text-glow text-center">
            {contact.name}
          </h1>
        </section>

        {/* Content Section - Upgraded to Liquid Glass UI */}
        <section className="flex-1 liquid-glass rounded-t-[3.5rem] p-6 pb-20 min-h-[500px] shadow-[0_-50px_100px_rgba(0,0,0,0.8)] border-t border-white/10">
           <div className="flex items-center justify-center mb-10">
            <div className="flex bg-white/[0.03] p-1.5 rounded-full border border-white/10">
              {(['Neural Media', 'Data Logs', 'Audio Echoes'] as const).map(tab => (
                <button 
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-6 py-3 rounded-full text-[9px] font-black uppercase tracking-[0.2em] transition-all duration-500 ${activeTab === tab ? 'bg-white/10 text-white shadow-xl' : 'text-white/20 hover:text-white/40'}`}
                >
                  {tab.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          <div className="animate-fade-in" key={activeTab}>
            {activeTab === 'Neural Media' && (
              <div className="grid grid-cols-3 gap-3">
                {sharedMedia.Media.map((frag, i) => (
                  <div 
                    key={i} 
                    onClick={() => setFullscreenImage(frag.url)}
                    className="relative aspect-square rounded-[1.2rem] overflow-hidden border border-white/10 group shadow-lg cursor-pointer ios-active bg-white/[0.02] transform-gpu transition-all hover:border-primary/30"
                  >
                    <img src={frag.url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000 ease-out" alt="" />
                    <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'Data Logs' && (
              <div className="space-y-3">
                {sharedMedia.Docs.map((doc, i) => (
                  <div key={i} className="liquid-glass px-6 py-5 rounded-[2.2rem] flex items-center justify-between border-white/[0.04] hover:bg-white/[0.08] transition-all group ios-active">
                    <div className="flex items-center gap-5">
                      <div className="size-12 rounded-2xl bg-white/5 flex items-center justify-center text-white/20 border border-white/10 group-hover:text-primary transition-all">
                        <span className="material-symbols-outlined text-[20px]">description</span>
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-[13px] font-black text-white/90 uppercase tracking-tight truncate max-w-[150px]">{doc.name}</h4>
                        <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest mt-1">{doc.size} • {doc.date}</p>
                      </div>
                    </div>
                    <span className="material-symbols-outlined text-white/10 group-hover:text-white text-[18px]">download</span>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'Audio Echoes' && (
              <div className="space-y-3">
                 {sharedMedia.Audio.map((track, i) => (
                   <div key={i} className="liquid-glass px-6 py-5 rounded-[2.2rem] flex items-center justify-between border-white/[0.04] hover:bg-white/[0.08] transition-all group ios-active">
                    <div className="flex items-center gap-5">
                      <div className="size-12 rounded-full bg-white/5 flex items-center justify-center text-white/20 border border-white/10 group-hover:bg-accent/10 group-hover:text-accent transition-all">
                        <span className="material-symbols-outlined text-[22px] fill-1">play_arrow</span>
                      </div>
                      <div>
                        <h4 className="text-[13px] font-black text-white/90 uppercase tracking-tight">{track.title}</h4>
                        <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest mt-1">{track.length} Duration</p>
                      </div>
                    </div>
                  </div>
                 ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Fullscreen Viewer */}
      {fullscreenImage && (
        <div 
          className="fixed inset-0 z-[200] bg-black/98 backdrop-blur-3xl flex items-center justify-center p-6 animate-fade-in"
          onClick={() => setFullscreenImage(null)}
        >
          <div className="relative w-full max-w-4xl max-h-[90vh] flex items-center justify-center animate-ios-pop">
            <img 
              src={fullscreenImage} 
              className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl shadow-primary/20" 
              alt="fullscreen" 
            />
            <button 
              className="absolute -top-12 right-0 size-10 rounded-full bg-white/10 flex items-center justify-center text-white backdrop-blur-md border border-white/20"
              onClick={(e) => { e.stopPropagation(); setFullscreenImage(null); }}
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileScreen;
