import React, { useEffect, useState } from 'react';
import { MiniKit } from '@worldcoin/minikit-js';
import { useGameContext } from '../context/GameContext';
import { useMiniKitReady } from '../hooks/useMiniKitReady';
import './AuthWrapper.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const AUTH_TIMEOUT_MS = 15000; // 15 seconds timeout

interface AuthWrapperProps {
  children: React.ReactNode;
}

const AuthWrapper: React.FC<AuthWrapperProps> = ({ children }) => {
  const { state, setUser, setToken } = useGameContext();
  const { isReady, isInstalled } = useMiniKitReady();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authStarted, setAuthStarted] = useState(false);

  const sendHaptic = (style: 'success' | 'error') => {
    try {
      if (MiniKit.isInstalled()) {
        MiniKit.commands.sendHapticFeedback({
          hapticsType: 'notification',
          style,
        });
      }
    } catch (e) {
      // Ignore haptic errors
    }
  };

  const authenticate = async () => {
    setLoading(true);
    setError(null);
    setAuthStarted(true);

    // Set up timeout
    const timeoutId = setTimeout(() => {
      if (loading) {
        setError('Authentication timed out. Please try again.');
        setLoading(false);
      }
    }, AUTH_TIMEOUT_MS);

    try {
      // Step 1: Get nonce from backend
      const nonceRes = await fetch(`${API_URL}/api/auth/nonce`);
      if (!nonceRes.ok) {
        throw new Error('Failed to get authentication nonce');
      }
      const { nonce } = await nonceRes.json();

      // Step 2: Call MiniKit.walletAuth() - only after MiniKit is ready
      const { finalPayload } = await MiniKit.commandsAsync.walletAuth({
        nonce: nonce,
        expirationTime: new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000),
        statement: 'Sign in to Blink Battle',
      });

      // Clear timeout on response
      clearTimeout(timeoutId);

      // Check for errors in payload
      if (finalPayload.status === 'error') {
        const errorCode = finalPayload.error_code || 'unknown_error';
        console.error('[Auth] MiniKit error:', errorCode);
        throw new Error(
          errorCode === 'user_rejected'
            ? 'Sign-in was cancelled'
            : `Authentication failed: ${errorCode}`
        );
      }

      // Step 3: Verify SIWE on backend
      const verifyRes = await fetch(`${API_URL}/api/auth/verify-siwe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: finalPayload }),
      });

      if (!verifyRes.ok) {
        throw new Error('Backend verification failed');
      }

      const verifyData = await verifyRes.json();

      if (verifyData.success) {
        setToken(verifyData.token);
        setUser(verifyData.user);
        sendHaptic('success');
      } else {
        throw new Error(verifyData.error || 'Backend verification failed');
      }
    } catch (err: any) {
      console.error('[Auth] Authentication error:', err);
      setError(err.message || 'Authentication failed');
      sendHaptic('error');
      clearTimeout(timeoutId);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // If already authenticated, skip
    if (state.token && state.user) {
      return;
    }

    // Only auto-trigger auth if running in World App and MiniKit is ready
    // Otherwise, show UI with button to trigger manually
    if (isReady && isInstalled && !authStarted) {
      // Small delay to ensure UI is ready
      const timer = setTimeout(() => {
        authenticate();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isReady, isInstalled, state.token, state.user, authStarted]);

  // Already authenticated - render the app
  if (state.token && state.user) {
    return <>{children}</>;
  }

  // Waiting for MiniKit to be ready
  if (!isReady) {
    return (
      <div className="auth-wrapper auth-loading">
        <div className="auth-content">
          <h1 className="auth-title">⚡ Blink Battle</h1>
          <div className="spinner"></div>
          <p className="auth-text">Initializing...</p>
        </div>
      </div>
    );
  }

  // Not running in World App
  if (!isInstalled) {
    return (
      <div className="auth-wrapper auth-not-installed">
        <div className="auth-content">
          <h1 className="auth-title">⚡ Blink Battle</h1>
          <div className="auth-icon">🌍</div>
          <h2 className="auth-subtitle">Open in World App</h2>
          <p className="auth-text">
            This is a World App Mini-App. Please open it inside the World App to play.
          </p>
          <div className="auth-instructions">
            <p>1. Install World App on your device</p>
            <p>2. Open World App</p>
            <p>3. Navigate to Mini-Apps</p>
            <p>4. Find and open Blink Battle</p>
          </div>
          <a
            href="https://worldcoin.org/download"
            target="_blank"
            rel="noopener noreferrer"
            className="auth-download-btn"
          >
            Download World App
          </a>
        </div>
      </div>
    );
  }

  // Loading state - authentication in progress
  if (loading) {
    return (
      <div className="auth-wrapper auth-loading">
        <div className="auth-content">
          <h1 className="auth-title">⚡ Blink Battle</h1>
          <div className="spinner"></div>
          <p className="auth-text">Please approve the sign-in request...</p>
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
          <div className="auth-error-icon">⚠️</div>
          <p className="auth-error-text">{error}</p>
          <button className="auth-retry-btn" onClick={authenticate}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Ready to authenticate - show connect button
  return (
    <div className="auth-wrapper auth-ready">
      <div className="auth-content">
        <h1 className="auth-title">⚡ Blink Battle</h1>
        <div className="auth-icon">⚡</div>
        <h2 className="auth-subtitle">Ready to Play</h2>
        <p className="auth-text">
          Test your reflexes in fast-paced PvP battles. Win WLD tokens!
        </p>
        <button className="auth-connect-btn" onClick={authenticate}>
          Connect Wallet
        </button>
      </div>
    </div>
  );
};

export default AuthWrapper;
