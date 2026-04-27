import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { CardioLoader } from './CardioLoader';

interface SoulLoaderProps {
  size?: number;
  style?: ViewStyle;
  variant?: 'symbol' | 'fish';
  color?: string;
}

export const SoulLoader = ({
  size = 120,
  style,
  color = '#BC002A',
}: SoulLoaderProps) => {
  return (
    <View style={[styles.container, style]}>
      <CardioLoader size={size} color={color} stroke={4} speed={2} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
