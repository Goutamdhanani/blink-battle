import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameContext } from '../context/GameContext';
import { GlassCard, NeonButton, StatTile, BottomTabBar } from './ui';
import { formatReactionTime } from '../lib/formatters';
import './Dashboard.css';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { state, resetGame, setToken, setUser } = useGameContext();

  if (!state.user || !state.token) {
    navigate('/');
    return null;
  }

  const handlePlayFree = () => {
    resetGame();
    navigate('/practice');
  };

  const handlePlayPvP = () => {
    resetGame();
    navigate('/matchmaking', { state: { isFree: false } });
  };

  const handleLogout = () => {
    // Clear all state
    setToken(null);
    setUser(null);
    resetGame();
    // Redirect to home (will trigger re-auth)
    navigate('/');
  };

  const winRate = state.user.wins + state.user.losses > 0
    ? ((state.user.wins / (state.user.wins + state.user.losses)) * 100).toFixed(1)
    : '0.0';

  const formatWalletAddress = (address: string) => {
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  return (
    <div className="dashboard">
      <div className="dashboard-container fade-in">
        <header className="dashboard-header">
          <div className="dashboard-title">
            <div className="app-icon">⚡</div>
            <h1 className="app-title">Blink Battle</h1>
          </div>
          <div className="user-pill">
            <span className="user-address">
              {formatWalletAddress(state.user.walletAddress)}
            </span>
            <span className="user-status">
              <span className="status-indicator online"></span>
              <span className="status-text">Online</span>
            </span>
            <button 
              className="logout-btn" 
              onClick={handleLogout}
              title="Sign out of your account"
              aria-label="Sign out of your account"
            >
              <span className="logout-icon">🚪</span>
              <span className="logout-text">Logout</span>
            </button>
          </div>
        </header>

        <div className="stats-grid">
          <StatTile value={state.user.wins} label="Wins" color="green" />
          <StatTile value={state.user.losses} label="Losses" color="pink" />
          <StatTile value={`${winRate}%`} label="Win Rate" color="cyan" highlight />
          <StatTile 
            value={formatReactionTime(state.user.avgReactionTime)} 
            label="Avg Reaction" 
            color="purple" 
          />
        </div>

        <div className="game-modes">
          <GlassCard className="mode-card" hover onClick={handlePlayFree}>
            <div className="mode-icon">🎮</div>
            <h2 className="mode-title">Practice Mode</h2>
            <p className="mode-description">Play free, sharpen your skills</p>
            <NeonButton variant="ghost" fullWidth>
              Play Free
            </NeonButton>
          </GlassCard>

          <GlassCard className="mode-card mode-card-featured" hover onClick={handlePlayPvP}>
            <div className="mode-icon">💎</div>
            <h2 className="mode-title">PvP Staking</h2>
            <p className="mode-description">Compete for real WLD rewards</p>
            <NeonButton variant="primary" fullWidth>
              Play for Stakes
            </NeonButton>
          </GlassCard>
        </div>

        <BottomTabBar />
      </div>
    </div>
  );
};

export default Dashboard;
