import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorldcoin } from '../hooks/useWorldcoin';
import { useGameContext } from '../context/GameContext';
import './WalletConnect.css';

const WalletConnect: React.FC = () => {
  const navigate = useNavigate();
  const { login, loading, error } = useWorldcoin();
  const { state } = useGameContext();
  const [walletInput, setWalletInput] = useState('');

  useEffect(() => {
    // If already logged in, redirect to dashboard
    if (state.token && state.user) {
      navigate('/dashboard');
    }
  }, [state.token, state.user, navigate]);

  const handleConnect = async () => {
    if (!walletInput) {
      alert('Please enter a wallet address');
      return;
    }

    const success = await login(walletInput);
    if (success) {
      navigate('/dashboard');
    }
  };

  const handleDemoLogin = async () => {
    // Demo wallet for testing
    const demoWallet = '0x' + Math.random().toString(16).substring(2, 42);
    const success = await login(demoWallet);
    if (success) {
      navigate('/dashboard');
    }
  };

  return (
    <div className="wallet-connect">
      <div className="wallet-connect-container fade-in">
        <h1 className="title glow-primary">⚡ Blink Battle</h1>
        <p className="subtitle">Test your reflexes. Win WLD.</p>
        
        <div className="connect-box">
          <h2>Connect Your Worldcoin Wallet</h2>
          
          <div className="input-group">
            <input
              type="text"
              placeholder="Enter wallet address"
              value={walletInput}
              onChange={(e) => setWalletInput(e.target.value)}
              className="wallet-input"
              disabled={loading}
            />
          </div>

          <button
            onClick={handleConnect}
            disabled={loading || !walletInput}
            className="btn btn-primary glow"
          >
            {loading ? 'Connecting...' : 'Connect Wallet'}
          </button>

          <div className="divider">
            <span>OR</span>
          </div>

          <button
            onClick={handleDemoLogin}
            disabled={loading}
            className="btn btn-secondary"
          >
            Demo Mode (Test Wallet)
          </button>

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
