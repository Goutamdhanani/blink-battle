import React, { useEffect, useState, useCallback } from 'react';
import { MiniKit } from '@worldcoin/minikit-js';
import { minikit } from '../lib/minikit';
import { useGameContext } from '../context/GameContext';
import './AuthWrapper.css';

interface AuthWrapperProps {
  children: React.ReactNode;
}

const AuthWrapper: React.FC<AuthWrapperProps> = ({ children }) => {
  const { state, setUser, setToken } = useGameContext();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInWorldApp, setIsInWorldApp] = useState(false);

  const attemptAuth = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    // Check if running in World App
    const installed = MiniKit.isInstalled();
    setIsInWorldApp(installed);

    if (!installed) {
      // Not in World App - show fallback
      setLoading(false);
      return;
    }

    // Already authenticated
    if (state.token && state.user) {
      setLoading(false);
      return;
    }

    // Auto-authenticate via MiniKit
    try {
      const result = await minikit.signInWithWallet();
      
      if (result.success && result.token && result.user) {
        setToken(result.token);
        setUser(result.user);
        minikit.sendHaptic('success');
      } else {
        setError('Authentication failed');
        minikit.sendHaptic('error');
      }
    } catch (err: unknown) {
      console.error('Auto-auth error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to authenticate';
      setError(errorMessage);
      minikit.sendHaptic('error');
    } finally {
      setLoading(false);
    }
  }, [state.token, state.user, setToken, setUser]);

  useEffect(() => {
    attemptAuth();
  }, [attemptAuth]);

  // Loading state while authenticating
  if (loading) {
    return (
      <div className="auth-loading">
        <div className="spinner"></div>
        <p>Connecting to World App...</p>
      </div>
    );
  }

  // Not in World App
  if (!isInWorldApp) {
    return (
      <div className="not-in-world-app">
        <h1>⚡ Blink Battle</h1>
        <p>This is a Worldcoin Mini-App.</p>
        <p>Please open it inside the World App to play.</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="auth-error">
        <h1>Authentication Failed</h1>
        <p>{error}</p>
        <button onClick={attemptAuth}>Try Again</button>
      </div>
    );
  }

  // Not authenticated (shouldn't happen if walletAuth succeeded)
  if (!state.token || !state.user) {
    return (
      <div className="auth-error">
        <h1>Not Authenticated</h1>
        <button onClick={attemptAuth}>Retry</button>
      </div>
    );
  }

  // Authenticated - render the app
  return <>{children}</>;
};

export default AuthWrapper;
