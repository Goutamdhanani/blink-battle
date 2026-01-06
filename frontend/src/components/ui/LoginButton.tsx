import React, { useState } from 'react';
import { useMiniKit } from '../../providers/MiniKitProvider';
import './LoginButton.css';

const LoginButton: React.FC = () => {
  const { isAuthenticated, user, login, logout, isInstalled, verifyWithWorldId } = useMiniKit();
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await login();
    } catch (err) {
      setError('Login failed. Please try again.');
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyWorldId = async () => {
    setIsVerifying(true);
    setError(null);
    try {
      await verifyWithWorldId();
    } catch (err) {
      setError('World ID verification failed. Please try again.');
      console.error('World ID verification error:', err);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true);
  };

  const handleLogoutConfirm = () => {
    logout();
    setShowLogoutConfirm(false);
  };

  const handleLogoutCancel = () => {
    setShowLogoutConfirm(false);
  };

  if (isAuthenticated && user) {
    return (
      <>
        <div className="login-status">
          <div className="user-badge">
            <span className="user-icon">👤</span>
            <span className="user-id">{user.id.substring(0, 8)}...</span>
            {user.worldIdVerified && (
              <span className="verification-badge worldid-verified" title="Verified with World ID">
                🌐✓
              </span>
            )}
            {!user.worldIdVerified && user.verificationLevel && (
              <span className="verification-badge" title={`Verified with ${user.verificationLevel}`}>
                ✓
              </span>
            )}
          </div>
          {!user.worldIdVerified && (
            <button 
              className="verify-worldid-btn" 
              onClick={handleVerifyWorldId}
              disabled={isVerifying}
              title="Verify with World ID"
            >
              {isVerifying ? '⏳' : '🌐'}
            </button>
          )}
          <button className="logout-btn-small" onClick={handleLogoutClick} title="Logout">
            🚪
          </button>
        </div>
        
        {/* World ID Verification Prompt */}
        {!user.worldIdVerified && (
          <div className="worldid-prompt">
            <p className="worldid-prompt-text">
              🌐 Verify with World ID to prove you're a unique human
            </p>
            <button 
              className="worldid-verify-button" 
              onClick={handleVerifyWorldId}
              disabled={isVerifying}
            >
              {isVerifying ? (
                <>
                  <span className="login-spinner"></span>
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <span>Verify with World ID</span>
                </>
              )}
            </button>
          </div>
        )}
        
        {/* Logout Confirmation Modal */}
        {showLogoutConfirm && (
          <div className="logout-modal-overlay" onClick={handleLogoutCancel}>
            <div className="logout-modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="logout-modal-title">Confirm Logout</h3>
              <p className="logout-modal-text">Are you sure you want to logout?</p>
              <div className="logout-modal-buttons">
                <button className="logout-modal-btn logout-cancel-btn" onClick={handleLogoutCancel}>
                  Cancel
                </button>
                <button className="logout-modal-btn logout-confirm-btn" onClick={handleLogoutConfirm}>
                  Logout
                </button>
              </div>
            </div>
          </div>
        )}
        
        {error && <p className="login-error">{error}</p>}
      </>
    );
  }

  return (
    <div className="login-container">
      <button
        className="login-btn"
        onClick={handleLogin}
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <span className="login-spinner"></span>
            <span>Connecting...</span>
          </>
        ) : (
          <>
            <span className="login-icon">🌐</span>
            <span>Sign in with World ID</span>
          </>
        )}
      </button>
      {!isInstalled && (
        <p className="login-hint login-warning">
          ⚠️ Please open this app in World App for authentication
        </p>
      )}
      {error && <p className="login-error">{error}</p>}
    </div>
  );
};

export default LoginButton;
