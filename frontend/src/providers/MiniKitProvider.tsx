import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { MiniKit, VerificationLevel, ISuccessResult } from '@worldcoin/minikit-js';

interface User {
  id: string;
  walletAddress?: string;
  verificationLevel?: string;
  worldIdVerified?: boolean;
  nullifierHash?: string;
}

interface MiniKitContextType {
  isInstalled: boolean;
  user: User | null;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  logout: () => void;
  verifyWithWorldId: () => Promise<void>;
}

const MiniKitContext = createContext<MiniKitContextType | undefined>(undefined);

interface MiniKitProviderProps {
  children: ReactNode;
}

export const MiniKitProvider: React.FC<MiniKitProviderProps> = ({ children }) => {
  const [isInstalled, setIsInstalled] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check if running in MiniKit environment
    const installed = MiniKit.isInstalled();
    setIsInstalled(installed);
    
    if (installed) {
      console.log('✅ MiniKit is installed');
      // Initialize MiniKit with app ID
      const appId = import.meta.env.VITE_APP_ID;
      if (appId && appId !== 'app_staging_your_app_id') {
        try {
          MiniKit.install(appId);
          console.log('✅ MiniKit initialized with app ID:', appId);
        } catch (error) {
          console.warn('⚠️ MiniKit initialization error:', error);
        }
      }
    } else {
      console.log('ℹ️ MiniKit not installed - running in browser mode');
    }

    // Check for existing authentication
    const savedUser = localStorage.getItem('minikit_user');
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        setIsAuthenticated(true);
      } catch (error) {
        console.error('Error parsing saved user:', error);
        localStorage.removeItem('minikit_user');
      }
    }
  }, []);

  const login = async () => {
    try {
      if (!isInstalled) {
        console.log('ℹ️ MiniKit not installed, using demo authentication');
        // Demo mode for browser testing
        const demoUser: User = {
          id: `demo_${Date.now()}`,
          walletAddress: '0x0000000000000000000000000000000000000000',
          verificationLevel: 'orb',
          worldIdVerified: false,
        };
        setUser(demoUser);
        setIsAuthenticated(true);
        localStorage.setItem('minikit_user', JSON.stringify(demoUser));
        return;
      }

      // Use MiniKit for actual authentication
      console.log('🔐 Initiating MiniKit authentication...');
      
      // Generate cryptographically secure nonce
      const nonceArray = new Uint8Array(16);
      crypto.getRandomValues(nonceArray);
      const nonce = Array.from(nonceArray, byte => byte.toString(16).padStart(2, '0')).join('');
      
      // Request wallet address from MiniKit with 1 hour expiration (security best practice)
      const { finalPayload } = await MiniKit.commandsAsync.walletAuth({
        nonce,
        requestId: `auth_${Date.now()}`,
        expirationTime: new Date(Date.now() + 60 * 60 * 1000), // 1 hour instead of 7 days
        notBefore: new Date(),
        statement: 'Sign in to Blink Battle Brain Training',
      });

      if (finalPayload.status === 'success') {
        const authenticatedUser: User = {
          id: finalPayload.address || `user_${Date.now()}`,
          walletAddress: finalPayload.address,
          verificationLevel: 'verified',
          worldIdVerified: false,
        };
        
        setUser(authenticatedUser);
        setIsAuthenticated(true);
        localStorage.setItem('minikit_user', JSON.stringify(authenticatedUser));
        console.log('✅ Authentication successful');
      } else {
        console.error('❌ Authentication failed:', finalPayload);
        throw new Error('Authentication failed');
      }
    } catch (error) {
      console.error('❌ Login error:', error);
      throw error;
    }
  };

  const verifyWithWorldId = async () => {
    try {
      if (!isInstalled) {
        console.log('ℹ️ MiniKit not installed, simulating World ID verification');
        // Demo mode - simulate verification
        if (user) {
          const verifiedUser: User = {
            ...user,
            worldIdVerified: true,
            verificationLevel: 'orb',
            nullifierHash: `demo_nullifier_${Date.now()}`,
          };
          setUser(verifiedUser);
          localStorage.setItem('minikit_user', JSON.stringify(verifiedUser));
          console.log('✅ Demo World ID verification successful');
        }
        return;
      }

      console.log('🌐 Initiating World ID verification...');
      
      // Generate unique nonce for this verification
      const nonceArray = new Uint8Array(16);
      crypto.getRandomValues(nonceArray);
      const nonce = Array.from(nonceArray, byte => byte.toString(16).padStart(2, '0')).join('');

      // Verify with World ID using MiniKit
      const { finalPayload } = await MiniKit.commandsAsync.verify({
        action: 'verify-unique-human', // Action ID - should match your Worldcoin Developer Portal configuration
        signal: user?.id || '', // User identifier to prevent multiple verifications
        verification_level: VerificationLevel.Orb, // Require orb verification for highest security
      });

      if (finalPayload.status === 'success') {
        const verificationResult = finalPayload as ISuccessResult;
        
        const verifiedUser: User = {
          ...user!,
          worldIdVerified: true,
          verificationLevel: 'orb',
          nullifierHash: verificationResult.nullifier_hash,
        };
        
        setUser(verifiedUser);
        localStorage.setItem('minikit_user', JSON.stringify(verifiedUser));
        console.log('✅ World ID verification successful');
        console.log('Nullifier hash:', verificationResult.nullifier_hash);
      } else {
        console.error('❌ World ID verification failed:', finalPayload);
        throw new Error('World ID verification failed');
      }
    } catch (error) {
      console.error('❌ World ID verification error:', error);
      throw error;
    }
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('minikit_user');
    console.log('👋 User logged out');
  };

  return (
    <MiniKitContext.Provider
      value={{
        isInstalled,
        user,
        isAuthenticated,
        login,
        logout,
        verifyWithWorldId,
      }}
    >
      {children}
    </MiniKitContext.Provider>
  );
};

export const useMiniKit = () => {
  const context = useContext(MiniKitContext);
  if (context === undefined) {
    throw new Error('useMiniKit must be used within a MiniKitProvider');
  }
  return context;
};

