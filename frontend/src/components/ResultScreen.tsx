import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameContext } from '../context/GameContext';
import { useLatency } from '../hooks/useLatency';
import { minikit } from '../lib/minikit';
import { GlassCard, NeonButton } from './ui';
import { clampReactionTime } from '../lib/statusUtils';
import { claimWinnings, getClaimStatus, ClaimStatus } from '../services/claimService';
import confetti from 'canvas-confetti';
import './ResultScreen.css';

const ResultScreen: React.FC = () => {
  const navigate = useNavigate();
  const { state, resetGame } = useGameContext();
  const { latencyStats, getLatencyRange, getEstimatedOneWayLatency } = useLatency();
  const [claimStatus, setClaimStatus] = useState<ClaimStatus | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState(false);
  const [claimTimeLeft, setClaimTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!state.user || !state.result) {
      navigate('/dashboard');
      return;
    }

    // Fire confetti and haptic feedback if user won
    if (state.winnerId === state.user.userId) {
      fireConfetti();
      minikit.sendHaptic('success');
    } else {
      // Send haptic notification for loss
      minikit.sendHaptic('warning');
    }

    // Load claim status for staked matches
    if (state.stake && state.stake > 0 && state.matchId) {
      loadClaimStatus();
    }
  }, [state.user, state.result, state.winnerId, state.matchId, state.stake, navigate]);

  const loadClaimStatus = async () => {
    if (!state.matchId || !state.token) return;

    const status = await getClaimStatus(state.matchId, state.token);
    if (status) {
      setClaimStatus(status);
      
      // Calculate initial time remaining
      if (status.deadline) {
        const deadlineTime = new Date(status.deadline).getTime();
        const now = Date.now();
        const secondsLeft = Math.floor((deadlineTime - now) / 1000);
        setClaimTimeLeft(Math.max(0, secondsLeft));
      }
    }
  };

  // Update claim time countdown every second
  useEffect(() => {
    if (!claimStatus?.deadline || claimStatus.status === 'completed' || claimStatus.status === 'expired') {
      return;
    }

    const interval = setInterval(() => {
      const deadlineTime = new Date(claimStatus.deadline!).getTime();
      const now = Date.now();
      const secondsLeft = Math.floor((deadlineTime - now) / 1000);
      setClaimTimeLeft(Math.max(0, secondsLeft));

      // If expired, reload claim status
      if (secondsLeft <= 0) {
        loadClaimStatus();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [claimStatus]);

  const fireConfetti = () => {
    const duration = 3000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#00ff88', '#ff0088', '#ffaa00'],
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#00ff88', '#ff0088', '#ffaa00'],
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };

    frame();
  };

  const handlePlayAgain = () => {
    minikit.sendHaptic('success');
    resetGame();
    navigate('/matchmaking');
  };

  const handleDashboard = () => {
    resetGame();
    navigate('/dashboard');
  };

  const handleViewStats = () => {
    navigate('/history');
  };

  const handleClaimWinnings = async () => {
    if (!state.matchId || !state.token || claiming) return;

    setClaiming(true);
    setClaimError(null);

    try {
      const result = await claimWinnings(state.matchId, state.token);
      
      if (result.success) {
        setClaimSuccess(true);
        minikit.sendHaptic('success');
        // Reload claim status to show updated state
        await loadClaimStatus();
        
        // Fire confetti for successful claim
        fireConfetti();
      } else {
        setClaimError(result.error || 'Failed to claim winnings');
        minikit.sendHaptic('error');
      }
    } catch (error: any) {
      setClaimError('Network error - please try again');
      minikit.sendHaptic('error');
    } finally {
      setClaiming(false);
    }
  };

  if (!state.user || !state.result) return null;

  const isWinner = state.winnerId === state.user.userId;
  const isTie = state.result === 'tie';
  
  // CRITICAL: Clamp reaction times to valid range (prevent negative/invalid display)
  const yourReaction = clampReactionTime(state.yourReaction) || 0;
  const opponentReaction = clampReactionTime(state.opponentReaction) || 0;

  const getResultMessage = () => {
    if (isTie) return 'It\'s a Tie!';
    if (isWinner) return '🎉 You Win!';
    if (state.result === 'player1_false_start' || state.result === 'player2_false_start') {
      return isWinner ? '🎉 Opponent False Started!' : '❌ False Start!';
    }
    if (state.result === 'timeout') {
      return isWinner ? '🎉 Opponent Timed Out!' : '❌ You Timed Out!';
    }
    return '😔 You Lose';
  };

  const getResultDescription = () => {
    if (isTie) return 'Incredible! You both had the same reaction time!';
    if (isWinner) return 'Your reflexes are lightning fast! Great job!';
    if (state.result?.includes('false_start')) {
      return isWinner ? 'They tapped before the signal!' : 'You tapped too early! Wait for the signal next time.';
    }
    if (state.result === 'timeout') {
      return isWinner ? 'They didn\'t tap in time!' : 'You need to be faster! Practice makes perfect.';
    }
    return 'So close! Keep practicing to improve your reaction time.';
  };

  const calculateWinnings = () => {
    if (!state.stake) return 0;
    if (isTie) return state.stake * 0.97; // Get back 97% of stake
    if (isWinner) return state.stake * 2 * 0.97; // 97% of pot
    return 0;
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

  const winnings = calculateWinnings();

  return (
    <div className="result-screen">
      <div className="result-container fade-in">
        <GlassCard className={`result-header ${isWinner ? 'winner' : isTie ? 'tie' : 'loser'}`}>
          <h1 className="result-title">{getResultMessage()}</h1>
          <p className="result-description">{getResultDescription()}</p>
        </GlassCard>

        <div className="result-stats">
          <div className="stat-row">
            <GlassCard className="stat-box your-stat">
              <div className="stat-label">Your Reaction</div>
              <div className={`stat-value ${yourReaction < opponentReaction ? 'better' : ''}`}>
                {yourReaction > 0 ? `${yourReaction}ms` : 'No tap'}
              </div>
            </GlassCard>
            <div className="vs">VS</div>
            <GlassCard className="stat-box opponent-stat">
              <div className="stat-label">Opponent</div>
              <div className={`stat-value ${opponentReaction < yourReaction ? 'better' : ''}`}>
                {opponentReaction > 0 ? `${opponentReaction}ms` : 'No tap'}
              </div>
            </GlassCard>
          </div>

          {state.stake && state.stake > 0 && (
            <GlassCard className="winnings-box">
              <div className="winnings-label">
                {isTie ? 'Refunded' : isWinner ? 'You Won' : 'You Lost'}
              </div>
              <div className={`winnings-amount ${isWinner || isTie ? 'positive' : 'negative'}`}>
                {claimStatus?.amountFormatted || `${winnings.toFixed(2)} WLD`}
              </div>
              
              {/* Claim button for winners */}
              {isWinner && claimStatus && claimStatus.claimable && !claimSuccess && (
                <div className="claim-section" style={{ marginTop: '1rem' }}>
                  <NeonButton 
                    variant="primary" 
                    size="medium" 
                    fullWidth 
                    onClick={handleClaimWinnings}
                    disabled={claiming}
                  >
                    {claiming ? '⏳ Claiming...' : '💰 Claim Winnings'}
                  </NeonButton>
                  {claimTimeLeft !== null && claimTimeLeft > 0 && (
                    <div className="claim-deadline" style={{ marginTop: '0.5rem', fontSize: '0.9rem', opacity: 0.8 }}>
                      ⏱️ Claim within: {formatTimeRemaining(claimTimeLeft)}
                    </div>
                  )}
                </div>
              )}

              {/* Show claim status */}
              {claimStatus && claimStatus.status === 'completed' && (
                <div className="claim-status" style={{ marginTop: '1rem', color: '#00ff88' }}>
                  ✅ Claimed! 
                  {claimStatus.txHash && (
                    <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                      Tx: {claimStatus.txHash.substring(0, 10)}...
                    </div>
                  )}
                </div>
              )}

              {claimStatus && claimStatus.status === 'processing' && (
                <div className="claim-status" style={{ marginTop: '1rem', color: '#ffaa00' }}>
                  ⏳ Processing claim...
                </div>
              )}

              {claimSuccess && (
                <div className="claim-status" style={{ marginTop: '1rem', color: '#00ff88' }}>
                  ✅ Winnings claimed successfully!
                </div>
              )}

              {claimError && (
                <div className="claim-error" style={{ marginTop: '1rem', color: '#ff0088' }}>
                  ❌ {claimError}
                </div>
              )}

              {isWinner && claimStatus && claimStatus.deadlineExpired && (
                <div className="claim-status" style={{ marginTop: '1rem', color: '#ff0088' }}>
                  ⚠️ Claim deadline expired
                </div>
              )}
            </GlassCard>
          )}

          {/* Display latency information if available */}
          {latencyStats.samples > 0 && (
            <GlassCard className="latency-info">
              <div className="latency-label">Network Latency</div>
              <div className="latency-value">{getLatencyRange()}</div>
              <div className="latency-note">
                Estimated one-way: ~{getEstimatedOneWayLatency()}ms
              </div>
            </GlassCard>
          )}
        </div>

        <div className="result-actions">
          <NeonButton variant="primary" size="large" fullWidth onClick={handlePlayAgain}>
            🎮 Play Again
          </NeonButton>
          <NeonButton variant="secondary" size="medium" fullWidth onClick={handleViewStats}>
            📊 View Stats
          </NeonButton>
          <NeonButton variant="ghost" size="medium" fullWidth onClick={handleDashboard}>
            🏠 Dashboard
          </NeonButton>
        </div>

        {!isWinner && !isTie && (
          <GlassCard className="encouragement">
            <p>💡 Tip: Focus on the center and trust your instincts!</p>
          </GlassCard>
        )}
      </div>
    </div>
  );
};

export default ResultScreen;
