import React, { useState, useEffect } from 'react';
import { MiniKit } from '@worldcoin/minikit-js';
import type { AuthDebugData } from './AuthWrapper';
import './DebugPanel.css';

/**
 * Debug panel for MiniKit diagnostics and authentication flow debugging
 * Only shown in development mode or with ?debug=1 query param
 */
const DebugPanel: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [diagnostics, setDiagnostics] = useState({
    isInstalled: false,
    isReady: false,
    supportedCommands: [] as string[],
    worldAppVersion: 'unknown',
    apiUrl: '',
    errors: [] as string[],
    warnings: [] as string[],
    hasApiConfigError: false,
    miniKitVersion: 'unknown',
  });
  const [authDebugData, setAuthDebugData] = useState<AuthDebugData | null>(null);

  useEffect(() => {
    // Check if debug mode should be enabled
    const isDev = import.meta.env.DEV;
    const hasDebugParam = new URLSearchParams(window.location.search).get('debug') === '1';
    
    if (isDev || hasDebugParam) {
      setIsVisible(true);
      updateDiagnostics();
      
      // Poll for updates every 2 seconds
      const interval = setInterval(updateDiagnostics, 2000);
      return () => clearInterval(interval);
    }
  }, []);

  const updateDiagnostics = () => {
    try {
      const worldApp = (window as any).WorldApp;
      const authData = (window as any).__authDebugData as AuthDebugData | undefined;
      const apiConfigError = (window as any).__apiConfigError;
      const warnings: string[] = [];
      const errors: string[] = [];
      
      // Check for API configuration error
      const hasApiConfigError = !!apiConfigError;
      if (hasApiConfigError) {
        errors.push(`VITE_API_URL not configured - using fallback: ${apiConfigError.fallbackUrl}`);
        warnings.push('POST /api/auth/verify-siwe will likely fail if backend is on different domain!');
      }
      
      // Check if MiniKit is installed
      const isInstalled = MiniKit.isInstalled();
      if (!isInstalled) {
        warnings.push('MiniKit not installed - must open in World App');
      }
      
      // Check if walletAuth is supported
      const supportedCommands = worldApp?.supported_commands || [];
      if (isInstalled && supportedCommands.length > 0 && !supportedCommands.includes('walletAuth')) {
        errors.push('walletAuth command not supported by this World App version');
        warnings.push('Update World App to the latest version');
      }
      
      // Try to get MiniKit version
      let miniKitVersion = 'unknown';
      try {
        // MiniKit version might be available in different ways
        miniKitVersion = (MiniKit as any).version || worldApp?.minikit_version || 'unknown';
      } catch (e) {
        // Ignore
      }
      
      setDiagnostics({
        isInstalled,
        isReady: isInstalled && worldApp !== undefined,
        supportedCommands,
        worldAppVersion: worldApp?.version || 'unknown',
        apiUrl: authData?.apiUrl || import.meta.env.VITE_API_URL || window.location.origin,
        errors,
        warnings,
        hasApiConfigError,
        miniKitVersion,
      });

      setAuthDebugData(authData || null);
    } catch (error) {
      console.error('[DebugPanel] Error updating diagnostics:', error);
    }
  };

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString() + '.' + date.getMilliseconds();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('Copied to clipboard!');
    });
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className={`debug-panel ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <div className="debug-header">
        <h3 onClick={() => setIsExpanded(!isExpanded)}>
          🔍 Auth Debug Panel {isExpanded ? '▼' : '▶'}
        </h3>
        <button className="debug-refresh" onClick={updateDiagnostics}>
          🔄
        </button>
      </div>
      
      {isExpanded && (
        <div className="debug-content">
          {/* Critical Warnings/Errors Section - shown first */}
          {(diagnostics.errors.length > 0 || diagnostics.warnings.length > 0) && (
            <div className="debug-section" style={{ border: '2px solid #ff4444', backgroundColor: 'rgba(255, 68, 68, 0.1)' }}>
              <div className="debug-section-title" style={{ color: '#ff4444' }}>
                ⚠️ Configuration Issues
              </div>
              {diagnostics.errors.length > 0 && (
                <div className="debug-item">
                  <span className="debug-label" style={{ color: '#ff4444' }}>Errors:</span>
                  <div className="debug-errors">
                    {diagnostics.errors.map((err, idx) => (
                      <div key={idx} className="debug-error" style={{ color: '#ff4444', marginTop: '4px' }}>
                        🚫 {err}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {diagnostics.warnings.length > 0 && (
                <div className="debug-item">
                  <span className="debug-label" style={{ color: '#ffaa00' }}>Warnings:</span>
                  <div className="debug-warnings">
                    {diagnostics.warnings.map((warn, idx) => (
                      <div key={idx} className="debug-warning" style={{ color: '#ffaa00', marginTop: '4px' }}>
                        ⚠️ {warn}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {diagnostics.hasApiConfigError && (
                <div className="debug-item" style={{ marginTop: '8px', padding: '8px', backgroundColor: 'rgba(255, 170, 0, 0.1)', borderRadius: '4px' }}>
                  <div style={{ fontWeight: 'bold', color: '#ffaa00', marginBottom: '4px' }}>
                    📝 How to fix VITE_API_URL:
                  </div>
                  <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
                    1. Go to deployment settings (Vercel/Netlify)<br/>
                    2. Add environment variable: VITE_API_URL<br/>
                    3. Set value to your backend URL (e.g., https://your-app.herokuapp.com)<br/>
                    4. Redeploy frontend
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="debug-section">
            <div className="debug-section-title">Environment</div>
            <div className="debug-item">
              <span className="debug-label">API URL:</span>
              <span className={`debug-value ${diagnostics.hasApiConfigError ? 'error' : ''}`}>
                {diagnostics.apiUrl}
                {diagnostics.hasApiConfigError && ' ⚠️'}
              </span>
            </div>
            <div className="debug-item">
              <span className="debug-label">Mode:</span>
              <span className="debug-value">{import.meta.env.DEV ? 'Development' : 'Production'}</span>
            </div>
            <div className="debug-item">
              <span className="debug-label">Current Origin:</span>
              <span className="debug-value">{window.location.origin}</span>
            </div>
          </div>

          <div className="debug-section">
            <div className="debug-section-title">MiniKit Status</div>
            <div className="debug-item">
              <span className="debug-label">MiniKit Installed:</span>
              <span className={`debug-value ${diagnostics.isInstalled ? 'success' : 'error'}`}>
                {diagnostics.isInstalled ? '✅ Yes' : '❌ No'}
              </span>
            </div>

            <div className="debug-item">
              <span className="debug-label">MiniKit Ready:</span>
              <span className={`debug-value ${diagnostics.isReady ? 'success' : 'error'}`}>
                {diagnostics.isReady ? '✅ Yes' : '❌ No'}
              </span>
            </div>

            <div className="debug-item">
              <span className="debug-label">MiniKit Version:</span>
              <span className="debug-value">{diagnostics.miniKitVersion}</span>
            </div>

            <div className="debug-item">
              <span className="debug-label">World App Version:</span>
              <span className="debug-value">{diagnostics.worldAppVersion}</span>
            </div>

            <div className="debug-item">
              <span className="debug-label">Supported Commands:</span>
              <div className="debug-commands">
                {diagnostics.supportedCommands.length > 0 ? (
                  diagnostics.supportedCommands.map((cmd) => (
                    <span key={cmd} className="debug-command">
                      {cmd}
                    </span>
                  ))
                ) : (
                  <span className="debug-value error">None detected</span>
                )}
              </div>
            </div>
          </div>

          {authDebugData?.lastNonceRequest && (
            <div className="debug-section">
              <div className="debug-section-title">Last Nonce Request</div>
              <div className="debug-item">
                <span className="debug-label">Request ID:</span>
                <span className="debug-value" onClick={() => copyToClipboard(authDebugData.lastNonceRequest!.requestId)}>
                  {authDebugData.lastNonceRequest.requestId.substring(0, 8)}... 📋
                </span>
              </div>
              <div className="debug-item">
                <span className="debug-label">Timestamp:</span>
                <span className="debug-value">{formatTimestamp(authDebugData.lastNonceRequest.timestamp)}</span>
              </div>
              {authDebugData.lastNonceRequest.response && (
                <div className="debug-item">
                  <span className="debug-label">Nonce:</span>
                  <span className="debug-value success">
                    {authDebugData.lastNonceRequest.response.nonce.substring(0, 12)}...
                  </span>
                </div>
              )}
              {authDebugData.lastNonceRequest.error && (
                <div className="debug-item">
                  <span className="debug-label">Error:</span>
                  <span className="debug-value error">{authDebugData.lastNonceRequest.error}</span>
                </div>
              )}
            </div>
          )}

          {authDebugData?.lastWalletAuth && (
            <div className="debug-section">
              <div className="debug-section-title">Last Wallet Auth</div>
              <div className="debug-item">
                <span className="debug-label">Timestamp:</span>
                <span className="debug-value">{formatTimestamp(authDebugData.lastWalletAuth.timestamp)}</span>
              </div>
              <div className="debug-item">
                <span className="debug-label">Nonce Used:</span>
                <span className="debug-value">{authDebugData.lastWalletAuth.nonce.substring(0, 12)}...</span>
              </div>
              {authDebugData.lastWalletAuth.finalPayload && (
                <>
                  <div className="debug-item">
                    <span className="debug-label">Status:</span>
                    <span className={`debug-value ${authDebugData.lastWalletAuth.finalPayload.status === 'success' ? 'success' : 'error'}`}>
                      {authDebugData.lastWalletAuth.finalPayload.status}
                    </span>
                  </div>
                  {authDebugData.lastWalletAuth.finalPayload.address && (
                    <div className="debug-item">
                      <span className="debug-label">Address (redacted):</span>
                      <span className="debug-value">{authDebugData.lastWalletAuth.finalPayload.address}</span>
                    </div>
                  )}
                  {authDebugData.lastWalletAuth.finalPayload.signature && (
                    <div className="debug-item">
                      <span className="debug-label">Signature (redacted):</span>
                      <span className="debug-value">{authDebugData.lastWalletAuth.finalPayload.signature}</span>
                    </div>
                  )}
                </>
              )}
              {authDebugData.lastWalletAuth.error && (
                <div className="debug-item">
                  <span className="debug-label">Error:</span>
                  <span className="debug-value error">{authDebugData.lastWalletAuth.error}</span>
                </div>
              )}
            </div>
          )}

          {authDebugData?.lastVerifyRequest && (
            <div className="debug-section">
              <div className="debug-section-title">Last Verify SIWE Request</div>
              <div className="debug-item">
                <span className="debug-label">Request ID:</span>
                <span className="debug-value" onClick={() => copyToClipboard(authDebugData.lastVerifyRequest!.requestId)}>
                  {authDebugData.lastVerifyRequest.requestId.substring(0, 8)}... 📋
                </span>
              </div>
              <div className="debug-item">
                <span className="debug-label">Timestamp:</span>
                <span className="debug-value">{formatTimestamp(authDebugData.lastVerifyRequest.timestamp)}</span>
              </div>
              {authDebugData.lastVerifyRequest.httpStatus && (
                <div className="debug-item">
                  <span className="debug-label">HTTP Status:</span>
                  <span className={`debug-value ${authDebugData.lastVerifyRequest.httpStatus < 400 ? 'success' : 'error'}`}>
                    {authDebugData.lastVerifyRequest.httpStatus}
                  </span>
                </div>
              )}
              {authDebugData.lastVerifyRequest.response && (
                <div className="debug-item">
                  <span className="debug-label">Response:</span>
                  <pre className="debug-json" onClick={() => copyToClipboard(JSON.stringify(authDebugData.lastVerifyRequest!.response, null, 2))}>
                    {JSON.stringify(authDebugData.lastVerifyRequest.response, null, 2)}
                  </pre>
                </div>
              )}
              {authDebugData.lastVerifyRequest.error && (
                <div className="debug-item">
                  <span className="debug-label">Error:</span>
                  <span className="debug-value error">{authDebugData.lastVerifyRequest.error}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DebugPanel;
