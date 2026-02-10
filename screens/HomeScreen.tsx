
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../AppContext.tsx';
import { SoulSyncLogo } from '../Logo.tsx';

const HomeScreen: React.FC = () => {
  const navigate = useNavigate();
  const { contacts, messages } = useApp();

  return (
    <div className="relative flex flex-col min-h-screen bg-black animate-fade-in">
      {/* High-Fidelity Header - Ultra Minimalist with Signature Glow */}
      <header className="sticky top-0 z-[70] px-8 pt-[calc(1.5rem+env(safe-area-inset-top,10px))] pb-6 bg-gradient-to-b from-black via-black/80 to-transparent">
        <div className="flex items-center gap-3">
           <SoulSyncLogo className="size-6 opacity-90 drop-shadow-[0_0_12px_rgba(244,63,94,0.5)]" />
           <h1 className="text-[18px] font-black tracking-[0.2em] text-white uppercase text-glow drop-shadow-[0_0_15px_rgba(255,255,255,0.6)]">
             SoulSync
           </h1>
        </div>
      </header>

      {/* Refined Chat List - Slimmer "Liquid Glass" Card UI */}
      <main className="flex-1 overflow-y-auto no-scrollbar pt-1 pb-44 space-y-3 px-6">
        {contacts.length === 0 ? (
          <div className="h-[60vh] flex flex-col items-center justify-center text-white/5 animate-fade-in">
            <span className="material-symbols-outlined text-[60px] mb-4 opacity-10">grain</span>
            <p className="text-[9px] font-black uppercase tracking-[0.5em] opacity-20">Matrix Standby</p>
          </div>
        ) : (
          contacts.map((contact, i) => {
            const chatMessages = messages[contact.id] || [];
            const lastMsg = chatMessages[chatMessages.length - 1] || { text: contact.lastMessage, timestamp: '10:42 AM' };
            
            return (
              <div 
                key={contact.id} 
                onClick={() => navigate(`/chat/${contact.id}`)}
                className="liquid-glass rounded-[1.6rem] px-4 py-3 flex items-center gap-4 cursor-pointer ios-active group transition-all border-white/10 hover:bg-white/[0.07] hover:border-white/20 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)] active:scale-[0.98]"
                style={{ 
                  animationDelay: `${i * 0.08}s`,
                  animation: 'glassBloom 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards'
                }}
              >
                {/* Avatar - Scaled down for "chhota" look */}
                <div className="relative flex-none">
                  <div className="size-11 rounded-full p-[1px] bg-gradient-to-tr from-white/10 to-transparent">
                    <div className="w-full h-full rounded-full border border-black/50 bg-zinc-900 overflow-hidden shadow-lg">
                      <img src={contact.avatar} className="w-full h-full object-cover grayscale-[0.1] contrast-[1.1]" alt="" />
                    </div>
                  </div>
                  {contact.status === 'online' && (
                    <div className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-[2px] border-[#0c0c0e] bg-primary shadow-lg shadow-primary/40"></div>
                  )}
                </div>

                {/* Chat Details - Compact Typography */}
                <div className="flex-1 min-w-0 pr-0.5">
                  <div className="flex justify-between items-center mb-0.5">
                    <h4 className="font-black text-white/90 text-[14px] tracking-tight truncate uppercase">
                      {contact.name}
                    </h4>
                    <span className="text-[9px] font-black uppercase tracking-widest text-white/20 tabular-nums">
                      {lastMsg.timestamp}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] truncate text-white/40 font-medium tracking-tight">
                      {lastMsg.text}
                    </p>
                    {contact.unreadCount ? (
                       <div className="ml-2 size-4 rounded-full bg-primary flex items-center justify-center text-[8px] font-black text-white shadow-[0_0_10px_rgba(244,63,94,0.4)]">
                         {contact.unreadCount}
                       </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </main>
    </div>
  );
};

export default HomeScreen;
