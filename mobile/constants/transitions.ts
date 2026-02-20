import { Easing } from 'react-native-reanimated';

// Forward morph — smooth bezier with gentle overshoot feel
export const MORPH_EASING = Easing.bezier(0.2, 0.95, 0.2, 1);
export const MORPH_IN_DURATION = 520;

// Back morph — snappier, decisive, no overshoot
export const MORPH_OUT_EASING = Easing.bezier(0.33, 0, 0, 1);
export const MORPH_OUT_DURATION = 400;

export const MORPH_SPRING_CONFIG = {
    damping: 24,
    stiffness: 280,
    mass: 1,
};
