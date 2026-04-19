import { useRouter, useRootNavigationState } from 'expo-router';
import { AppContext } from '../context/AppContext';
import { View, ActivityIndicator } from 'react-native';
import { useContext, useEffect } from 'react';

export default function Index() {
  const context = useContext(AppContext);
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();

  useEffect(() => {
    // 1. Guard: Ensure the root navigation state is initialized
    // This prevents "Attempted to navigate before mounting the Root Layout" error
    if (!rootNavigationState?.key) return;

    // 2. Guard: Ensure the app context is ready (auth/db initialized)
    if (!context || !context.isReady) return;

    // 3. Perform redirect
    if (!context.currentUser) {
      console.log('[Index] Redirecting to /login');
      router.replace('/login');
    } else {
      console.log('[Index] Redirecting to /(tabs)');
      router.replace('/(tabs)');
    }
  }, [context?.isReady, context?.currentUser, router, rootNavigationState?.key]);

  return (
    <View style={{ flex: 1, backgroundColor: context?.activeTheme?.background || '#000', justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color={context?.activeTheme?.primary || '#BC002A'} />
    </View>
  );
}
