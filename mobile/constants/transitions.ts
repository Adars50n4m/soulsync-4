import { Easing } from 'react-native-reanimated';

// Ultimate Smooth OS-style deceleration curve
export const MORPH_EASING = Easing.bezier(0.2, 0.8, 0.2, 1);
export const MORPH_IN_DURATION = 350;
export const MORPH_OUT_DURATION = 350;

export const MORPH_SPRING_CONFIG = {
    damping: 24,
    stiffness: 280,
    mass: 1,
};
