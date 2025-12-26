import React from 'react';

interface MiniKitProviderProps {
  children: React.ReactNode;
}

/**
 * MiniKit Provider wrapper for the app
 * This provides the MiniKit context to all child components
 * Note: As of version 1.9.9, MiniKit does not require a provider wrapper
 * The SDK auto-initializes when used
 */
export const MiniKitProvider: React.FC<MiniKitProviderProps> = ({ children }) => {
  React.useEffect(() => {
    // MiniKit auto-initializes when accessed
    // Optional: You can add initialization logic here if needed
    if (typeof window !== 'undefined') {
      const appId = import.meta.env.VITE_APP_ID || 'app_staging_test';
      // MiniKit is ready to use
      console.log('MiniKit initialized with app ID:', appId);
    }
  }, []);

  return <>{children}</>;
};

