import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameContext } from '../context/GameContext';
import './Dashboard.css';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { state, resetGame } = useGameContext();

  if (!state.user || !state.token) {
    navigate('/');
    return null;
  }

  const handlePlayFree = () => {
    resetGame();
    // For free mode, we'll use stake = 0
    navigate('/matchmaking', { state: { isFree: true } });
  };

  const handlePlayPvP = () => {
    resetGame();
    navigate('/matchmaking', { state: { isFree: false } });
  };

  const winRate = state.user.wins + state.user.losses > 0
    ? ((state.user.wins / (state.user.wins + state.user.losses)) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="dashboard">
      <div className="dashboard-container fade-in">
        <header className="dashboard-header">
          <h1 className="glow-primary">⚡ Blink Battle</h1>
          <div className="wallet-info">
            <span className="wallet-address">
              {state.user.walletAddress.substring(0, 6)}...
              {state.user.walletAddress.substring(state.user.walletAddress.length - 4)}
            </span>
          </div>
        </header>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value glow-primary">{state.user.wins}</div>
            <div className="stat-label">Wins</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{state.user.losses}</div>
            <div className="stat-label">Losses</div>
          </div>
          <div className="stat-card">
            <div className="stat-value glow-secondary">{winRate}%</div>
            <div className="stat-label">Win Rate</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {state.user.avgReactionTime ? `${state.user.avgReactionTime.toFixed(0)}ms` : '-'}
            </div>
            <div className="stat-label">Avg Reaction</div>
          </div>
        </div>

        <div className="game-modes">
          <div className="mode-card" onClick={handlePlayFree}>
            <div className="mode-icon">🎮</div>
            <h2>Practice Mode</h2>
            <p>Play for free, sharpen your skills</p>
            <button className="btn btn-secondary">Play Free</button>
          </div>

          <div className="mode-card featured" onClick={handlePlayPvP}>
            <div className="mode-icon">💎</div>
            <h2>PvP Staking</h2>
            <p>Compete for real WLD rewards</p>
            <button className="btn btn-primary glow">Play for Stakes</button>
          </div>
        </div>

        <div className="quick-actions">
          <button className="action-btn" onClick={() => navigate('/history')}>
            📊 Match History
          </button>
          <button className="action-btn" onClick={() => navigate('/leaderboard')}>
            🏆 Leaderboard
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
