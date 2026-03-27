import React, { useState, useEffect } from 'react';
import Animated, { SharedTransition, withSpring } from 'react-native-reanimated';
import { View, StyleSheet, Platform } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { proxySupabaseUrl } from '../config/api';
import { useApp } from '../context/AppContext';


interface SoulAvatarProps {
  uri?: string;
  size?: number;
  style?: any;
  iconSize?: number;
  avatarType?: 'default' | 'teddy' | 'memoji' | 'custom';
  teddyVariant?: 'boy' | 'girl';
  sharedTransitionTag?: string;
  sharedTransitionStyle?: any;
  isOnline?: boolean;
}

/**
 * SoulAvatar Component - WhatsApp Style
 * Shows user photo if available, otherwise shows default person icon.
 * Includes optional premium online indicator.
 */
export const SoulAvatar: React.FC<SoulAvatarProps> = ({
  uri,
  size = 50,
  style,
  iconSize,
  avatarType = 'default',
  teddyVariant,
  sharedTransitionTag,
  sharedTransitionStyle,
  isOnline = false
}) => {
  const { activeTheme } = useApp();
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
  }, [uri]);

  const imageStyle = [{ width: size, height: size, borderRadius: size / 2 }, style];

  const sharedProps = sharedTransitionTag
    ? {
        sharedTransitionTag,
        sharedTransitionStyle,
      }
    : {};

  const proxiedUri = proxySupabaseUrl(uri);
  const hasAvatar = !!proxiedUri && proxiedUri !== '' && !error;

  const renderAvatar = () => {
    // Handling Teddy/Memoji types (these are often URLs from Iranliara or just keys)
    if (avatarType === 'teddy' || avatarType === 'memoji') {
        const fallbackId = uri || 'default';
        const avatarUrl = avatarType === 'teddy'
            ? `https://avatar.iran.liara.run/public/boy?username=${fallbackId}`
            : `https://avatar.iran.liara.run/public/girl?username=${fallbackId}`;

        return (
            <Image
                source={{ uri: avatarUrl }}
                style={{ width: size, height: size, borderRadius: size / 2 }}
                contentFit="contain"
            />
        );
    }

    // Show user photo if available
    if (hasAvatar) {
      if (sharedTransitionTag) {
        return (
          <Animated.Image
            source={{ uri: proxiedUri }}
            {...sharedProps}
            style={{ width: size, height: size, borderRadius: size / 2 }}
            resizeMode="cover"
            onError={() => setError(true)}
          />
        );
      }

      return (
        <Image
          source={{ uri: proxiedUri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
          transition={200}
          onError={() => setError(true)}
        />
      );
    }

    // Default: WhatsApp-style person icon placeholder
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: '#262626',
          justifyContent: 'center',
          alignItems: 'center',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.15)',
        }}
      >
        <MaterialIcons
          name="person"
          size={iconSize || size * 0.7}
          color="rgba(255,255,255,0.7)"
        />
      </View>
    );
  };

  return (
    <View style={[{ width: size, height: size }, style]}>
      {renderAvatar()}
      {isOnline && (
        <View 
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: Math.max(10, size * 0.25),
            height: Math.max(10, size * 0.25),
            borderRadius: size * 0.125,
            backgroundColor: activeTheme.primary,
            borderWidth: 2,
            borderColor: '#000',
            zIndex: 10,
          }}
        />
      )}
    </View>
  );
};
