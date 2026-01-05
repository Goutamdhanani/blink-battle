import React from 'react';

interface MiniKitProviderProps {
  children: React.ReactNode;
}

/**
 * Simplified MiniKit Provider wrapper for the brain training app
 * No authentication or payment features needed for brain training games
 */
export const MiniKitProvider: React.FC<MiniKitProviderProps> = ({ children }) => {
  return <>{children}</>;
};

