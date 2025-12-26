import { useEffect, useState } from 'react';
import { MiniKit } from '@worldcoin/minikit-js';

/**
 * Hook to properly initialize and check MiniKit readiness
 * Follows World Mini Apps docs: install MiniKit before triggering commands
 */
export const useMiniKitReady = () => {
  const [isReady, setIsReady] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeMiniKit = async () => {
      try {
        // Step 1: Install MiniKit (should be done before any commands)
        await MiniKit.install();
        
        // Step 2: Check if MiniKit is installed (running in World App)
        const installed = MiniKit.isInstalled();
        setIsInstalled(installed);
        
        // Step 3: Mark as ready if installed
        if (installed) {
          setIsReady(true);
          console.log('[MiniKit] Initialized successfully');
        } else {
          setError('Not running in World App');
          console.log('[MiniKit] Not installed - app is not running in World App');
        }
      } catch (err) {
        console.error('[MiniKit] Installation error:', err);
        setError('Failed to initialize MiniKit');
      }
    };

    initializeMiniKit();
  }, []);

  return {
    isReady,
    isInstalled,
    error,
    MiniKit,
  };
};
