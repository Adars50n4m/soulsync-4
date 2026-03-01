
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, LayoutGroup } from 'framer-motion';
import { useApp } from '../AppContext.tsx';
import { SoulSyncLogo } from '../Logo.tsx';

const transitionConfig = {
  layoutId: {
    type: 'spring',
    stiffness: 260,
    damping: 20,
    mass: 0.4,
    restDelta: 0.001,
  }
};

const HomeScreen: React.FC = () => {
  const navigate = useNavigate();
  const { contacts, messages } = useApp();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const handleChatClick = (contactId: string) => {
    setActiveChatId(contactId);
    navigate(`/chat/${contactId}`);
  };

  return (
    <LayoutGroup>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="relative flex flex-col min-h-screen bg-black animate-fade-in"
      >
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
              const isActive = activeChatId === contact.id;

              return (
                <motion.div
                  key={contact.id}
                  layoutId={`chat-card-${contact.id}`}
                  layout
                  onClick={() => handleChatClick(contact.id)}
                  className="liquid-glass rounded-[1.6rem] px-4 py-3 flex items-center gap-4 cursor-pointer ios-active group transition-all border-white/10 hover:bg-white/[0.07] hover:border-white/20 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)] active:scale-[0.98]"
                  style={{
                    animationDelay: `${i * 0.08}s`,
                    animation: 'glassBloom 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
                  }}
                  transition={transitionConfig}
                >
                  {/* Avatar - Scaled down for "chhota" look */}
                  <motion.div
                    layoutId={`chat-avatar-${contact.id}`}
                    layout
                    className="relative flex-none"
                    transition={{ ...transitionConfig.layoutId, duration: 0.35 }}
                  >
                    <div className="size-11 rounded-full p-[1px] bg-gradient-to-tr from-white/10 to-transparent">
                      <div className="w-full h-full rounded-full border border-black/50 bg-zinc-900 overflow-hidden shadow-lg">
                        <img src={contact.avatar} className="w-full h-full object-cover grayscale-[0.1] contrast-[1.1]" alt="" />
                      </div>
                    </div>
                    {contact.status === 'online' && (
                      <motion.div
                        layoutId={`chat-status-${contact.id}`}
                        className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-[2px] border-[#0c0c0e] bg-primary shadow-lg shadow-primary/40"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: i * 0.08 + 0.2, type: 'spring', stiffness: 400, damping: 15 }}
                      />
                    )}
                  </motion.div>

                  {/* Chat Details - Compact Typography */}
                  <motion.div
                    layoutId={`chat-details-${contact.id}`}
                    layout
                    className="flex-1 min-w-0 pr-0.5"
                    transition={{ ...transitionConfig.layoutId, duration: 0.3 }}
                  >
                    <div className="flex justify-between items-center mb-0.5 gap-3">
                      <motion.h4
                        layoutId={`chat-name-${contact.id}`}
                        layout
                        className="font-black text-white/90 text-[14px] tracking-tight truncate uppercase"
                        transition={transitionConfig.layoutId}
                      >
                        {contact.name}
                      </motion.h4>
                      <motion.span
                        layoutId={`chat-time-${contact.id}`}
                        className="text-[9px] font-black uppercase tracking-widest text-white/20 tabular-nums whitespace-nowrap"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.08 + 0.1 }}
                      >
                        {lastMsg.timestamp}
                      </motion.span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <motion.p
                        layoutId={`chat-preview-${contact.id}`}
                        className="text-[12px] truncate text-white/40 font-medium tracking-tight"
                        transition={transitionConfig.layoutId}
                      >
                        {lastMsg.text}
                      </motion.p>
                      {contact.unreadCount ? (
                        <motion.div
                          layoutId={`chat-badge-${contact.id}`}
                          className="ml-2 size-4 rounded-full bg-primary flex items-center justify-center text-[8px] font-black text-white shadow-[0_0_10px_rgba(244,63,94,0.4)]"
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ delay: i * 0.08 + 0.15, type: 'spring', stiffness: 500, damping: 12 }}
                        >
                          {contact.unreadCount}
                        </motion.div>
                      ) : null}
                    </div>
                  </motion.div>
                </motion.div>
              );
            })
          )}
        </main>
      </motion.div>
    </LayoutGroup>
  );
};

export default HomeScreen;
