import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameContext } from '../context/GameContext';
import { GlassCard, BottomTabBar } from './ui';
import { apiClient } from '../lib/api';
import './Leaderboard.css';

interface LeaderboardEntry {
  rank: number;
  walletAddress: string;
  wins: number;
  losses: number;
  avgReactionTime: number | string | null;
  winRate: number;
}

const Leaderboard: React.FC = () => {
  const navigate = useNavigate();
  const { state } = useGameContext();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!state.user || !state.token) {
      navigate('/');
      return;
    }

    fetchLeaderboard();
    fetchUserRank();
  }, [state.user, state.token, navigate]);

  const fetchLeaderboard = async () => {
    try {
      const response = await apiClient.get('/api/leaderboard', {
        params: { limit: 50 },
      });

      if (response.data.success) {
        setLeaderboard(response.data.leaderboard);
      }
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserRank = async () => {
    try {
      const response = await apiClient.get('/api/leaderboard/me');

      if (response.data.success) {
        setUserRank(response.data.rank);
      }
    } catch (error) {
      console.error('Error fetching user rank:', error);
    }
  };

  const getRankEmoji = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  const isCurrentUser = (wallet: string) => {
    return state.user?.walletAddress === wallet;
  };

  const formatReactionTime = (value: any) => {
    const num =
      typeof value === 'number'
        ? value
        : Number(value ?? NaN);

    if (!Number.isFinite(num) || num <= 0) return '–';

    return `${num.toFixed(0)}ms`;
  };

  const formatWinRate = (value: any) => {
    const num =
      typeof value === 'number'
        ? value
        : Number(value ?? NaN);

    if (!Number.isFinite(num) || num < 0) return '0.0';

    return (num * 100).toFixed(1);
  };

  return (
    <div className="leaderboard">
      <div className="leaderboard-container fade-in">
        <button className="back-btn" onClick={() => navigate('/dashboard')}>
          ← Back
        </button>

        <h1 className="page-title">🏆 Leaderboard</h1>

        {userRank && (
          <GlassCard className="user-rank-card">
            <span className="rank-label">Your Rank:</span>
            <span className="rank-value">{getRankEmoji(userRank)}</span>
          </GlassCard>
        )}

        {loading ? (
          <div className="loading">
            <div className="spinner"></div>
            <p>Loading leaderboard...</p>
          </div>
        ) : leaderboard.length === 0 ? (
          <GlassCard className="empty-state">
            <p className="empty-message">No players yet!</p>
            <p className="empty-subtitle">Be the first to climb the leaderboard!</p>
          </GlassCard>
        ) : (
          <div className="leaderboard-table">
            <div className="table-header">
              <div className="col-rank">Rank</div>
              <div className="col-player">Player</div>
              <div className="col-stats">W/L</div>
              <div className="col-winrate">Win Rate</div>
              <div className="col-reaction">Avg Time</div>
            </div>

            <div className="table-body">
              {leaderboard.map((entry) => (
                <GlassCard
                  key={entry.walletAddress}
                  className={`table-row ${isCurrentUser(entry.walletAddress) ? 'current-user' : ''}`}
                >
                  <div className="col-rank">
                    <span className={`rank ${entry.rank <= 3 ? 'top-three' : ''}`}>
                      {getRankEmoji(entry.rank)}
                    </span>
                  </div>

                  <div className="col-player">
                    <span className="wallet">
                      {entry.walletAddress.substring(0, 8)}...
                      {isCurrentUser(entry.walletAddress) && (
                        <span className="you-badge">YOU</span>
                      )}
                    </span>
                  </div>

                  <div className="col-stats">
                    <span className="wins">{entry.wins}</span>
                    <span className="separator">/</span>
                    <span className="losses">{entry.losses}</span>
                  </div>

                  <div className="col-winrate">
                    <span className={`winrate ${entry.winRate >= 0.6 ? 'high' : ''}`}>
                      {formatWinRate(entry.winRate)}%
                    </span>
                  </div>

                  <div className="col-reaction">
                    <span className="reaction-time">
                      {formatReactionTime(entry.avgReactionTime)}
                    </span>
                  </div>
                </GlassCard>
              ))}
            </div>
          </div>
        )}

        <BottomTabBar />
      </div>
    </div>
  );
};

export default Leaderboard;
