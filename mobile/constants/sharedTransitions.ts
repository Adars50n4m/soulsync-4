/**
 * Soul Transition Configuration Constants
 *
 * Spring and timing presets for animations across the app.
 * Note: SharedTransition / sharedTransitionTag is not available
 * in react-native-reanimated 4.1.x (Expo SDK 54).
 */

import { Platform } from 'react-native';
import { Easing, ReduceMotion, SharedTransition, withSpring } from 'react-native-reanimated';

// ─────────────────────────────────────────────────────────────────────────────
// SPRING CONFIGURATIONS
// ─────────────────────────────────────────────────────────────────────────────

export const LIQUID_GLASS_SPRING = {
  damping: 28,
  stiffness: 320,
  mass: 0.8,
  overshootClamping: false,
} as const;

export const SNAPPY_SPRING = {
  damping: 20,
  stiffness: 400,
  mass: 0.6,
  overshootClamping: false,
} as const;

export const GENTLE_SPRING = {
  damping: 32,
  stiffness: 200,
  mass: 1.2,
  overshootClamping: false,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// TIMING CONFIGURATIONS
// ─────────────────────────────────────────────────────────────────────────────

export const LIQUID_TIMING = {
  duration: 450,
  easing: Easing.bezier(0.2, 0.95, 0.2, 1),
} as const;

export const FAST_TIMING = {
  duration: 280,
  easing: Easing.bezier(0.33, 0, 0, 1),
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// TAG GENERATORS (for future shared element transition support)
// ─────────────────────────────────────────────────────────────────────────────

export const SharedTransitionTags = {
  avatar: (userId: string) => `avatar-${userId}`,
  chatCard: (chatId: string) => `chat-card-${chatId}`,
  chatName: (chatId: string) => `chat-name-${chatId}`,
  media: (messageId: string, mediaIndex: number = 0) => `media-${messageId}-${mediaIndex}`,
  status: (statusId: string) => `status-${statusId}`,
  profilePicture: (userId: string) => `profile-picture-${userId}`,
  profileCard: () => 'profile-card-shell',
} as const;

export const getProfileAvatarTransitionTag = (userId: string) =>
  SharedTransitionTags.profilePicture(userId);

export const PROFILE_AVATAR_TRANSITION_TAG = 'avatar-universal-morph';

/**
 * We are now using native Reanimated 3 shared-element transitions for the 
 * profile avatar morph, as it provides a much more "liquid" and hardware-accelerated 
 * feel compared to manual JS-thread overlays.
 *
 * Configuration:
 * - PROFILE_AVATAR_SHARED_TRANSITION handles the path interpolation (rect <-> circle).
 * - SUPPORT_PROFILE_AVATAR_SHARED_TRANSITION toggles the feature globally.
 */
export const SUPPORT_SHARED_TRANSITIONS = true;

/**
 * Targeted opt-in for the chat-avatar -> profile-hero transition.
 * We keep this limited to iOS for now because the current Android build
 * still relies on the older measured morph fallback.
 */
export const SUPPORT_PROFILE_AVATAR_SHARED_TRANSITION = false;

/**
 * UNIVERSAL LIQUID MORPH PHYSICS
 *
 * This spring is carefully tuned to feel fluid and "organic" rather than mechanical.
 * Damping is high to prevent oscillation (jitter) during the reshape phase,
 * while stiffness is moderate to maintain responsiveness.
 */
export const SOUL_LIQUID_SPRING = {
  damping: 32,      // Perfectly buttery deceleration, zero overshoot
  stiffness: 150,    // Organic, flow-like motion
  mass: 1.1,
  reduceMotion: ReduceMotion.Never,
} as const;

/**
 * Universal Shared Transition for Profile Avatars and Status Cards.
 * Ensures uniform physics for all properties (width, height, position, radius)
 * so they morph in perfect synchronization.
 */
export const SOUL_LIQUID_TRANSITION = SharedTransition.custom((values) => {
  'worklet';
  return {
    width: withSpring(values.targetWidth, SOUL_LIQUID_SPRING),
    height: withSpring(values.targetHeight, SOUL_LIQUID_SPRING),
    originX: withSpring(values.targetOriginX, SOUL_LIQUID_SPRING),
    originY: withSpring(values.targetOriginY, SOUL_LIQUID_SPRING),
    borderRadius: withSpring(values.targetBorderRadius, SOUL_LIQUID_SPRING),
  };
});

// Alias for backwards compatibility
export const PROFILE_AVATAR_SHARED_TRANSITION = SOUL_LIQUID_TRANSITION;

export type SpringConfig = typeof LIQUID_GLASS_SPRING;
export type TimingConfig = typeof LIQUID_TIMING;
