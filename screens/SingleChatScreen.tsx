import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../AppContext';
import { Message } from '../types';
import { socket } from '../mobile/src/webrtc/socket'; // Adjusted path as we are in screens/

// --- Media Share Menu Component (Refined) ---
const MediaShareMenu: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void;
  onGallery: () => void;
  onCamera: () => void;
  onFile: () => void;
  onLocation: () => void;
}> = ({ isOpen, onClose, onGallery, onCamera, onFile, onLocation }) => {
  if (!isOpen) return null;
  
  const menuItems = [
    { icon: 'image', label: 'Gallery', color: 'text-purple-400', onClick: onGallery },
    { icon: 'photo_camera', label: 'Camera', color: 'text-pink-400', onClick: onCamera },
    { icon: 'description', label: 'Document', color: 'text-blue-400', onClick: onFile },
    { icon: 'location_on', label: 'Location', color: 'text-green-400', onClick: onLocation }
  ];

  return (
    <>
      <div className="fixed inset-0 z-[140] bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="absolute bottom-20 left-6 w-64 z-[150] bg-[#1c1c1e]/95 backdrop-blur-xl rounded-2xl p-2 flex flex-col gap-1 shadow-2xl border border-white/10 animate-ios-pop origin-bottom-left">
        {menuItems.map((item, idx) => (
          <button 
            key={idx}
            onClick={(e) => { e.stopPropagation(); item.onClick(); onClose(); }}
            className="flex items-center gap-4 w-full px-4 py-3 hover:bg-white/10 rounded-xl transition-all active:scale-95 group"
          >
            <div className={`size-10 rounded-full bg-white/5 flex items-center justify-center border border-white/5 group-hover:scale-110 transition-transform ${item.color}`}>
              <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
            </div>
            <span className="text-[13px] font-semibold text-white/90">{item.label}</span>
          </button>
        ))}
      </div>
    </>
  );
};

const SingleChatScreen: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { messages, contacts, addMessage, updateMessageStatus, deleteMessage } = useApp();
  const [inputText, setInputText] = useState('');
  const [showMediaMenu, setShowMediaMenu] = useState(false);
  
  // Refs for hidden inputs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const contact = contacts.find(c => c.id === id);
  const chatMessages = messages[id || ''] || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSendMessage = (text?: string, media?: Message['media']) => {
    if (!id) return;
    const content = text || inputText.trim();
    if (!content && !media) return;
    
    addMessage(id, content, 'me', media);
    if (!media) setInputText('');
    
    // Simulate server response/status
    setTimeout(() => {
      // In a real app, this would come from socket
    }, 1000);
  };

  // --- 1. Working File/Image Handler ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file') => {
    const file = e.target.files?.[0];
    if (file) {
      // Create a fake URL for immediate display (Data URL)
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          handleSendMessage('', {
            type: type,
            url: ev.target.result as string, // Real image data
            name: file.name
          });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // --- 2. Working Location Handler ---
  const handleLocationShare = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        const { latitude, longitude } = position.coords;
        const mapLink = `https://www.google.com/maps?q=${latitude},${longitude}`;
        handleSendMessage(`📍 Shared Location`, {
            type: 'file', // Treating as file to show preview icon, or custom type
            url: mapLink,
            name: 'Current Location'
        });
      }, (error) => {
        alert("Could not fetch location: " + error.message);
      });
    } else {
      alert("Geolocation is not supported by this browser.");
    }
  };

  if (!contact) return null;

  return (
    <div className="relative min-h-screen flex flex-col bg-black overflow-hidden">
      {/* Hidden Inputs for Media */}
      <input 
        type="file" 
        accept="image/*" 
        ref={fileInputRef} 
        className="hidden" 
        onChange={(e) => handleFileChange(e, 'image')}
      />
      <input 
        type="file" 
        accept="image/*" 
        capture="environment" // Opens Camera directly on mobile
        ref={cameraInputRef} 
        className="hidden" 
        onChange={(e) => handleFileChange(e, 'image')}
      />
      <input 
        type="file" 
        accept="*/*" 
        ref={docInputRef} 
        className="hidden" 
        onChange={(e) => handleFileChange(e, 'file')}
      />

      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-50 bg-[#1c1c1e]/80 backdrop-blur-md border-b border-white/5 px-4 py-3 flex items-center justify-between pt-[calc(env(safe-area-inset-top)+10px)]">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-white/80"><span className="material-symbols-outlined">arrow_back</span></button>
          <div className="flex items-center gap-3">
             <img src={contact.avatar} className="size-10 rounded-full object-cover" alt="" />
             <div>
                <h2 className="text-white font-bold text-sm leading-tight">{contact.name}</h2>
                {/* Real Status Indicator */}
                <p className={`text-[11px] font-medium tracking-wide ${contact.status === 'online' ? 'text-green-400' : 'text-white/40'}`}>
                  {contact.status === 'online' ? 'Online' : contact.lastSeen}
                </p>
             </div>
          </div>
        </div>
        <div className="flex gap-4 text-primary">
          <span className="material-symbols-outlined">videocam</span>
          <span className="material-symbols-outlined">call</span>
        </div>
      </header>

      {/* Messages Feed */}
      <main className="flex-1 overflow-y-auto pt-24 pb-24 px-4 space-y-4">
        {chatMessages.map((msg, i) => (
          <div key={msg.id} className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[75%] p-3 rounded-2xl ${msg.sender === 'me' ? 'bg-primary text-white rounded-br-none' : 'bg-[#2c2c2e] text-white rounded-bl-none'}`}>
              
              {/* Media Rendering */}
              {msg.media && (
                <div className="mb-2">
                  {msg.media.type === 'image' ? (
                    <img src={msg.media.url} alt="Shared" className="rounded-lg w-full max-h-60 object-cover" />
                  ) : (
                    <a href={msg.media.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 bg-black/20 p-2 rounded-lg">
                      <span className="material-symbols-outlined">description</span>
                      <span className="underline text-sm truncate">{msg.media.name}</span>
                    </a>
                  )}
                </div>
              )}

              {msg.text && <p className="text-[15px] leading-relaxed">{msg.text}</p>}
              <span className="text-[10px] opacity-60 block text-right mt-1">{msg.timestamp}</span>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 inset-x-0 bg-[#1c1c1e]/90 backdrop-blur-md p-3 pb-[calc(env(safe-area-inset-bottom)+10px)] flex items-center gap-3 border-t border-white/5">
        <div className="relative">
          <MediaShareMenu 
             isOpen={showMediaMenu}
             onClose={() => setShowMediaMenu(false)}
             onGallery={() => fileInputRef.current?.click()}
             onCamera={() => cameraInputRef.current?.click()}
             onFile={() => docInputRef.current?.click()}
             onLocation={handleLocationShare}
          />
          <button 
            onClick={() => setShowMediaMenu(!showMediaMenu)}
            className={`size-10 rounded-full flex items-center justify-center transition-all ${showMediaMenu ? 'rotate-45 bg-primary text-white' : 'text-primary bg-white/5'}`}
          >
            <span className="material-symbols-outlined text-xl">add</span>
          </button>
        </div>

        <input 
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 bg-black/40 text-white rounded-full px-4 h-10 focus:outline-none focus:ring-1 focus:ring-primary/50 text-[15px]"
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
        />
        
        <button onClick={() => handleSendMessage()} className="size-10 rounded-full bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
          <span className="material-symbols-outlined text-xl">{inputText ? 'send' : 'mic'}</span>
        </button>
      </footer>
    </div>
  );
};

export default SingleChatScreen;
