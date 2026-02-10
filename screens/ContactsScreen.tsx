
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../AppContext.tsx';

const ContactsScreen: React.FC = () => {
  const navigate = useNavigate();
  const { contacts } = useApp();
  const [searchQuery, setSearchQuery] = useState('');

  const favorites = contacts.slice(0, 3);
  const filteredContacts = contacts.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="relative flex h-full w-full flex-col bg-transparent overflow-x-hidden animate-fade-in">
      <header className="sticky top-0 z-50 bg-black/20 backdrop-blur-3xl px-6 pt-12 pb-6 border-b border-white/[0.05]">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black tracking-tighter text-white uppercase leading-none">Nodes</h1>
          </div>
          <button onClick={() => navigate(-1)} className="size-10 flex items-center justify-center rounded-full bg-white/5 border border-white/10 active:scale-90 transition-all">
            <span className="material-symbols-outlined text-white">close</span>
          </button>
        </div>
        <div className="relative group">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            <span className="material-symbols-outlined text-primary/70">search</span>
          </div>
          <input 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-14 pl-12 pr-12 rounded-full border-none bg-white/5 backdrop-blur-xl focus:ring-1 focus:ring-primary/40 text-white placeholder:text-white/20 transition-all shadow-inner" 
            placeholder="Search neural directory..." 
            type="text"
          />
        </div>
      </header>

      <main className="flex-1 px-4 py-6 pb-32 overflow-y-auto no-scrollbar pt-4">
        {searchQuery === '' && (
          <section className="mb-10 animate-slide-up">
            <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-white/20 px-4 mb-6">Pinned Nodes</h3>
            <div className="flex overflow-x-auto gap-6 px-4 pb-2 no-scrollbar">
              {favorites.map((fav, i) => (
                <div key={fav.id} onClick={() => navigate(`/chat/${fav.id}`)} className="flex flex-col items-center gap-3 shrink-0 group cursor-pointer transition-all active:scale-95">
                  <div className={`relative p-[1.5px] rounded-full story-ring shadow-xl transition-all group-hover:scale-110`}>
                    <div className="w-16 h-16 rounded-full border-2 border-black/80 overflow-hidden bg-black/40">
                       <img src={fav.avatar} className="w-full h-full object-cover" />
                    </div>
                    <div className={`absolute bottom-1 right-1 size-4 rounded-full border-2 border-black ${fav.status === 'online' ? 'bg-primary shadow-[0_0_8px_var(--color-primary)]' : 'bg-gray-500'}`}></div>
                  </div>
                  <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">{fav.name.split(' ')[0]}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3 animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <div className="px-4 mb-4">
            <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-white/20">{searchQuery ? 'Analysis Results' : 'Neural Link History'}</h3>
          </div>
          {filteredContacts.length > 0 ? filteredContacts.map((contact, i) => (
            <div 
              key={contact.id}
              onClick={() => navigate(`/chat/${contact.id}`)}
              className="liquid-glass rounded-[2rem] p-4 flex items-center justify-between cursor-pointer transition-all border border-white/5 group hover:bg-primary/5 active:scale-[0.98] animate-glass-bloom shadow-lg"
              style={{ animationDelay: `${0.1 + (i * 0.05)}s` }}
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="relative flex-none">
                  <div className="w-12 h-12 rounded-full overflow-hidden border border-white/10 bg-black/40 shadow-lg">
                    <img src={contact.avatar} className="w-full h-full object-cover" />
                  </div>
                  <div className={`absolute bottom-0 right-0 size-3.5 rounded-full border-2 border-black ${contact.status === 'online' ? 'bg-primary shadow-[0_0_8px_var(--color-primary)]' : 'bg-gray-500'}`}></div>
                </div>
                <div className="min-w-0">
                  <p className="font-black text-white/90 text-[15px] tracking-tight group-hover:text-primary transition-colors truncate">{contact.name}</p>
                  <p className="text-[11px] text-white/30 font-bold uppercase tracking-tighter truncate italic">Node ID: {contact.id.slice(0, 8)}</p>
                </div>
              </div>
              <div className="flex gap-2 flex-none">
                <div className="size-10 rounded-full bg-white/5 border border-white/5 flex items-center justify-center group-hover:bg-primary/20 transition-all">
                  <span className="material-symbols-outlined text-white/20 group-hover:text-primary text-xl">chat</span>
                </div>
              </div>
            </div>
          )) : (
            <div className="h-64 flex flex-col items-center justify-center text-white/10 animate-fade-in">
              <span className="material-symbols-outlined text-5xl mb-4">search_off</span>
              <p className="text-[10px] font-black uppercase tracking-[0.4em]">Zero Node Matches</p>
            </div>
          )}
        </section>
      </main>

      <div className="fixed bottom-32 right-6 z-50">
        <button className="size-16 rounded-full bg-primary flex items-center justify-center text-white shadow-[0_15px_40px_rgba(244,63,94,0.4)] hover:scale-110 active:scale-95 transition-all border border-white/20 animate-scale-in">
          <span className="material-symbols-outlined text-3xl font-bold">person_add</span>
        </button>
      </div>
    </div>
  );
};

export default ContactsScreen;
