import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameContext } from '../context/GameContext';
import axios from 'axios';
import './MatchHistory.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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
      const response = await axios.get(`${API_URL}/api/matches/history`, {
        headers: { Authorization: `Bearer ${state.token}` },
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

        <h1 className="title glow-primary">📊 Match History</h1>

        {loading ? (
          <div className="loading">
            <div className="spinner"></div>
            <p>Loading matches...</p>
          </div>
        ) : matches.length === 0 ? (
          <div className="empty-state">
            <p>No matches yet!</p>
            <button className="btn btn-primary" onClick={() => navigate('/matchmaking')}>
              Play Your First Match
            </button>
          </div>
        ) : (
          <div className="matches-list">
            {matches.map((match) => (
              <div key={match.matchId} className={`match-card ${match.won ? 'won' : 'lost'}`}>
                <div className="match-header">
                  <span className={`match-result ${match.won ? 'win' : 'loss'}`}>
                    {match.won ? '✓ WIN' : '✗ LOSS'}
                  </span>
                  <span className="match-stake">{match.stake} WLD</span>
                </div>

                <div className="match-body">
                  <div className="reaction-comparison">
                    <div className="your-reaction">
                      <span className="label">You</span>
                      <span className={`value ${match.yourReaction < match.opponentReaction ? 'better' : ''}`}>
                        {match.yourReaction}ms
                      </span>
                    </div>
                    <div className="vs">VS</div>
                    <div className="opponent-reaction">
                      <span className="label">Opponent</span>
                      <span className={`value ${match.opponentReaction < match.yourReaction ? 'better' : ''}`}>
                        {match.opponentReaction}ms
                      </span>
                    </div>
                  </div>

                  {match.opponent && (
                    <div className="opponent-info">
                      <span>vs {match.opponent.wallet.substring(0, 8)}...</span>
                      <span className="opponent-avg">
                        Avg: {match.opponent.avgReaction?.toFixed(0)}ms
                      </span>
                    </div>
                  )}
                </div>

                <div className="match-footer">
                  <span className="match-date">{formatDate(match.completedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MatchHistory;
