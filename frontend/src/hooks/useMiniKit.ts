import { useEffect, useState } from 'react';
import { MiniKit } from '@worldcoin/minikit-js';

/**
 * Hook to check MiniKit availability and get user info
 */
export const useMiniKit = () => {
  const [isInstalled, setIsInstalled] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    // Check if running in World App
    const installed = MiniKit.isInstalled();
    setIsInstalled(installed);

    if (installed) {
      // Try to get user context from MiniKit
      // Note: These properties may not be directly accessible
      // They are typically available after authentication
      try {
        // In the actual implementation, wallet address comes from SIWE authentication
        // For now, we just mark as installed
        setWalletAddress(null); // Will be set after SIWE auth
        setUsername(null);
      } catch (error) {
        console.log('MiniKit context not yet available');
      }
    }
  }, []);

  return {
    isInstalled,
    walletAddress,
    username,
    MiniKit,
  };
};

/**
 * Hook to send haptic feedback
 */
export const useHapticFeedback = () => {
  const sendHaptic = (style: 'success' | 'warning' | 'error') => {
    if (MiniKit.isInstalled()) {
      MiniKit.commands.sendHapticFeedback({
        hapticsType: 'notification',
        style,
      });
    }
  };

  return { sendHaptic };
};
