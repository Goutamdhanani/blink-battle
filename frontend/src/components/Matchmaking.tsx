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
  const { joinMatchmaking, cancelMatchmaking, paymentConfirmed, connected, isConnecting } = useWebSocket();
  const { isInstalled } = useMiniKit();
  const [selectedStake, setSelectedStake] = useState<number>(0.1);
  const [searching, setSearching] = useState(false);
  const [matchFound, setMatchFound] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [opponentPaid, setOpponentPaid] = useState(false);
  const [bothPaid, setBothPaid] = useState(false);
  const [paymentReference, setPaymentReference] = useState<string | null>(null);
  const isFree = location.state?.isFree || false;

  useEffect(() => {
    if (!state.user || !state.token) {
      navigate('/');
      return;
    }

    // If match found and need to show payment screen
    if (state.matchId && !isFree && !matchFound) {
      setMatchFound(true);
      setSearching(false);
    }

    // If game phase is countdown and both paid, navigate to game
    if (state.gamePhase === 'countdown' && state.matchId && (bothPaid || isFree)) {
      navigate('/game');
    }
  }, [state.user, state.token, state.gamePhase, state.matchId, navigate, matchFound, bothPaid, isFree]);

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

    // NEW FLOW: Join matchmaking WITHOUT paying first
    setSearching(true);
    try {
      await joinMatchmaking(state.user.userId, isFree ? 0 : selectedStake, state.user.walletAddress);
    } catch (matchmakingError: any) {
      console.error('[Matchmaking] Failed to join matchmaking:', matchmakingError);
      setSearching(false);
      setPaymentError(matchmakingError.message || 'Failed to join matchmaking. Please try again.');
    }
  };

  const handlePayNow = async () => {
    if (!state.user || !state.matchId) return;

    setProcessingPayment(true);
    setPaymentError(null);

    try {
      console.log('[Matchmaking] Initiating MiniKit payment for stake:', selectedStake);
      // Initiate payment via MiniKit Pay command
      const result = await minikit.initiatePayment(selectedStake);

      console.log('[Matchmaking] Payment result:', result);

      if (result.success) {
        // Check if transaction is still pending
        if (result.pending) {
          minikit.sendHaptic('warning');
          setPaymentError('Transaction is pending confirmation. Please wait and try again in a moment.');
          setProcessingPayment(false);
          return;
        }

        // Payment successful - send haptic feedback
        minikit.sendHaptic('success');
        
        // Store payment reference
        setPaymentReference(result.reference);
        setProcessingPayment(false);

        // Notify backend that payment is confirmed
        paymentConfirmed(state.matchId, state.user.userId, result.reference);
        
        console.log('[Matchmaking] Payment confirmed, reference:', result.reference);
        // The backend will notify us when both players have paid via 'both_players_paid' event
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
  };

  const handleCancel = () => {
    if (!state.user) return;

    setSearching(false);
    setMatchFound(false);
    if (state.matchId) {
      // TODO: Emit match cancel event to backend
    }
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
              disabled={!connected || needsAuth || isConnecting}
            >
              {needsAuth ? 'Sign In Required' : (isConnecting || !connected) ? 'Connecting...' : 'Find Opponent'}
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
