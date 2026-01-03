import { useEffect, useRef, useCallback } from 'react';

/**
 * Sound configuration
 * Note: Sound files are optional - if not present, the game will work without audio
 * To add sounds, place files in public/sounds/ directory
 */
const SOUNDS = {
  countdown: '/sounds/tick.mp3',
  spawn: '/sounds/spawn.mp3',
  tap: '/sounds/tap.mp3',
  win: '/sounds/win.mp3',
  lose: '/sounds/lose.mp3',
} as const;

type SoundKey = keyof typeof SOUNDS;

/**
 * Custom hook for preloading and playing game sounds
 * Ensures no audio delay during gameplay
 */
export const useGameSounds = () => {
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const isEnabledRef = useRef<boolean>(true);

  /**
   * Preload all sounds on mount
   */
  useEffect(() => {
    Object.entries(SOUNDS).forEach(([key, src]) => {
      try {
        const audio = new Audio(src);
        audio.preload = 'auto';
        audio.volume = 0.5;
        audioRefs.current[key] = audio;
        
        // Handle load errors gracefully (sounds may not exist yet)
        audio.addEventListener('error', () => {
          console.warn(`[GameSounds] Failed to load sound: ${src}`);
        });
      } catch (error) {
        console.warn(`[GameSounds] Error creating audio element for ${key}:`, error);
      }
    });

    // Cleanup on unmount
    return () => {
      Object.values(audioRefs.current).forEach(audio => {
        audio.pause();
        audio.src = '';
      });
    };
  }, []);

  /**
   * Play a sound by key
   */
  const playSound = useCallback((soundKey: SoundKey) => {
    if (!isEnabledRef.current) return;

    const audio = audioRefs.current[soundKey];
    if (audio) {
      // Reset to start and play
      audio.currentTime = 0;
      audio.play().catch((error) => {
        // Ignore autoplay errors (browser policy)
        console.debug(`[GameSounds] Could not play ${soundKey}:`, error.message);
      });
    }
  }, []);

  /**
   * Enable/disable sound
   */
  const setEnabled = useCallback((enabled: boolean) => {
    isEnabledRef.current = enabled;
  }, []);

  /**
   * Set volume for all sounds (0.0 to 1.0)
   */
  const setVolume = useCallback((volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    Object.values(audioRefs.current).forEach(audio => {
      audio.volume = clampedVolume;
    });
  }, []);

  return {
    playSound,
    setEnabled,
    setVolume,
  };
};
