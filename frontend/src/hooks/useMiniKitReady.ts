import { useEffect, useState } from 'react';
import { MiniKit } from '@worldcoin/minikit-js';

/**
 * Hook to check MiniKit readiness
 * Note: MiniKit.install() is called by MiniKitProvider at app root
 * This hook just checks the status after initialization
 */
export const useMiniKitReady = () => {
  const [isReady, setIsReady] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkMiniKit = () => {
      try {
        // Check if MiniKit is installed (running in World App)
        const installed = MiniKit.isInstalled();
        setIsInstalled(installed);
        
        // Mark as ready regardless of installation status
        // This allows the app to show appropriate UI (either auth or "open in World App")
        setIsReady(true);
        
        if (installed) {
          console.log('[MiniKit] Ready to use');
        } else {
          setError('Not running in World App');
          console.log('[MiniKit] Not installed - app is not running in World App');
        }
      } catch (err) {
        console.error('[MiniKit] Check error:', err);
        setError('Failed to check MiniKit status');
        setIsReady(true); // Still mark as ready to show error UI
      }
    };

    // Small delay to ensure MiniKitProvider has completed installation
    const timer = setTimeout(checkMiniKit, 100);
    return () => clearTimeout(timer);
  }, []);

  return {
    isReady,
    isInstalled,
    error,
    MiniKit,
  };
};
