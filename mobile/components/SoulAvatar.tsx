import React from 'react';
import Animated from 'react-native-reanimated';
import { View, StyleSheet, ViewStyle, ImageStyle, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface SoulAvatarProps {
  uri?: string;
  size?: number;
  style?: any;
  iconSize?: number;
  sharedTransitionTag?: string;
  sharedTransitionStyle?: any;
}

/**
 * SoulAvatar Component
 * Shows user profile image or a "WhatsApp-style" anonymous placeholder if no URI is provided.
 */
export const SoulAvatar: React.FC<SoulAvatarProps> = ({ 
  uri, size = 50, style, iconSize, 
  sharedTransitionTag, sharedTransitionStyle 
}) => {
  const sharedProps = Platform.OS === 'ios' && sharedTransitionTag
    ? {
        sharedTransitionTag,
        sharedTransitionStyle,
      }
    : {};

  const hasAvatar = !!uri && uri !== '' && 
    !uri.includes('placeholder') && 
    !uri.includes('pravatar.cc') &&
    !uri.includes('avatar.iran.liara.run');

  if (hasAvatar) {
    return (
      <Animated.Image
        source={{ uri }}
        {...sharedProps}
        style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
      />
    );
  }

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: '#1C1C1E', // Dark grey background like modern WhatsApp dark mode
          justifyContent: 'center',
          alignItems: 'center',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.1)',
        },
        style,
      ]}
    >
      <MaterialIcons 
        name="person" 
        size={iconSize || size * 0.75} 
        color="rgba(255,255,255,0.4)" 
      />
    </View>
  );
};
