import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameContext } from '../context/GameContext';
import { GlassCard, BottomTabBar, NeonButton } from './ui';
import PendingRefunds from './PendingRefunds';
import { apiClient } from '../lib/api';
import { formatReactionTime } from '../lib/formatters';
import { claimWinnings } from '../services/claimService';
import { minikit } from '../lib/minikit';
import './MatchHistory.css';

interface Match {
  matchId: string;
  stake: number;
  reaction_ms: number; // SERVER AUTHORITY: From tap_events table
  yourReaction: number; // Backward compatibility
  opponentReaction: number;
  tapValid?: boolean; // Tap validity flag
  opponentTapValid?: boolean; // Opponent tap validity flag
  won: boolean;
  outcome: 'win' | 'loss' | 'draw' | 'cancelled' | 'active' | 'pending' | 'unknown'; // SERVER AUTHORITY
  opponent: {
    wallet: string;
    avgReaction: number;
  } | null;
  completedAt: string;
  // Claim fields - SERVER AUTHORITY
  claimDeadline?: string;
  claimStatus?: 'unclaimed' | 'claimed' | 'expired';
  claimTimeRemaining?: number; // seconds
  canClaimWinnings?: boolean; // SERVER AUTHORITY
  claimable?: boolean; // Backward compatibility
  claimed?: boolean; // Explicit claimed flag
  // Refund fields - SERVER AUTHORITY
  refundStatus?: 'none' | 'eligible' | 'processing' | 'completed' | 'failed';
  refundAmount?: number;
  refundReason?: string;
  refundDeadline?: string;
  canClaimRefund?: boolean; // SERVER AUTHORITY
  canRefund?: boolean; // Backward compatibility
  resultType?: string; // tie, both_disqualified, etc.
}

interface PendingRefund {
  paymentReference: string;
  amount: number;
  refundAmount: number;
  protocolFeePercent: number;
  createdAt: string;
  type: string;
  canClaimDeposit: boolean;
}

