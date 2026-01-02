import React from 'react';
import { MiniKit } from '@worldcoin/minikit-js';
import '../components/AuthWrapper.css'; // Reuse auth wrapper styles

interface MiniKitProviderProps {
  children: React.ReactNode;
}

/**
 * MiniKit Provider wrapper for the app
 * Installs MiniKit once at app root before any commands are triggered
 * This prevents race conditions per World Mini Apps docs
 */
export const MiniKitProvider: React.FC<MiniKitProviderProps> = ({ children }) => {
  const [error, setError] = React.useState<{ type: 'config' | 'init', message: string } | null>(null);

  React.useEffect(() => {
    const initMiniKit = async () => {
      if (typeof window === 'undefined') return;

      try {
        console.log('🔧 [MiniKitProvider] Initializing MiniKit...');
        
        const appId = import.meta.env.VITE_APP_ID;
        const platformWallet = import.meta.env.VITE_PLATFORM_WALLET_ADDRESS;
        
        // Validate critical environment variables
        if (!appId) {
          const errorMsg = 'VITE_APP_ID is not configured. Please set it in your .env file.';
          console.error('❌ [MiniKitProvider]', errorMsg);
          console.error('Example: VITE_APP_ID=app_staging_your_app_id');
          setError({ type: 'config', message: errorMsg });
          return;
        }
        
        if (!platformWallet) {
          console.warn('⚠️ [MiniKitProvider] VITE_PLATFORM_WALLET_ADDRESS is not configured. Payment features will not work.');
        } else if (!platformWallet.match(/^0x[a-fA-F0-9]{40}$/)) {
          console.error('❌ [MiniKitProvider] Invalid VITE_PLATFORM_WALLET_ADDRESS format. Must be a valid Ethereum address (0x...)');
        }
        
        console.log('📦 [MiniKitProvider] Installing MiniKit with App ID:', appId);
        
        // Install MiniKit before any commands are triggered
        await MiniKit.install(appId);
        
        const installed = MiniKit.isInstalled();
        
        console.log('✅ [MiniKitProvider] Installation complete:', {
          appId,
          isInstalled: installed,
          supportedCommands: (window as any).WorldApp?.supported_commands,
        });

        if (!installed) {
          console.warn('⚠️ [MiniKitProvider] MiniKit is not installed (not running in World App)');
        }
      } catch (error) {
        console.error('❌ [MiniKitProvider] Installation failed:', error);
        setError({ 
          type: 'init', 
          message: error instanceof Error ? error.message : 'Unknown error during MiniKit initialization'
        });
      }
    };

    initMiniKit();
  }, []);

  // If there's a critical configuration error, show it
  if (error?.type === 'config') {
    return (
      <div className="auth-wrapper auth-error">
        <div className="auth-content">
          <h1 className="auth-title">⚙️ Configuration Error</h1>
          <div className="auth-error-icon">⚠️</div>
          <p className="auth-error-text">{error.message}</p>
          <p className="auth-text">
            Please check your .env file and ensure VITE_APP_ID is set correctly.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

