import React from 'react';
import { MiniKit } from '@worldcoin/minikit-js';

interface MiniKitProviderProps {
  children: React.ReactNode;
}

/**
 * MiniKit Provider wrapper for the app
 * Installs MiniKit once at app root before any commands are triggered
 * This prevents race conditions per World Mini Apps docs
 */
export const MiniKitProvider: React.FC<MiniKitProviderProps> = ({ children }) => {
  React.useEffect(() => {
    const initMiniKit = async () => {
      if (typeof window === 'undefined') return;

      try {
        const appId = import.meta.env.VITE_APP_ID || 'app_staging_test';
        
        // Install MiniKit before any commands are triggered
        await MiniKit.install(appId);
        
        const installed = MiniKit.isInstalled();
        
        if (process.env.NODE_ENV === 'development') {
          console.log('[MiniKitProvider] Installation complete:', {
            appId,
            isInstalled: installed,
            supportedCommands: (window as any).WorldApp?.supported_commands,
          });
        }
      } catch (error) {
        console.error('[MiniKitProvider] Installation failed:', error);
      }
    };

    initMiniKit();
  }, []);

  return <>{children}</>;
};

