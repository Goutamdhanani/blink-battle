import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useGameContext } from '../context/GameContext';
import { usePollingGame } from '../hooks/usePollingGame';
import { minikit } from '../lib/minikit';
import { useMiniKit } from '../hooks/useMiniKit';
import { GlassCard, NeonButton } from './ui';
import './Matchmaking.css';

// NOTE: Payment UI is handled by MiniKit drawer (native World App payment interface)
// We no longer use custom payment screens - MiniKit drawer is opened before joining queue

const STAKE_OPTIONS = [0.1, 0.25, 0.5, 1.0];
const MAX_STAKE = 0.1; // Maximum stake enforced by platform

const Matchmaking: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, setToken } = useGameContext();
  const { joinMatchmaking, cancelMatchmaking, isPolling } = usePollingGame();
  const { isInstalled } = useMiniKit();
  const [selectedStake, setSelectedStake] = useState<number>(0.1);
  const [searching, setSearching] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const isFree = location.state?.isFree || false;

  useEffect(() => {
    if (!state.user || !state.token) {
      navigate('/');
      return;
    }

    // If game phase is countdown or waiting, navigate to game
    if ((state.gamePhase === 'countdown' || state.gamePhase === 'waiting') && state.matchId) {
      console.log('[Matchmaking] Ready to start game, navigating to arena');
      navigate('/game');
    }
  }, [state.user, state.token, state.gamePhase, state.matchId, navigate]);

  /**
   * Handle joining matchmaking queue
   * For staked games, opens MiniKit payment drawer BEFORE joining queue
   */
  const handleJoinQueue = async () => {
    if (!state.user) return;

    // Clear previous errors
    setPaymentError(null);
    setNeedsAuth(false);

    // Check if user has valid token
    if (!state.token) {
      setPaymentError('Authentication required. Please sign in again.');
      setNeedsAuth(true);
      return;
    }

    // Validate stake cap
    if (selectedStake > MAX_STAKE) {
      setPaymentError(`Maximum stake is ${MAX_STAKE} WLD`);
      return;
    }

    // For staked games, initiate payment FIRST via MiniKit drawer
    if (!isFree && selectedStake > 0) {
      setProcessingPayment(true);
      try {
        console.log('[Matchmaking] Opening MiniKit payment drawer for stake:', selectedStake);
        
        // Open MiniKit payment drawer - this handles the entire payment UI
        const result = await minikit.initiatePayment(selectedStake);

        console.log('[Matchmaking] MiniKit payment result:', result);

        if (result.success) {
          // Check if transaction is still pending
          if (result.pending) {
            minikit.sendHaptic('warning');
            setPaymentError('Transaction is pending confirmation. Please wait and try again in a moment.');
            setProcessingPayment(false);
            return;
          }

          // Payment confirmed! Now join matchmaking with payment reference
          minikit.sendHaptic('success');
          console.log('[Matchmaking] Payment confirmed, joining queue with reference:', result.reference);
          
          setProcessingPayment(false);
          setSearching(true);
          
          // Join matchmaking with payment reference
          await joinMatchmaking(state.user.userId, selectedStake, result.reference);
        } else {
          minikit.sendHaptic('error');
          const errorMsg = result.error || 'Payment failed';
          console.error('[Matchmaking] Payment failed:', errorMsg, 'errorCode:', result.errorCode);
          setPaymentError(errorMsg);
          setProcessingPayment(false);
        }
      } catch (error: any) {
        console.error('[Matchmaking] Payment error:', error);
        minikit.sendHaptic('error');
        
        // Check if it's an authentication error
        if (error.isAuthError) {
          setPaymentError('Your session has expired. Please sign in again.');
          setNeedsAuth(true);
          setToken(null);
        } else {
          const errorMessage = error.message || 'Failed to process payment';
          console.error('[Matchmaking] Setting error message:', errorMessage);
          setPaymentError(errorMessage);
        }
        
        setProcessingPayment(false);
      }
    } else {
      // Free match - join directly without payment
      setSearching(true);
      try {
        await joinMatchmaking(state.user.userId, 0);
      } catch (matchmakingError: any) {
        console.error('[Matchmaking] Failed to join matchmaking:', matchmakingError);
        setSearching(false);
        setPaymentError(matchmakingError.message || 'Failed to join matchmaking. Please try again.');
      }
    }
  };

  const handleCancel = async () => {
    if (!state.user) return;

    setSearching(false);
    
    try {
      await cancelMatchmaking(state.user.userId);
    } catch (error) {
      console.error('[Matchmaking] Error cancelling:', error);
    }
  };

  const handleBack = () => {
    if (searching) {
      handleCancel();
    }
    // If auth error, navigate to root to trigger re-auth
    if (needsAuth) {
      navigate('/');
    } else {
      navigate('/dashboard');
    }
  };

  const handleRetry = () => {
    // Clear error state and allow retry
    setPaymentError(null);
    setNeedsAuth(false);
    setProcessingPayment(false);
    setSearching(false);
  };

  if (!state.user) return null;

  // Remove custom payment screen - MiniKit drawer handles payment UI
  // Show searching state while finding match
  if (searching) {
    return (
      <div className="matchmaking">
        <div className="matchmaking-container fade-in">
          <h1 className="page-title">🔍 Finding Opponent...</h1>

          <GlassCard className="searching-info">
            <div className="searching-animation">
              <div className="spinner"></div>
            </div>
            <p className="info-text">
              {isFree ? 'Searching for practice partner...' : `Searching for opponent at ${selectedStake} WLD stake...`}
            </p>
          </GlassCard>

          <NeonButton
            variant="secondary"
            size="medium"
            fullWidth
            onClick={handleCancel}
          >
            Cancel Search
          </NeonButton>

          {paymentError && (
            <GlassCard className="error-message">
              <div>{paymentError}</div>
            </GlassCard>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="matchmaking">
      <div className="matchmaking-container fade-in">
        <button 
          className="back-btn" 
          onClick={handleBack}
          disabled={processingPayment}
        >
          ← Back
        </button>

        <h1 className="page-title">
          {isFree ? '🎮 Practice Mode' : '💎 PvP Staking'}
        </h1>

        {!searching && !processingPayment ? (
          <div className="stake-selection">
            <h2 className="section-title">Select Your Stake</h2>
            {isFree ? (
              <GlassCard className="free-mode-info">
                <p className="free-mode-text">Practice mode is completely free!</p>
                <p className="free-mode-subtext">No stakes, no risk, just pure skill testing</p>
              </GlassCard>
            ) : (
              <>
                <p className="info-text">
                  Winner takes 97% of the pot. Platform fee: 3%
                </p>
                {!isInstalled && (
                  <GlassCard className="warning-box">
                    ⚠️ Running in demo mode. Real payments require World App.
                  </GlassCard>
                )}
                <div className="stake-grid">
                  {STAKE_OPTIONS.map((stake) => {
                    const isDisabled = stake > MAX_STAKE;
                    return (
                      <GlassCard
                        key={stake}
                        className={`stake-option ${selectedStake === stake ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                        onClick={() => !isDisabled && setSelectedStake(stake)}
                        hover={!isDisabled}
                      >
                        <div className="stake-amount">{stake} WLD</div>
                        <div className="stake-payout">
                          {isDisabled ? '⚠️ Exceeds platform limit' : `Win: ${(stake * 2 * 0.97).toFixed(2)} WLD`}
                        </div>
                      </GlassCard>
                    );
                  })}
                </div>

              </>
            )}

            {paymentError && (
              <GlassCard className="error-message">
                <div>{paymentError}</div>
                {needsAuth && (
                  <div style={{ marginTop: '12px' }}>
                    <NeonButton
                      variant="secondary"
                      size="small"
                      fullWidth
                      onClick={handleBack}
                    >
                      Sign In Again
                    </NeonButton>
                  </div>
                )}
                {!needsAuth && (
                  <div style={{ marginTop: '12px' }}>
                    <NeonButton
                      variant="secondary"
                      size="small"
                      fullWidth
                      onClick={handleRetry}
                    >
                      Try Again
                    </NeonButton>
                  </div>
                )}
              </GlassCard>
            )}

            <NeonButton
              variant="primary"
              size="large"
              fullWidth
              onClick={handleJoinQueue}
              disabled={needsAuth || isPolling}
            >
              {needsAuth ? 'Sign In Required' : isPolling ? 'Connecting...' : 'Find Opponent'}
            </NeonButton>
          </div>
        ) : processingPayment ? (
          <div className="searching">
            <div className="spinner pulse"></div>
            <h2 className="searching-title">Processing Payment...</h2>
            <p className="searching-text">
              Waiting for World App payment confirmation
            </p>
            <div className="searching-animation">
              <div className="dot"></div>
              <div className="dot"></div>
              <div className="dot"></div>
            </div>
          </div>
        ) : (
          <div className="searching">
            <div className="spinner pulse"></div>
            <h2 className="searching-title">Finding Opponent...</h2>
            <p className="searching-text">
              {isFree ? 'Searching for practice partner' : `Searching for ${selectedStake} WLD stake`}
            </p>
            <div className="searching-animation">
              <div className="dot"></div>
              <div className="dot"></div>
              <div className="dot"></div>
            </div>
            <NeonButton variant="secondary" onClick={handleCancel}>
              Cancel
            </NeonButton>
          </div>
        )}

        <div className="matchmaking-info">
          <GlassCard className="info-card">
            <h3>⚡ Fast Matching</h3>
            <p>Average wait time: 30 seconds</p>
          </GlassCard>
          <GlassCard className="info-card">
            <h3>🎯 Fair Play</h3>
            <p>Anti-cheat system active</p>
          </GlassCard>
          <GlassCard className="info-card">
            <h3>🔒 Secure</h3>
            <p>Funds locked in escrow</p>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};

export default Matchmaking;
