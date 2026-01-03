import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameContext } from '../context/GameContext';
import { GlassCard, BottomTabBar } from './ui';
import { apiClient } from '../lib/api';
import { formatReactionTime } from '../lib/formatters';
import './MatchHistory.css';

interface Match {
  matchId: string;
  stake: number;
  yourReaction: number;
  opponentReaction: number;
  won: boolean;
  opponent: {
    wallet: string;
    avgReaction: number;
  } | null;
  completedAt: string;
}

const MatchHistory: React.FC = () => {
  const navigate = useNavigate();
  const { state } = useGameContext();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!state.user || !state.token) {
      navigate('/');
      return;
    }

    fetchMatchHistory();
  }, [state.user, state.token, navigate]);

  const fetchMatchHistory = async () => {
    try {
      const response = await apiClient.get('/api/matches/history', {
        params: { limit: 20 },
      });

      if (response.data.success) {
        setMatches(response.data.matches);
      }
    } catch (error) {
      console.error('Error fetching match history:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  return (
    <div className="match-history">
      <div className="history-container fade-in">
        <button className="back-btn" onClick={() => navigate('/dashboard')}>
          ← Back
        </button>

        <h1 className="page-title">📊 Match History</h1>

        {loading ? (
          <div className="loading">
            <div className="spinner"></div>
            <p>Loading matches...</p>
          </div>
        ) : matches.length === 0 ? (
          <GlassCard className="empty-state">
            <p className="empty-message">No matches yet!</p>
            <p className="empty-subtitle">Start playing to build your history</p>
          </GlassCard>
        ) : (
          <div className="matches-list">
            {matches.map((match) => (
              <GlassCard key={match.matchId} className={`match-card ${match.won ? 'match-won' : 'match-lost'}`}>
                <div className="match-header">
                  <span className={`match-result ${match.won ? 'result-win' : 'result-loss'}`}>
                    {match.won ? '✓ WIN' : '✗ LOSS'}
                  </span>
                  <span className="match-stake">{match.stake} WLD</span>
                </div>

                <div className="match-body">
                  <div className="reaction-comparison">
                    <div className="reaction-item">
                      <span className="reaction-label">You</span>
                      <span className={`reaction-value ${match.yourReaction < match.opponentReaction ? 'reaction-better' : ''}`}>
                        {match.yourReaction}ms
                      </span>
                    </div>
                    <div className="vs-divider">VS</div>
                    <div className="reaction-item">
                      <span className="reaction-label">Opponent</span>
                      <span className={`reaction-value ${match.opponentReaction < match.yourReaction ? 'reaction-better' : ''}`}>
                        {match.opponentReaction}ms
                      </span>
                    </div>
                  </div>

                  {match.opponent && (
                    <div className="opponent-info">
                      <span>vs {match.opponent.wallet.substring(0, 8)}...</span>
                      <span className="opponent-avg">
                        Avg: {formatReactionTime(match.opponent.avgReaction)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="match-footer">
                  <span className="match-date">{formatDate(match.completedAt)}</span>
                </div>
              </GlassCard>
            ))}
          </div>
        )}

        <BottomTabBar />
      </div>
    </div>
  );
};

export default MatchHistory;
