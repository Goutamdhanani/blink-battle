import React, { useEffect, useState } from 'react';
import { MiniKit } from '@worldcoin/minikit-js';
import { useGameContext } from '../context/GameContext';
import { useMiniKitReady } from '../hooks/useMiniKitReady';
import { apiClient, API_URL, authLog, logAuthError } from '../lib/api';
import './AuthWrapper.css';
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

  // Helper function to retry a request
  const withRetry = async <T,>(
    fn: () => Promise<T>,
    maxRetries = 3,
    delayMs = 1000
  ): Promise<T> => {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        authLog(`[Auth] Request attempt ${attempt}/${maxRetries} failed:`, error.message);
        
        // Don't retry on non-network errors
        if (error.response?.status && error.response.status < 500) {
          throw error;
        }
        
        if (attempt < maxRetries) {
          authLog(`[Auth] Retrying in ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          delayMs *= 2; // Exponential backoff
        }
      }
    }
    
    throw lastError;
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
      // Step 1: Get nonce from backend (with retry)
      const nonceRequestId = generateRequestId();
      const nonceTimestamp = Date.now();
      
      (window as any).__authDebugData.lastNonceRequest = {
        requestId: nonceRequestId,
        timestamp: nonceTimestamp,
      };

      const nonceRes = await withRetry(() => 
        apiClient.get('/api/auth/nonce', {
          headers: {
            'X-Request-Id': nonceRequestId,
          },
        }),
        3, // max 3 retries
        1000 // start with 1 second delay
      );
      
      const nonceData = nonceRes.data;
      const { nonce } = nonceData;
      
      (window as any).__authDebugData.lastNonceRequest!.response = nonceData;

      if (timedOut) return; // Exit if already timed out

      // Helper to redact sensitive data for logging
      const redactString = (str: string | undefined, showChars = 6): string => {
        if (!str || str.length < showChars * 2 + 3) return '***';
        return `${str.substring(0, showChars)}...${str.substring(str.length - showChars)}`;
      };

      // Step 2: Call MiniKit.walletAuth() - only after MiniKit is ready
      const walletAuthTimestamp = Date.now();
      (window as any).__authDebugData.lastWalletAuth = {
        timestamp: walletAuthTimestamp,
        nonce,
      };

      authLog('[Auth] Calling MiniKit.walletAuth with nonce:', redactString(nonce, 8));
      
      const { finalPayload } = await MiniKit.commandsAsync.walletAuth({
        nonce: nonce,
        expirationTime: new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000),
        statement: 'Sign in to Blink Battle',
      });

      authLog('[Auth] MiniKit.walletAuth completed, finalPayload:', finalPayload ? 'present' : 'undefined');

      // Clear timeout on response
      clearTimeout(timeoutId);
      
      if (timedOut) return; // Exit if already timed out

      // Validate finalPayload exists
      if (!finalPayload) {
        const errorMsg = 'MiniKit walletAuth returned undefined payload';
        logAuthError('[Auth]', errorMsg);
        (window as any).__authDebugData.lastWalletAuth!.error = errorMsg;
        throw new Error(
          'Authentication failed: No response from wallet.\n\n' +
          'Possible causes:\n' +
          '• Not running in World App (open this app in World App)\n' +
          '• MiniKit API version incompatibility\n' +
          '• Origin not allowed in Worldcoin Dev Portal\n\n' +
          'Check the debug panel (?debug=1) for more details.'
        );
      }

      authLog('[Auth] finalPayload.status:', finalPayload.status);

      (window as any).__authDebugData.lastWalletAuth!.finalPayload = {
        status: finalPayload.status,
        address: (finalPayload as any).address ? redactString((finalPayload as any).address, 6) : undefined,
        message: (finalPayload as any).message ? redactString((finalPayload as any).message, 20) : undefined,
        signature: (finalPayload as any).signature ? redactString((finalPayload as any).signature, 8) : undefined,
      };

      // Check for errors in payload
      if (finalPayload.status === 'error') {
        const errorCode = (finalPayload.error_code as string) || 'unknown_error';
        const errorMessage = (finalPayload as any).error_message || 'Unknown error';
        logAuthError('[Auth] MiniKit error:', errorCode, errorMessage);
        (window as any).__authDebugData.lastWalletAuth!.error = `${errorCode}: ${errorMessage}`;
        
        // Provide actionable error messages based on error code
        let userMessage = '';
        switch (errorCode) {
          case 'user_rejected':
            userMessage = 'Sign-in was cancelled. Please try again when ready.';
            break;
          case 'origin_not_allowed':
          case 'domain_not_allowed':
            userMessage = `Authentication blocked: This app's domain is not allowed.\n\nTo fix:\n1. Go to Worldcoin Dev Portal (https://developer.worldcoin.org)\n2. Select your app\n3. Add this origin to "Allowed Origins" under MiniKit settings\n4. Current origin: ${window.location.origin}`;
            break;
          case 'unsupported_command':
          case 'command_not_supported':
            userMessage = 'Authentication failed: MiniKit command not supported.\n\nThis may indicate:\n- World App version is outdated (update required)\n- MiniKit API version mismatch\n- App configuration issue\n\nPlease update World App or contact support.';
            break;
          case 'network_error':
            userMessage = 'Network error during authentication. Please check your connection and try again.';
            break;
          case 'invalid_payload':
          case 'invalid_request':
            userMessage = 'Authentication request invalid. This may be a configuration issue. Please contact support.';
            break;
          default:
            userMessage = `Authentication failed: ${errorCode}\n\nError: ${errorMessage}`;
        }
        
        throw new Error(userMessage);
      }

      // Explicitly check for success status before proceeding
      if (finalPayload.status !== 'success') {
        const errorMsg = `Unexpected wallet auth status: ${(finalPayload as any).status}`;
        logAuthError('[Auth]', errorMsg);
        (window as any).__authDebugData.lastWalletAuth!.error = errorMsg;
        throw new Error(`Authentication failed: Unexpected response status. Please try again.`);
      }

      authLog('[Auth] Wallet auth successful, proceeding to verify SIWE signature');

      // Step 3: Verify SIWE on backend
      const verifyRequestId = generateRequestId();
      const verifyTimestamp = Date.now();

      (window as any).__authDebugData.lastVerifyRequest = {
        requestId: verifyRequestId,
        timestamp: verifyTimestamp,
      };

      authLog('[Auth] Sending POST to /api/auth/verify-siwe', {
        requestId: verifyRequestId,
        apiUrl: API_URL,
        hasPayload: !!finalPayload,
        hasNonce: !!nonce,
      });

      const verifyRes = await apiClient.post('/api/auth/verify-siwe', 
        { payload: finalPayload, nonce },
        {
          headers: { 
            'X-Request-Id': verifyRequestId,
          },
        }
      );

      authLog('[Auth] Received response from /api/auth/verify-siwe', {
        status: verifyRes.status,
        hasData: !!verifyRes.data,
      });

      const verifyData = verifyRes.data;
      (window as any).__authDebugData.lastVerifyRequest!.response = verifyData;
      (window as any).__authDebugData.lastVerifyRequest!.httpStatus = verifyRes.status;

      if (verifyData.success) {
        authLog('[Auth] Verification successful, storing token and user');
        setToken(verifyData.token);
        setUser(verifyData.user);
        sendHaptic('success');
      } else {
        throw new Error(verifyData.error || 'Backend verification failed');
      }
    } catch (err: any) {
      if (!timedOut) {
        logAuthError('[Auth] Authentication error:', err);
        
        // Better error handling for axios errors
        let errorMessage = err.message || 'Authentication failed';
        let errorDetails = '';
        
        if (err.response?.data) {
          // HTTP error response from backend
          const errorData = err.response.data;
          errorMessage = errorData.error || errorMessage;
          
          // Store error details in debug data
          if ((window as any).__authDebugData.lastVerifyRequest) {
            (window as any).__authDebugData.lastVerifyRequest.httpStatus = err.response.status;
            (window as any).__authDebugData.lastVerifyRequest.response = errorData;
            (window as any).__authDebugData.lastVerifyRequest.error = errorMessage;
          }
          
          // Construct user-friendly error with hints
          if (errorData.hint) {
            errorDetails += `\n\nHint: ${errorData.hint}`;
          }
          if (errorData.requestId) {
            errorDetails += `\n\nRequest ID: ${errorData.requestId}`;
          }
          
          errorMessage = `${errorMessage} (HTTP ${err.response.status})${errorDetails}`;
        } else if (err.request && !err.response) {
          // Network error - no response received
          logAuthError('[Auth] Network error - request was sent but no response received', {
            url: err.config?.url,
            method: err.config?.method,
          });
          errorMessage = 'Network error: Unable to reach the server. Please check your connection and try again.';
          
          // Store network error in debug data
          if ((window as any).__authDebugData.lastVerifyRequest) {
            (window as any).__authDebugData.lastVerifyRequest.error = 'Network error - no response received';
          }
        } else if (err.code === 'ECONNABORTED') {
          // Request timeout
          errorMessage = 'Request timed out. Please check your connection and try again.';
        }
        
        logAuthError('[Auth] Final error message shown to user:', errorMessage);
        setError(errorMessage);
        sendHaptic('error');
        clearTimeout(timeoutId);
      }
    } finally {
      if (!timedOut) {
        setLoading(false);
      }
    }
  };

  // Validate existing token on mount
  useEffect(() => {
    const validateSession = async () => {
      // If we have a token, validate it with the backend
      if (state.token && state.user) {
        try {
          const response = await apiClient.get('/api/auth/me');
          if (response.data.success) {
            // Token is valid, update user info if needed
            const serverUser = response.data.user;
            if (
              serverUser.wins !== state.user.wins ||
              serverUser.losses !== state.user.losses ||
              serverUser.avgReactionTime !== state.user.avgReactionTime
            ) {
              // Update user info from server
              setUser(serverUser);
            }
          }
        } catch (error: any) {
          // Token is invalid or expired
          logAuthError('[Auth] Session validation failed:', error);
          // Clear invalid session
          setToken(null);
          setUser(null);
        }
      }
    };

    // Only validate if already authenticated
    if (state.token && state.user) {
      validateSession();
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
