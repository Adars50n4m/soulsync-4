import { Easing } from 'react-native-reanimated';

// Ultimate Smooth OS-style deceleration curve
// Custom Bezier for snappy yet buttery smooth motion
export const MORPH_EASING = Easing.bezier(0.33, 1, 0.68, 1);
export const MORPH_IN_DURATION = 380;
export const MORPH_OUT_DURATION = 320;

export const MORPH_SPRING_CONFIG = {
    damping: 24,
    stiffness: 280,
    mass: 1,
};
