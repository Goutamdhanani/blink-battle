import React, { useState } from 'react';
import { useMiniKit } from '../../providers/MiniKitProvider';
import './LoginButton.css';

const LoginButton: React.FC = () => {
  const { isAuthenticated, user, login, logout, isInstalled } = useMiniKit();
  const [isLoading, setIsLoading] = useState(false);
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
            {user.verificationLevel && (
              <span className="verification-badge" title={`Verified with ${user.verificationLevel}`}>
                ✓
              </span>
            )}
          </div>
          <button className="logout-btn-small" onClick={handleLogoutClick} title="Logout">
            🚪
          </button>
        </div>
        
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
            <span>Login with MiniKit</span>
          </>
        )}
      </button>
      {!isInstalled && (
        <p className="login-hint">
          Running in demo mode - open in World App for full authentication
        </p>
      )}
      {error && <p className="login-error">{error}</p>}
    </div>
  );
};

export default LoginButton;
