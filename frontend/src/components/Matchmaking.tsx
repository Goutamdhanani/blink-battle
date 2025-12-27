import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useGameContext } from '../context/GameContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { minikit } from '../lib/minikit';
import { useMiniKit } from '../hooks/useMiniKit';
import { GlassCard, NeonButton } from './ui';
import './Matchmaking.css';

const STAKE_OPTIONS = [0.1, 0.25, 0.5, 1.0];

const Matchmaking: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, setToken } = useGameContext();
  const { joinMatchmaking, cancelMatchmaking, connected } = useWebSocket();
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

    // If match found, navigate to game
    if (state.gamePhase === 'countdown' && state.matchId) {
      navigate('/game');
    }
  }, [state.user, state.token, state.gamePhase, state.matchId, navigate]);

  // Memoized cleanup function to reset payment state
  const resetPaymentState = useCallback(() => {
    setProcessingPayment(false);
  }, []);

  const handleJoinQueue = async () => {
    if (!state.user) return;

    // Clear previous errors
    setPaymentError(null);
    setNeedsAuth(false);

    // Check if user has valid token before proceeding with payment
    if (!state.token) {
      setPaymentError('Authentication required. Please sign in again.');
      setNeedsAuth(true);
      return;
    }

    // For PvP mode, process payment with MiniKit first
    if (!isFree && isInstalled) {
      await handleMiniKitPayment();
    } else {
      // For free mode or demo mode (not in World App)
      setSearching(true);
      joinMatchmaking(state.user.userId, isFree ? 0 : selectedStake, state.user.walletAddress);
    }
  };

  const handleMiniKitPayment = async () => {
    if (!state.user) return;

    setProcessingPayment(true);
    setPaymentError(null);

    try {
      // Initiate payment via MiniKit Pay command
      const result = await minikit.initiatePayment(selectedStake);

      if (result.success) {
        // Check if transaction is still pending
        if (result.pending) {
          minikit.sendHaptic('warning');
          setPaymentError('Transaction is pending confirmation. Please wait and try again in a moment.');
          resetPaymentState();
          return;
        }

        // Payment successful - send haptic feedback and join matchmaking
        minikit.sendHaptic('success');
        
        resetPaymentState(); // Reset payment state before starting matchmaking
        setSearching(true);
        // Note: payment reference is stored on backend, matchmaking uses the same stake
        joinMatchmaking(
          state.user.userId, 
          selectedStake, 
          state.user.walletAddress
        );
      } else {
        minikit.sendHaptic('error');
        setPaymentError(result.error || 'Payment failed');
        resetPaymentState();
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      minikit.sendHaptic('error');
      
      // Check if it's an authentication error (using isAuthError flag from API client)
      if (error.isAuthError) {
        setPaymentError('Your session has expired. Please sign in again.');
        setNeedsAuth(true);
        // Update React state to reflect cleared authentication (localStorage already cleared by API interceptor)
        setToken(null);
      } else {
        setPaymentError(error.message || 'Failed to process payment');
      }
      
      resetPaymentState();
    }
  };

  const handleCancel = () => {
    if (!state.user) return;

    setSearching(false);
    cancelMatchmaking(state.user.userId, isFree ? 0 : selectedStake);
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
                  {STAKE_OPTIONS.map((stake) => (
                    <GlassCard
                      key={stake}
                      className={`stake-option ${selectedStake === stake ? 'selected' : ''}`}
                      onClick={() => setSelectedStake(stake)}
                      hover
                    >
                      <div className="stake-amount">{stake} WLD</div>
                      <div className="stake-payout">
                        Win: {(stake * 2 * 0.97).toFixed(2)} WLD
                      </div>
                    </GlassCard>
                  ))}
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
              disabled={!connected || needsAuth}
            >
              {!connected ? 'Connecting...' : needsAuth ? 'Sign In Required' : 'Find Opponent'}
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
