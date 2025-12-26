import React, { useState, useEffect } from 'react';
import { MiniKit } from '@worldcoin/minikit-js';
import './DebugPanel.css';

/**
 * Debug panel for MiniKit diagnostics
 * Only shown in development mode or with ?debug=true query param
 */
const DebugPanel: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [diagnostics, setDiagnostics] = useState({
    isInstalled: false,
    supportedCommands: [] as string[],
    worldAppVersion: 'unknown',
    errors: [] as string[],
  });

  useEffect(() => {
    // Check if debug mode should be enabled
    const isDev = process.env.NODE_ENV === 'development';
    const hasDebugParam = new URLSearchParams(window.location.search).get('debug') === 'true';
    
    if (isDev || hasDebugParam) {
      setIsVisible(true);
      updateDiagnostics();
    }
  }, []);

  const updateDiagnostics = () => {
    try {
      const worldApp = (window as any).WorldApp;
      
      setDiagnostics({
        isInstalled: MiniKit.isInstalled(),
        supportedCommands: worldApp?.supported_commands || [],
        worldAppVersion: worldApp?.version || 'unknown',
        errors: [],
      });
    } catch (error) {
      console.error('[DebugPanel] Error updating diagnostics:', error);
    }
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="debug-panel">
      <div className="debug-header">
        <h3>🔍 MiniKit Diagnostics</h3>
        <button className="debug-refresh" onClick={updateDiagnostics}>
          🔄 Refresh
        </button>
      </div>
      
      <div className="debug-content">
        <div className="debug-item">
          <span className="debug-label">MiniKit Installed:</span>
          <span className={`debug-value ${diagnostics.isInstalled ? 'success' : 'error'}`}>
            {diagnostics.isInstalled ? '✅ Yes' : '❌ No'}
          </span>
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

        {diagnostics.errors.length > 0 && (
          <div className="debug-item">
            <span className="debug-label">Errors:</span>
            <div className="debug-errors">
              {diagnostics.errors.map((err, idx) => (
                <div key={idx} className="debug-error">
                  {err}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DebugPanel;
