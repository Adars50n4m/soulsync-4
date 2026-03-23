import React from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AppProvider } from './AppContext.tsx';

// Screens
import HomeScreen from './screens/HomeScreen.tsx';
import ContactsScreen from './screens/ContactsScreen.tsx';
import ChatListScreen from './screens/ChatListScreen.tsx';
import ProfileScreen from './screens/ProfileScreen.tsx';
import SettingsScreen from './screens/SettingsScreen.tsx';
import SingleChatScreen from './screens/SingleChatScreen.tsx';
import StatusScreen from './screens/StatusScreen.tsx';

const AnimatedRoutes = () => {
  const location = useLocation();
  
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/contacts" element={<ContactsScreen />} />
        <Route path="/chats" element={<ChatListScreen />} />
        <Route path="/chat/:id" element={<SingleChatScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/status" element={<StatusScreen />} />
      </Routes>
    </AnimatePresence>
  );
};

const App: React.FC = () => {
  return (
    <AppProvider>
      <BrowserRouter>
        <div className="flex h-screen w-screen overflow-hidden bg-black font-sans text-white">
          <AnimatedRoutes />
        </div>
      </BrowserRouter>
    </AppProvider>
  );
};

export default App;
