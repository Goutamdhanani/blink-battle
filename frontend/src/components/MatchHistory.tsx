import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameContext } from '../context/GameContext';
import { GlassCard, BottomTabBar, NeonButton } from './ui';
import { apiClient } from '../lib/api';
import { formatReactionTime } from '../lib/formatters';
import { claimWinnings } from '../services/claimService';
import { minikit } from '../lib/minikit';
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
  // Claim fields (optional, only for staked matches where user won)
  claimDeadline?: string;
  claimStatus?: 'unclaimed' | 'claimed' | 'expired';
  claimTimeRemaining?: number; // seconds
  claimable?: boolean;
}

const MatchHistory: React.FC = () => {
  const navigate = useNavigate();
  const { state } = useGameContext();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingMatchId, setClaimingMatchId] = useState<string | null>(null);
  const [claimErrors, setClaimErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!state.user || !state.token) {
      navigate('/');
      return;
    }

    fetchMatchHistory();
  }, [state.user, state.token, navigate]);

  // Update claim countdown timers every second
  // Only update matches that have active claim timers for better performance
  useEffect(() => {
    const interval = setInterval(() => {
      setMatches(prevMatches => {
        let hasChanges = false;
        
        const updatedMatches = prevMatches.map(match => {
          // Only process matches with active claim timers
          if (match.claimDeadline && match.claimStatus === 'unclaimed') {
            const deadline = new Date(match.claimDeadline).getTime();
            const now = Date.now();
            const secondsLeft = Math.max(0, Math.floor((deadline - now) / 1000));
            
            // Only update if time has changed
            if (match.claimTimeRemaining !== secondsLeft) {
              hasChanges = true;
              return {
                ...match,
                claimTimeRemaining: secondsLeft,
                claimable: secondsLeft > 0
              };
            }
          }
          return match;
        });
        
        // Only trigger re-render if something changed
        return hasChanges ? updatedMatches : prevMatches;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

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

  const handleClaimWinnings = async (matchId: string) => {
    if (!state.token || claimingMatchId) return;

    setClaimingMatchId(matchId);
    setClaimErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[matchId];
      return newErrors;
    });

    try {
      const result = await claimWinnings(matchId, state.token);
      
      if (result.success) {
        minikit.sendHaptic('success');
        // Refresh match history to show updated claim status
        await fetchMatchHistory();
      } else {
        setClaimErrors(prev => ({ ...prev, [matchId]: result.error || 'Failed to claim' }));
        minikit.sendHaptic('error');
      }
    } catch (error: any) {
      setClaimErrors(prev => ({ ...prev, [matchId]: 'Network error - please try again' }));
      minikit.sendHaptic('error');
    } finally {
      setClaimingMatchId(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const formatTimeRemaining = (seconds: number): string => {
    if (seconds <= 0) return 'Expired';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
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

                  {/* FIXED: Show claim button with timer for unclaimed wins */}
                  {match.won && match.stake > 0 && (
                    <div className="claim-section" style={{ marginTop: '1rem' }}>
                      {match.claimStatus === 'claimed' && (
                        <div className="claim-status" style={{ color: '#00ff88', fontSize: '0.9rem' }}>
                          ✅ Winnings Claimed
                        </div>
                      )}
                      
                      {match.claimStatus === 'unclaimed' && match.claimable && (
                        <>
                          <NeonButton
                            variant="primary"
                            size="small"
                            fullWidth
                            onClick={() => handleClaimWinnings(match.matchId)}
                            disabled={claimingMatchId === match.matchId}
                          >
                            {claimingMatchId === match.matchId ? '⏳ Claiming...' : '💰 Claim Winnings'}
                          </NeonButton>
                          {match.claimTimeRemaining !== undefined && match.claimTimeRemaining >= 0 && (
                            <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', opacity: 0.8, color: '#ffaa00' }}>
                              ⏱️ {formatTimeRemaining(match.claimTimeRemaining)} remaining
                            </div>
                          )}
                        </>
                      )}
                      
                      {match.claimStatus === 'unclaimed' && !match.claimable && (
                        <div className="claim-status" style={{ color: '#ff0088', fontSize: '0.9rem' }}>
                          ❌ Reward Expired
                        </div>
                      )}

                      {claimErrors[match.matchId] && (
                        <div style={{ marginTop: '0.5rem', color: '#ff0088', fontSize: '0.85rem' }}>
                          ⚠️ {claimErrors[match.matchId]}
                        </div>
                      )}
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
