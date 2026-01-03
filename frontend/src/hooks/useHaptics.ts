import { useCallback } from 'react';
import { minikit } from '../lib/minikit';

type HapticType = 'light' | 'medium' | 'heavy';

/**
 * Custom hook for haptic feedback
 * Supports both MiniKit haptics and browser Vibration API
 */
export const useHaptics = () => {
  /**
   * Trigger haptic feedback
   * Tries MiniKit first, falls back to Vibration API
   */
  const triggerHaptic = useCallback((type: HapticType = 'medium') => {
    // Try MiniKit haptics first (in World App)
    try {
      if (minikit.isInstalled()) {
        // Map haptic types to MiniKit styles
        const styleMap: Record<HapticType, 'success' | 'warning' | 'error'> = {
          light: 'success',
          medium: 'warning',
          heavy: 'error',
        };
        minikit.sendHaptic(styleMap[type]);
        return;
      }
    } catch (error) {
      console.debug('[Haptics] MiniKit haptics not available:', error);
    }

    // Fallback to Vibration API (standard browsers)
    try {
      if (navigator.vibrate) {
        const patterns: Record<HapticType, number> = {
          light: 10,
          medium: 25,
          heavy: 50,
        };
        navigator.vibrate(patterns[type]);
      }
    } catch (error) {
      console.debug('[Haptics] Vibration API not available:', error);
    }
  }, []);

  /**
   * Trigger multiple haptic pulses
   */
  const triggerPattern = useCallback((pattern: number[]) => {
    try {
      if (navigator.vibrate) {
        navigator.vibrate(pattern);
      }
    } catch (error) {
      console.debug('[Haptics] Pattern vibration failed:', error);
    }
  }, []);

  return {
    triggerHaptic,
    triggerPattern,
  };
};
