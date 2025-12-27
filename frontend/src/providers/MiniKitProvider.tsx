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
        const appId = import.meta.env.VITE_APP_ID;
        const platformWallet = import.meta.env.VITE_PLATFORM_WALLET_ADDRESS;
        
        // Validate critical environment variables
        if (!appId) {
          console.error('❌ VITE_APP_ID is not configured. Please set it in your .env file.');
          console.error('Example: VITE_APP_ID=app_staging_your_app_id');
          return;
        }
        
        if (!platformWallet) {
          console.warn('⚠️ VITE_PLATFORM_WALLET_ADDRESS is not configured. Payment features will not work.');
        } else if (!platformWallet.match(/^0x[a-fA-F0-9]{40}$/)) {
          console.error('❌ Invalid VITE_PLATFORM_WALLET_ADDRESS format. Must be a valid Ethereum address (0x...)');
        }
        
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

