
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../AppContext.tsx';
import { SoulSyncLogo } from '../Logo.tsx';

const ChatListScreen: React.FC = () => {
  const navigate = useNavigate();
  const { contacts, messages, addContact } = useApp();

  const handleAddNode = () => {
    const name = prompt("Enter Node Identity (Name):");
    if (name && name.trim()) {
      addContact(name.trim());
    }
  };

  return (
    <div className="relative h-full flex flex-col overflow-hidden animate-fade-in bg-black">
      <header className="sticky top-0 z-50 px-6 pt-12 pb-4 flex items-center justify-between bg-black border-b border-white/[0.05]">
        <div className="flex items-center gap-3 animate-ios-pop">
          <SoulSyncLogo className="size-10" />
          <div className="flex flex-col">
            <h1 className="text-2xl font-black tracking-tight text-white leading-none">SoulSync</h1>
            <p className="text-[9px] font-black text-primary tracking-[0.2em] uppercase mt-1">NEURAL MATRIX</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleAddNode}
            className="size-11 rounded-full ios-active bg-primary/10 border border-primary/30 flex items-center justify-center shadow-lg transition-all active:scale-90 text-primary"
          >
            <span className="material-symbols-outlined text-2xl font-bold">add</span>
          </button>
          <button className="size-11 rounded-full ios-active bg-white/5 border border-white/10 flex items-center justify-center shadow-lg transition-all active:scale-90">
            <span className="material-symbols-outlined text-white/40 text-2xl">search</span>
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 space-y-4 overflow-y-auto no-scrollbar pb-32">
        {contacts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center animate-fade-in pt-20">
            <div className="relative mb-8">
              <div className="absolute inset-0 bg-primary/20 blur-3xl animate-pulse rounded-full"></div>
              <div className="relative size-24 rounded-full border border-white/10 flex items-center justify-center bg-black/40 backdrop-blur-xl">
                <span className="material-symbols-outlined text-white/20 text-5xl">person_add</span>
              </div>
            </div>
            
            <div className="text-center space-y-2 mb-8">
              <p className="text-[11px] font-black uppercase tracking-[0.5em] text-white/40">Zero Active Nodes</p>
              <h2 className="text-white/20 text-xs font-medium max-w-[200px] leading-relaxed">
                Initialize your first neural link to begin synchronizing data fragments.
              </h2>
            </div>

            <button 
              onClick={handleAddNode}
              className="liquid-glass px-10 py-4 rounded-full border-primary/40 hover:border-primary transition-all ios-active flex items-center gap-3 group shadow-[0_0_50px_rgba(244,63,94,0.15)]"
            >
              <span className="material-symbols-outlined text-primary group-hover:scale-125 transition-transform">bolt</span>
              <span className="text-[11px] font-black text-white uppercase tracking-[0.3em]">Initialize Link</span>
            </button>
          </div>
        ) : contacts.map((contact, i) => {
          const chatMessages = messages[contact.id] || [];
          const lastMsg = chatMessages[chatMessages.length - 1] || { text: contact.lastMessage, timestamp: 'Now' };
          
          return (
            <div 
              key={contact.id} 
              onClick={() => navigate(`/chat/${contact.id}`)}
              className="liquid-glass rounded-3xl p-4 flex items-center gap-4 cursor-pointer ios-active stagger-item border-white/[0.05]"
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <div className="relative flex-none">
                <div className={`size-14 rounded-full overflow-hidden border-2 transition-all duration-700 ${contact.status === 'online' ? 'border-primary ring-2 ring-primary/20' : 'border-white/10'}`}>
                  <img src={contact.avatar} className="w-full h-full object-cover" alt="" />
                </div>
                {contact.status === 'online' && (
                  <div className="absolute bottom-0.5 right-0.5 size-3.5 rounded-full border-2 border-black bg-primary"></div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-0.5">
                  <h4 className="font-bold text-white text-[16px] tracking-tight truncate leading-none">{contact.name}</h4>
                  <span className="text-[9px] text-white/20 font-black uppercase tracking-widest shrink-0 ml-2">{lastMsg.timestamp}</span>
                </div>
                <p className="text-[13px] truncate text-white/40 font-medium tracking-tight leading-tight">
                  {lastMsg.text}
                </p>
              </div>

              <div className="flex-none flex items-center justify-center pr-1">
                {contact.unreadCount ? (
                   <div className="size-5 rounded-full bg-primary flex items-center justify-center text-[9px] font-black text-white shadow-lg">
                     {contact.unreadCount}
                   </div>
                ) : (
                  <span className="material-symbols-outlined text-white/10 text-[16px]">arrow_forward_ios</span>
                )}
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
};

export default ChatListScreen;
