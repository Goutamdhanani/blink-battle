import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMiniKit } from '../hooks/useMiniKit';
import { minikit } from '../lib/minikit';
import { useGameContext } from '../context/GameContext';
import './WalletConnect.css';

const WalletConnect: React.FC = () => {
  const navigate = useNavigate();
  const { isInstalled, walletAddress } = useMiniKit();
  const { state, setUser, setToken } = useGameContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If already logged in, redirect to dashboard
    if (state.token && state.user) {
      navigate('/dashboard');
    }
  }, [state.token, state.user, navigate]);

  useEffect(() => {
    // Auto-authenticate if in World App and wallet is available
    if (isInstalled && walletAddress && !state.token) {
      handleMiniKitAuth();
    }
  }, [isInstalled, walletAddress, state.token]);

  const handleMiniKitAuth = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await minikit.signInWithWallet();
      
      if (result.success) {
        setToken(result.token);
        setUser(result.user);
        minikit.sendHaptic('success');
        navigate('/dashboard');
      } else {
        setError('Authentication failed');
        minikit.sendHaptic('error');
      }
    } catch (err: any) {
      console.error('MiniKit auth error:', err);
      setError(err.message || 'Failed to authenticate with World App');
      minikit.sendHaptic('error');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      // Demo wallet for testing (fallback when not in World App)
      const demoWallet = '0x' + Math.random().toString(16).substring(2, 42);
      
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/auth/login`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress: demoWallet,
          }),
        }
      );

      const data = await response.json();

      if (data.success) {
        setToken(data.token);
        setUser(data.user);
        navigate('/dashboard');
      } else {
        setError('Demo login failed');
      }
    } catch (err: any) {
      console.error('Demo login error:', err);
      setError(err.message || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="wallet-connect">
      <div className="wallet-connect-container fade-in">
        <h1 className="title glow-primary">⚡ Blink Battle</h1>
        <p className="subtitle">Test your reflexes. Win WLD.</p>
        
        <div className="connect-box">
          {isInstalled ? (
            <>
              <h2>🌍 Running in World App</h2>
              <p className="info-text">
                {walletAddress && walletAddress.length >= 38
                  ? `Connected: ${walletAddress.substring(0, 6)}...${walletAddress.substring(38)}`
                  : walletAddress 
                    ? `Connected: ${walletAddress}`
                    : 'Connecting to your wallet...'}
              </p>
              <button
                onClick={handleMiniKitAuth}
                disabled={loading}
                className="btn btn-primary glow"
              >
                {loading ? 'Authenticating...' : 'Sign In with World App'}
              </button>
            </>
          ) : (
            <>
              <h2>🔗 World App Required</h2>
              <p className="info-text">
                This is a Worldcoin Mini-App. Please open it inside the World App to play.
              </p>
              
              <div className="divider">
                <span>OR</span>
              </div>

              <p className="info-text small">For testing purposes only:</p>
              <button
                onClick={handleDemoLogin}
                disabled={loading}
                className="btn btn-secondary"
              >
                Demo Mode (Test Wallet)
              </button>
            </>
          )}

          {error && <div className="error-message">{error}</div>}
        </div>

        <div className="features">
          <div className="feature">
            <span className="feature-icon">⚡</span>
            <span>Instant Matches</span>
          </div>
          <div className="feature">
            <span className="feature-icon">💰</span>
            <span>Stake & Win WLD</span>
          </div>
          <div className="feature">
            <span className="feature-icon">🎯</span>
            <span>Test Your Reflexes</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WalletConnect;
