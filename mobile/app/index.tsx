import { useRouter } from 'expo-router';
import { AppContext } from '../context/AppContext';
import { View, ActivityIndicator } from 'react-native';
import { useContext, useEffect } from 'react';

export default function Index() {
  const context = useContext(AppContext);
  const router = useRouter();

  useEffect(() => {
    if (!context?.isReady) return;
    
    // Only attempt redirect if context is available and session is loaded
    if (!context.currentUser) {
      console.log('[Index] Redirecting to /login');
      router.replace('/login');
    } else {
      console.log('[Index] Redirecting to /(tabs)');
      router.replace('/(tabs)');
    }
  }, [context?.isReady, context?.currentUser, router]);

  if (!context || !context.isReady) {
    return (
      <View style={{ flex: 1, backgroundColor: 'pink', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#BC002A" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: 'pink', justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#BC002A" />
    </View>

  );
}
