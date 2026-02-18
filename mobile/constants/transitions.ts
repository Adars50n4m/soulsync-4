import { Easing } from 'react-native-reanimated';

// Snappy iOS-style deceleration curve
export const MORPH_EASING = Easing.bezier(0.33, 0.8, 0.68, 1);
export const MORPH_IN_DURATION = 300;
export const MORPH_OUT_DURATION = 300;

export const MORPH_SPRING_CONFIG = {
    damping: 20,
    stiffness: 300,
    mass: 1,
};