const MatchHistory: React.FC = () => {
  const navigate = useNavigate();
  const { state } = useGameContext();
  const [matches, setMatches] = useState<Match[]>([]);
  const [pendingRefunds, setPendingRefunds] = useState<PendingRefund[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingClaims, setProcessingClaims] = useState<Set<string>>(new Set());
  const [claimErrors, setClaimErrors] = useState<Map<string, string>>(new Map());
  const [refundMessage, setRefundMessage] = useState<string | null>(null);

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
        setPendingRefunds(response.data.pendingRefunds || []);
      }
    } catch (error) {
      console.error('Error fetching match history:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClaimWinnings = async (matchId: string) => {
    if (!state.token || processingClaims.has(matchId)) return;

    setProcessingClaims(prev => new Set(prev).add(matchId));
    setClaimErrors(prev => {
      const newMap = new Map(prev);
      newMap.delete(matchId);
      return newMap;
    });

    try {
      const result = await claimWinnings(matchId, state.token);
      
      if (result.success) {
        minikit.sendHaptic('success');
        // Refresh match history to show updated claim status
        await fetchMatchHistory();
      } else {
        setClaimErrors(prev => new Map(prev).set(matchId, result.error || 'Failed to claim'));
        minikit.sendHaptic('error');
      }
    } catch (error: any) {
      setClaimErrors(prev => new Map(prev).set(matchId, 'Network error - please try again'));
      minikit.sendHaptic('error');
    } finally {
      setProcessingClaims(prev => {
        const newSet = new Set(prev);
        newSet.delete(matchId);
        return newSet;
      });
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
        ) : (
          <>
            <PendingRefunds 
              refunds={pendingRefunds} 
              onRefundClaimed={fetchMatchHistory}
            />

            {matches.length === 0 ? (
              <GlassCard className="empty-state">
                <p className="empty-message">No matches yet!</p>
                <p className="empty-subtitle">Start playing to build your history</p>
              </GlassCard>
            ) : (
              <div className="matches-list">
            {matches.map((match) => {
              // SERVER AUTHORITY: Use outcome from server
              const outcome = match.outcome;
              
              // Determine display based on server outcome
              const isDraw = outcome === 'draw';
              const isCancelled = outcome === 'cancelled';
              const isRefunded = match.refundStatus === 'completed';
              const isRefundProcessing = match.refundStatus === 'processing';
              
              return (
              <GlassCard key={match.matchId} className={`match-card ${outcome === 'win' ? 'match-won' : (isDraw || isCancelled || isRefunded ? 'match-refund' : 'match-lost')}`}>
                <div className="match-header">
                  <span className={`match-result ${outcome === 'win' ? 'result-win' : (isDraw || isCancelled || isRefunded ? 'result-refund' : 'result-loss')}`}>
                    {outcome === 'win' ? '✓ WIN' : 
                     isRefunded ? '🔄 REFUNDED' : 
                     isDraw ? '⏱️ DRAW' :
                     isCancelled ? '❌ CANCELLED' :
                     '✗ LOSS'}
                  </span>
                  <span className="match-stake">{match.stake} WLD</span>
                </div>

                <div className="match-body">
                  <div className="reaction-comparison">
                    <div className="reaction-item">
                      <span className="reaction-label">You</span>
                      <span className={`reaction-value ${match.yourReaction < match.opponentReaction ? 'reaction-better' : ''}`}>
                        {/* SERVER AUTHORITY: Use reaction_ms from server (tap_events) */}
                        {match.reaction_ms !== null && match.reaction_ms !== undefined && match.reaction_ms >= 0 
                          ? `${match.reaction_ms}ms` 
                          : 'No tap'}
                      </span>
                    </div>
                    <div className="vs-divider">VS</div>
                    <div className="reaction-item">
                      <span className="reaction-label">Opponent</span>
                      <span className={`reaction-value ${match.opponentReaction < match.yourReaction ? 'reaction-better' : ''}`}>
                        {match.opponentReaction !== null && match.opponentReaction !== undefined && match.opponentReaction >= 0 
                          ? `${match.opponentReaction}ms` 
                          : 'No tap'}
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

                  {/* SERVER AUTHORITY: Show claim button only when canClaimWinnings === true */}
                  {outcome === 'win' && match.stake > 0 && (
                    <div className="claim-section" style={{ marginTop: '1rem' }}>
                      {(match.claimed === true || match.claimStatus === 'claimed') && (
                        <div className="claim-status" style={{ color: '#00ff88', fontSize: '0.9rem' }}>
                          ✅ Winnings Claimed
                        </div>
                      )}
                      
                      {/* SERVER AUTHORITY: Use canClaimWinnings from server */}
                      {match.canClaimWinnings === true && (
                        <>
                          <NeonButton
                            variant="primary"
                            size="small"
                            fullWidth
                            onClick={() => handleClaimWinnings(match.matchId)}
                            disabled={processingClaims.has(match.matchId)}
                          >
                            {processingClaims.has(match.matchId) ? '⏳ Claiming...' : '💰 Claim Winnings'}
                          </NeonButton>
                          {match.claimTimeRemaining !== undefined && match.claimTimeRemaining >= 0 && (
                            <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', opacity: 0.8, color: '#ffaa00' }}>
                              ⏱️ {formatTimeRemaining(match.claimTimeRemaining)} remaining
                            </div>
                          )}
                        </>
                      )}
                      
                      {match.canClaimWinnings === false && match.claimStatus === 'unclaimed' && (
                        <div className="claim-status" style={{ color: '#ff0088', fontSize: '0.9rem' }}>
                          ❌ Reward Expired
                        </div>
                      )}

                      {claimErrors.has(match.matchId) && (
                        <div style={{ marginTop: '0.5rem', color: '#ff0088', fontSize: '0.85rem' }}>
                          ⚠️ {claimErrors.get(match.matchId)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* SERVER AUTHORITY: Show refund section only when canClaimRefund is true */}
                  {(isDraw || isCancelled) && match.stake > 0 && (
                    <div className="refund-section" style={{ marginTop: '1rem' }}>
                      {isRefunded && (
                        <div className="refund-status" style={{ color: '#00ffff', fontSize: '0.9rem' }}>
                          ✅ Refunded: {match.refundAmount?.toFixed(2) || (match.stake * 0.97).toFixed(2)} WLD (3% fee deducted)
                        </div>
                      )}
                      
                      {isRefundProcessing && (
                        <div className="refund-status" style={{ color: '#ffaa00', fontSize: '0.9rem' }}>
                          ⏳ Refund Processing...
                        </div>
                      )}
                      
                      {/* SERVER AUTHORITY: Use canClaimRefund from server */}
                      {match.canClaimRefund === true && !isRefundProcessing && (
                        <>
                          <div style={{ 
                            background: 'rgba(255, 170, 0, 0.1)', 
                            padding: '0.75rem', 
                            borderRadius: '8px',
                            marginBottom: '0.75rem'
                          }}>
                            <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                              <strong>Refund Available</strong>
                            </div>
                            <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                              Original: {match.stake} WLD<br/>
                              Platform Fee (3%): -{(match.stake * 0.03).toFixed(2)} WLD<br/>
                              <strong>You Receive: {(match.stake * 0.97).toFixed(2)} WLD</strong>
                            </div>
                            <div style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '0.5rem' }}>
                              Reason: {match.refundReason || 'Match cancelled'}
                            </div>
                          </div>
                          <NeonButton
                            variant="secondary"
                            size="small"
                            fullWidth
                            onClick={() => setRefundMessage('Refund claiming from match history will be available soon. Please use the Pending Refunds section above to claim refunds for now.')}
                          >
                            🔄 Claim Refund
                          </NeonButton>
                          {refundMessage && (
                            <div style={{ 
                              marginTop: '0.75rem',
                              padding: '0.75rem',
                              background: 'rgba(255, 170, 0, 0.15)',
                              borderRadius: '6px',
                              fontSize: '0.85rem',
                              color: '#ffaa00'
                            }}>
                              ℹ️ {refundMessage}
                              <button
                                onClick={() => setRefundMessage(null)}
                                style={{
                                  marginLeft: '0.5rem',
                                  background: 'none',
                                  border: 'none',
                                  color: '#ffaa00',
                                  cursor: 'pointer',
                                  fontSize: '1.2em'
                                }}
                              >
                                ×
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="match-footer">
                  <span className="match-date">{formatDate(match.completedAt)}</span>
                </div>
              </GlassCard>
              );
            })}
          </div>
        )}
          </>
        )}

        <BottomTabBar />
      </div>
    </div>
  );
};

export default MatchHistory;
