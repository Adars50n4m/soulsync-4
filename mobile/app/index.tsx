import { Redirect } from 'expo-router';
import { AppContext } from '../context/AppContext';
import { View, ActivityIndicator } from 'react-native';
import { useContext } from 'react';

export default function Index() {
  const context = useContext(AppContext);

  // If context is not available yet, return a loader
  if (!context) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#BC002A" />
      </View>
    );
  }

  const { currentUser, isReady } = context;

  if (!isReady) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#BC002A" />
      </View>
    );
  }

  if (!currentUser) {
    return <Redirect href="/login" />;
  }

  return <Redirect href="/(tabs)" />;
}
