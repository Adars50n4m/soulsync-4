import { Easing } from 'react-native-reanimated';

// Snappy iOS-style deceleration curve
export const MORPH_EASING = Easing.bezier(0.33, 1, 0.68, 1);
export const MORPH_IN_DURATION = 350;
export const MORPH_OUT_DURATION = 300;

export const MORPH_SPRING_CONFIG = {
    damping: 18,
    stiffness: 150,
    mass: 0.8,
};
