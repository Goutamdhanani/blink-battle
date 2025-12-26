import React, { useEffect, useState } from 'react';
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

  useEffect(() => {
    const initAuth = async () => {
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
        
        if (result.success) {
          setToken(result.token);
          setUser(result.user);
          minikit.sendHaptic('success');
        } else {
          setError('Authentication failed');
        }
      } catch (err: any) {
        console.error('Auto-auth error:', err);
        setError(err.message || 'Failed to authenticate');
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, [state.token, state.user, setToken, setUser]);

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
        <button onClick={() => window.location.reload()}>Try Again</button>
      </div>
    );
  }

  // Not authenticated (shouldn't happen if walletAuth succeeded)
  if (!state.token || !state.user) {
    return (
      <div className="auth-error">
        <h1>Not Authenticated</h1>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  // Authenticated - render the app
  return <>{children}</>;
};

export default AuthWrapper;
