import React, { useEffect, useState } from 'react';
import { MiniKit } from '@worldcoin/minikit-js';
import { useGameContext } from '../context/GameContext';
import './AuthWrapper.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface AuthWrapperProps {
  children: React.ReactNode;
}

const AuthWrapper: React.FC<AuthWrapperProps> = ({ children }) => {
  const { state, setUser, setToken } = useGameContext();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sendHaptic = (style: 'success' | 'error') => {
    try {
      MiniKit.commands.sendHapticFeedback({
        hapticsType: 'notification',
        style,
      });
    } catch (e) {
      // Ignore haptic errors
    }
  };

  const authenticate = async () => {
    setLoading(true);
    setError(null);

    try {
      // Step 1: Get nonce from backend
      const nonceRes = await fetch(`${API_URL}/api/auth/nonce`);
      const { nonce } = await nonceRes.json();

      // Step 2: Call MiniKit.walletAuth() directly without checking installation status
      const { finalPayload } = await MiniKit.commandsAsync.walletAuth({
        nonce: nonce,
        expirationTime: new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000),
        statement: 'Sign in to Blink Battle',
      });

      // If we get here with success, user approved the drawer
      if (finalPayload.status === 'error') {
        throw new Error(finalPayload.error_code || 'Authentication rejected');
      }

      // Step 3: Verify SIWE on backend
      const verifyRes = await fetch(`${API_URL}/api/auth/verify-siwe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: finalPayload }),
      });

      const verifyData = await verifyRes.json();

      if (verifyData.success) {
        setToken(verifyData.token);
        setUser(verifyData.user);
        sendHaptic('success');
      } else {
        throw new Error('Backend verification failed');
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      setError(err.message || 'Authentication failed');
      sendHaptic('error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // If already authenticated, skip
    if (state.token && state.user) {
      setLoading(false);
      return;
    }

    // Initiate authentication immediately; the native drawer appearance confirms World App context
    authenticate();
  }, []);

  // Loading state - shown briefly while drawer appears
  if (loading) {
    return (
      <div className="auth-wrapper auth-loading">
        <div className="auth-content">
          <h1 className="auth-title">⚡ Blink Battle</h1>
          <div className="spinner"></div>
          <p className="auth-text">Connecting...</p>
        </div>
      </div>
    );
  }

  // Error state - auth failed or user rejected
  if (error) {
    return (
      <div className="auth-wrapper auth-error">
        <div className="auth-content">
          <h1 className="auth-title">⚡ Blink Battle</h1>
          <p className="auth-error-text">{error}</p>
          <button className="auth-retry-btn" onClick={authenticate}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Not authenticated after attempt
  if (!state.token || !state.user) {
    return (
      <div className="auth-wrapper auth-error">
        <div className="auth-content">
          <h1 className="auth-title">⚡ Blink Battle</h1>
          <p className="auth-error-text">Please approve the sign-in request</p>
          <button className="auth-retry-btn" onClick={authenticate}>
            Sign In
          </button>
        </div>
      </div>
    );
  }

  // Authenticated - render the app
  return <>{children}</>;
};

export default AuthWrapper;
