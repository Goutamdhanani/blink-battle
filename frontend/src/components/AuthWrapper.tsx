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

// Helper to generate UUID v4 for request ID
const generateRequestId = (): string => {
  // Use native crypto.randomUUID if available, fallback to polyfill
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Store last auth flow data for debug panel
export interface AuthDebugData {
  apiUrl: string;
  lastNonceRequest?: {
    requestId: string;
    timestamp: number;
    response?: { nonce: string; requestId?: string };
    error?: string;
  };
  lastWalletAuth?: {
    timestamp: number;
    nonce: string;
    finalPayload?: {
      status: string;
      address?: string;
      message?: string; // Redacted
      signature?: string; // Redacted
    };
    error?: string;
  };
  lastVerifyRequest?: {
    requestId: string;
    timestamp: number;
    httpStatus?: number;
    response?: any;
    error?: string;
  };
}

// Initialize global debug data store (accessible from debug panel)
// Only in development or when debug mode is enabled
const initDebugData = (): void => {
  if (!((window as any).__authDebugData)) {
    (window as any).__authDebugData = {
      apiUrl: API_URL,
    } as AuthDebugData;
  }
};

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

    // Initialize debug data if not already done
    initDebugData();

    // Set up timeout using a ref to track if request is still pending
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      setError('Authentication timed out. Please try again.');
      setLoading(false);
    }, AUTH_TIMEOUT_MS);

    try {
      // Step 1: Get nonce from backend
      const nonceRequestId = generateRequestId();
      const nonceTimestamp = Date.now();
      
      (window as any).__authDebugData.lastNonceRequest = {
        requestId: nonceRequestId,
        timestamp: nonceTimestamp,
      };

      const nonceRes = await fetch(`${API_URL}/api/auth/nonce`, {
        headers: {
          'X-Request-Id': nonceRequestId,
        },
      });
      
      if (!nonceRes.ok) {
        let errorText = `Failed to get nonce (HTTP ${nonceRes.status})`;
        try {
          const errorBody = await nonceRes.json();
          errorText = errorBody.error || errorText;
          (window as any).__authDebugData.lastNonceRequest!.error = JSON.stringify(errorBody);
        } catch {
          const textBody = await nonceRes.text();
          (window as any).__authDebugData.lastNonceRequest!.error = textBody;
          errorText = textBody || errorText;
        }
        throw new Error(errorText);
      }
      
      const nonceData = await nonceRes.json();
      const { nonce } = nonceData;
      
      (window as any).__authDebugData.lastNonceRequest!.response = nonceData;

      if (timedOut) return; // Exit if already timed out

      // Step 2: Call MiniKit.walletAuth() - only after MiniKit is ready
      const walletAuthTimestamp = Date.now();
      (window as any).__authDebugData.lastWalletAuth = {
        timestamp: walletAuthTimestamp,
        nonce,
      };

      const { finalPayload } = await MiniKit.commandsAsync.walletAuth({
        nonce: nonce,
        expirationTime: new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000),
        statement: 'Sign in to Blink Battle',
      });

      // Clear timeout on response
      clearTimeout(timeoutId);
      
      if (timedOut) return; // Exit if already timed out

      // Redact sensitive fields for debug display
      const redactString = (str: string | undefined, showChars = 6): string => {
        if (!str || str.length <= showChars * 2) return '***';
        return `${str.substring(0, showChars)}...${str.substring(str.length - showChars)}`;
      };

      (window as any).__authDebugData.lastWalletAuth!.finalPayload = {
        status: finalPayload.status,
        address: (finalPayload as any).address ? redactString((finalPayload as any).address, 6) : undefined,
        message: (finalPayload as any).message ? redactString((finalPayload as any).message, 20) : undefined,
        signature: (finalPayload as any).signature ? redactString((finalPayload as any).signature, 8) : undefined,
      };

      // Check for errors in payload
      if (finalPayload.status === 'error') {
        const errorCode = finalPayload.error_code || 'unknown_error';
        console.error('[Auth] MiniKit error:', errorCode);
        (window as any).__authDebugData.lastWalletAuth!.error = `${errorCode}: ${(finalPayload as any).error_message || 'Unknown error'}`;
        throw new Error(
          errorCode === 'user_rejected'
            ? 'Sign-in was cancelled'
            : `Authentication failed: ${errorCode}`
        );
      }

      // Step 3: Verify SIWE on backend
      const verifyRequestId = generateRequestId();
      const verifyTimestamp = Date.now();

      (window as any).__authDebugData.lastVerifyRequest = {
        requestId: verifyRequestId,
        timestamp: verifyTimestamp,
      };

      const verifyRes = await fetch(`${API_URL}/api/auth/verify-siwe`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Request-Id': verifyRequestId,
        },
        body: JSON.stringify({ payload: finalPayload }),
      });

      (window as any).__authDebugData.lastVerifyRequest!.httpStatus = verifyRes.status;

      if (!verifyRes.ok) {
        // Try to extract detailed error message from backend
        let errorMessage = `Backend verification failed (HTTP ${verifyRes.status})`;
        let errorDetails = null;
        
        try {
          const errorBody = await verifyRes.json();
          errorMessage = errorBody.error || errorMessage;
          errorDetails = errorBody;
          (window as any).__authDebugData.lastVerifyRequest!.response = errorBody;
        } catch {
          // If JSON parsing fails, try to get text
          try {
            const textBody = await verifyRes.text();
            if (textBody) {
              errorMessage = textBody;
              (window as any).__authDebugData.lastVerifyRequest!.response = { text: textBody };
            }
          } catch {
            // Ignore
          }
        }

        console.error('[Auth] Backend verification error:', errorDetails || errorMessage);
        
        // Construct user-friendly error with details
        const detailedError = errorDetails
          ? `${errorMessage}${errorDetails.hint ? `\n\nHint: ${errorDetails.hint}` : ''}${errorDetails.requestId ? `\n\nRequest ID: ${errorDetails.requestId}` : ''}`
          : errorMessage;

        throw new Error(detailedError);
      }

      const verifyData = await verifyRes.json();
      (window as any).__authDebugData.lastVerifyRequest!.response = verifyData;

      if (verifyData.success) {
        setToken(verifyData.token);
        setUser(verifyData.user);
        sendHaptic('success');
      } else {
        throw new Error(verifyData.error || 'Backend verification failed');
      }
    } catch (err: any) {
      if (!timedOut) {
        console.error('[Auth] Authentication error:', err);
        setError(err.message || 'Authentication failed');
        sendHaptic('error');
        clearTimeout(timeoutId);
      }
    } finally {
      if (!timedOut) {
        setLoading(false);
      }
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
