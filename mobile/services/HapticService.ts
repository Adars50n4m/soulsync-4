import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * HapticService — Safe haptics for all environments.
 * 
 * Silences logs on iOS Simulator and prevents crashes on devices 
 * that don't support specific haptic patterns.
 */

const isSimulator = Platform.OS === 'ios' && 
  ((Platform as any).constants?.model?.includes('Simulator') || 
   (Platform as any).constants?.isTesting);

export const hapticService = {
  /**
   * Impact feedback (light, medium, heavy)
   */
  impact: async (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    if (isSimulator) return; // Skip to avoid log spam
    try {
      await Haptics.impactAsync(style);
    } catch (e) {
      // Ignore errors on non-supported devices
    }
  },

  /**
   * Notification feedback (success, warning, error)
   */
  notification: async (type: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType.Success) => {
    if (isSimulator) return;
    try {
      await Haptics.notificationAsync(type);
    } catch (e) {
      // Ignore
    }
  },

  /**
   * Selection feedback (subtle tap)
   */
  selection: async () => {
    if (isSimulator) return;
    try {
      await Haptics.selectionAsync();
    } catch (e) {
      // Ignore
    }
  },
};

export default hapticService;
