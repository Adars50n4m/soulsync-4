
import React, { useState } from 'react';
import { useApp } from '../AppContext.tsx';

const CallsScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'all' | 'missed'>('all');
  const { calls } = useApp();

  const filteredCalls = activeTab === 'all' ? calls : calls.filter(c => c.type === 'missed');

  return (
    <div className="relative flex h-full w-full flex-col bg-transparent overflow-x-hidden animate-fade-in transition-colors-all">
      <header className="sticky top-0 z-50 bg-black/20 backdrop-blur-3xl px-6 pt-12 pb-6 border-b border-white/[0.05]">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-black tracking-tighter text-white uppercase leading-none">CALL</h1>
            <button className="size-11 rounded-full liquid-glass flex items-center justify-center text-white border border-white/10 active:scale-95 transition-all">
              <span className="material-symbols-outlined text-xl">add_call</span>
            </button>
          </div>
          
          <div className="bg-white/[0.03] backdrop-blur-md p-1 rounded-full w-full max-w-[280px] mx-auto border border-white/10 flex relative shadow-inner">
            <button 
              onClick={() => setActiveTab('all')}
              className={`flex-1 text-center py-2 px-4 rounded-full text-[10px] font-black uppercase tracking-widest z-10 transition-all duration-300 ${activeTab === 'all' ? 'bg-primary text-white shadow-[0_0_15px_var(--color-primary)]' : 'text-white/30 hover:text-white'}`}
            >
              All Threads
            </button>
            <button 
              onClick={() => setActiveTab('missed')}
              className={`flex-1 text-center py-2 px-4 rounded-full text-[10px] font-black uppercase tracking-widest z-10 transition-all duration-300 ${activeTab === 'missed' ? 'bg-danger/80 text-white shadow-[0_0_15px_rgba(239,68,68,0.4)]' : 'text-white/30 hover:text-white'}`}
            >
              Drops
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 space-y-3 pb-44 overflow-y-auto no-scrollbar pt-4">
        {filteredCalls.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-96 text-white/10">
            <span className="material-symbols-outlined text-6xl mb-4">call_end</span>
            <p className="text-[10px] font-black uppercase tracking-widest">Quiet in the mesh</p>
          </div>
        ) : (
          filteredCalls.map((call, i) => (
            <div 
              key={call.id} 
              className="liquid-glass rounded-[2rem] p-4 flex items-center justify-between transition-all border border-white/5 active:scale-[0.98] cursor-pointer hover:bg-white/5 animate-glass-bloom shadow-lg"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="size-14 rounded-full overflow-hidden border border-white/10 shadow-lg shrink-0">
                   <img src={call.avatar} className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0">
                  <h4 className={`font-black text-base truncate tracking-tight ${call.type === 'missed' ? 'text-danger' : 'text-white/90'}`}>{call.contactName}</h4>
                  <div className="flex items-center gap-1.5 mt-0.5 opacity-60">
                    <span className={`material-symbols-outlined text-sm ${call.type === 'missed' ? 'text-danger' : 'text-primary'}`}>
                      {call.type === 'missed' ? 'call_missed' : 'call_made'}
                    </span>
                    <p className="text-[10px] font-black uppercase tracking-widest italic">{call.time}</p>
                  </div>
                </div>
              </div>
              <div className="size-11 rounded-full bg-white/5 flex items-center justify-center transition-all hover:bg-primary/20">
                <span className="material-symbols-outlined text-white/40">{call.callType === 'video' ? 'videocam' : 'call'}</span>
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
};

export default CallsScreen;
