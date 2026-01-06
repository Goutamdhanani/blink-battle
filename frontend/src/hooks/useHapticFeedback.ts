/**
 * useHapticFeedback Hook
 * 
 * React hook for triggering haptic feedback patterns on supported devices.
 */

import { useCallback } from 'react';

export type HapticPattern = 
  | 'success'      // Light tap for correct actions
  | 'error'        // Strong vibration for errors
  | 'warning'      // Medium vibration for warnings
  | 'light'        // Subtle feedback
  | 'medium'       // Medium feedback
  | 'heavy'        // Strong feedback
  | 'double'       // Two quick taps
  | 'triple'       // Three quick taps
  | 'selection'    // Very light tap for selections
  | 'notification';// Pattern for notifications

export function useHapticFeedback() {
  /**
   * Check if haptic feedback is supported
   */
  const isSupported = useCallback((): boolean => {
    return 'vibrate' in navigator || 'Vibration' in window;
  }, []);

  /**
   * Trigger haptic feedback with a specific pattern
   */
  const trigger = useCallback((pattern: HapticPattern = 'light') => {
    if (!isSupported()) {
      return;
    }

    // Check if user has disabled haptics in settings (if implemented)
    const hapticsEnabled = localStorage.getItem('haptics_enabled') !== 'false';
    if (!hapticsEnabled) {
      return;
    }

    try {
      switch (pattern) {
        case 'success':
          // Single medium-light tap
          navigator.vibrate(50);
          break;

        case 'error':
          // Two strong taps
          navigator.vibrate([100, 50, 100]);
          break;

        case 'warning':
          // Single medium tap
          navigator.vibrate(75);
          break;

        case 'light':
          // Very light tap
          navigator.vibrate(30);
          break;

        case 'medium':
          // Medium tap
          navigator.vibrate(60);
          break;

        case 'heavy':
          // Strong tap
          navigator.vibrate(100);
          break;

        case 'double':
          // Two quick taps
          navigator.vibrate([40, 40, 40]);
          break;

        case 'triple':
          // Three quick taps
          navigator.vibrate([30, 30, 30, 30, 30]);
          break;

        case 'selection':
          // Very subtle tap for UI selections
          navigator.vibrate(20);
          break;

        case 'notification':
          // Distinctive pattern for notifications
          navigator.vibrate([50, 50, 50, 50, 100]);
          break;

        default:
          navigator.vibrate(50);
      }
    } catch (error) {
      console.warn('Haptic feedback failed:', error);
    }
  }, [isSupported]);

  /**
   * Trigger success feedback (for correct answers, achievements)
   */
  const success = useCallback(() => {
    trigger('success');
  }, [trigger]);

  /**
   * Trigger error feedback (for wrong answers, failures)
   */
  const error = useCallback(() => {
    trigger('error');
  }, [trigger]);

  /**
   * Trigger selection feedback (for button presses, taps)
   */
  const selection = useCallback(() => {
    trigger('selection');
  }, [trigger]);

  /**
   * Trigger custom vibration pattern
   */
  const custom = useCallback((pattern: number | number[]) => {
    if (!isSupported()) {
      return;
    }

    const hapticsEnabled = localStorage.getItem('haptics_enabled') !== 'false';
    if (!hapticsEnabled) {
      return;
    }

    try {
      navigator.vibrate(pattern);
    } catch (error) {
      console.warn('Custom haptic feedback failed:', error);
    }
  }, [isSupported]);

  /**
   * Stop all vibrations
   */
  const stop = useCallback(() => {
    if (isSupported()) {
      try {
        navigator.vibrate(0);
      } catch (error) {
        console.warn('Failed to stop vibration:', error);
      }
    }
  }, [isSupported]);

  /**
   * Enable haptic feedback
   */
  const enable = useCallback(() => {
    localStorage.setItem('haptics_enabled', 'true');
  }, []);

  /**
   * Disable haptic feedback
   */
  const disable = useCallback(() => {
    localStorage.setItem('haptics_enabled', 'false');
  }, []);

  /**
   * Check if haptics are enabled
   */
  const isEnabled = useCallback((): boolean => {
    return localStorage.getItem('haptics_enabled') !== 'false';
  }, []);

  return {
    isSupported: isSupported(),
    isEnabled: isEnabled(),
    trigger,
    success,
    error,
    selection,
    custom,
    stop,
    enable,
    disable,
  };
}
