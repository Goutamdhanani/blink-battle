import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameContext } from '../context/GameContext';
import { usePollingGame } from '../hooks/usePollingGame';
import { useHaptics } from '../hooks/useHaptics';
import { useGameSounds } from '../hooks/useGameSounds';
import ReactionTestUI, { ReactionPhase } from './ReactionTestUI';
import './GameArena.css';

const GameArena: React.FC = () => {
  const navigate = useNavigate();
  const { state } = useGameContext();
  const { recordTap, error: pollingError } = usePollingGame();
  const { triggerHaptic } = useHaptics();
  const { playSound } = useGameSounds();
  const [tapped, setTapped] = useState(false);
  const [tapTime, setTapTime] = useState<number | null>(null);
  const [localReactionTime, setLocalReactionTime] = useState<number | null>(null);
  const tapButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state.user || !state.matchId) {
      console.error('[GameArena] Missing user or matchId, redirecting to dashboard');
      navigate('/dashboard');
      return;
    }

    // Navigate to result screen when match completes
    if (state.gamePhase === 'result') {
      console.log('[GameArena] Match complete, navigating to result screen');
      navigate('/result');
    }
  }, [state.user, state.matchId, state.gamePhase, navigate]);

  // Log game phase changes for debugging
  useEffect(() => {
    console.log(`[GameArena] Game phase changed to: ${state.gamePhase}, countdown: ${state.countdown}`);
  }, [state.gamePhase, state.countdown]);

  // Send haptic feedback for countdown
  useEffect(() => {
    if (state.gamePhase === 'countdown' && state.countdown !== null) {
      triggerHaptic('light');
      playSound('countdown');
    }
  }, [state.countdown, state.gamePhase, triggerHaptic, playSound]);

  // Send haptic feedback for signal
  useEffect(() => {
    if (state.gamePhase === 'signal') {
      triggerHaptic('heavy');
      playSound('spawn');
    }
  }, [state.gamePhase, triggerHaptic, playSound]);

  /**
   * Handle tap with optimistic UI
   * Provides instant feedback before server confirmation
   */
  const handleTap = async () => {
    if (tapped || !state.matchId || state.gamePhase !== 'signal') return;
    
    // 1. INSTANT visual feedback (before any network call)
    setTapped(true);
    setTapTime(Date.now());
    
    // 2. Calculate and display local reaction time immediately
    if (state.signalTimestamp) {
      const reactionTime = Date.now() - state.signalTimestamp;
      setLocalReactionTime(reactionTime);
      console.log(`[GameArena] Local reaction time: ${reactionTime}ms`);
    }
    
    // 3. Instant haptic and audio feedback
    triggerHaptic('heavy');
    playSound('tap');
    
    // 4. Send to server IN BACKGROUND (don't await for UI updates)
    try {
      await recordTap(state.matchId);
      console.log('[GameArena] Tap recorded on server');
    } catch (error) {
      console.error('[GameArena] Error recording tap:', error);
      // Keep UI feedback even if server recording failed
      // User already sees their tap response
    }
  };

  /**
   * Add touch event listener for faster mobile response
   * touchstart fires faster than click on mobile devices
   */
  useEffect(() => {
    const button = tapButtonRef.current;
    if (!button) return;
    
    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault(); // Prevent double-firing with click event
      handleTap();
    };
    
    // Passive: false allows preventDefault
    button.addEventListener('touchstart', handleTouchStart, { passive: false });
    
    return () => {
      button.removeEventListener('touchstart', handleTouchStart);
    };
  }, [tapped, state.matchId, state.gamePhase, state.signalTimestamp]); // eslint-disable-line react-hooks/exhaustive-deps

  // Map game phase to ReactionTestUI phase
  const getReactionPhase = (): ReactionPhase => {
    if (state.gamePhase === 'signal' && tapped) return 'tapped';
    if (state.gamePhase === 'waiting') return 'waiting';
    if (state.gamePhase === 'countdown') return 'countdown';
    if (state.gamePhase === 'signal') return 'go';
    return 'idle';
  };

  const getOpponentInfo = (): string | undefined => {
    if (state.opponentWallet) {
      return `vs ${state.opponentWallet.substring(0, 8)}...`;
    }
    return undefined;
  };

  const getReactionTime = (): number | null => {
    // Show local reaction time immediately (optimistic UI)
    if (localReactionTime !== null) {
      return localReactionTime;
    }
    // Fallback to calculated time
    if (tapped && tapTime && state.signalTimestamp) {
      return tapTime - state.signalTimestamp;
    }
    return null;
  };

  return (
    <div className="game-arena">
      <div className="game-container">
        <div className="game-header">
          <div className="match-info">
            <span className="stake-display">
              Stake: {state.stake || 0} WLD
            </span>
            <span className="connection-status">
              🟢 Connected
            </span>
          </div>
        </div>

        {pollingError && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.2)',
            border: '1px solid rgba(239, 68, 68, 0.5)',
            borderRadius: '8px',
            padding: '12px',
            margin: '16px',
            color: '#fecaca',
            fontSize: '14px',
            textAlign: 'center'
          }}>
            ⚠️ Connection issue: {pollingError}
          </div>
        )}

        <div className="game-content">
          <div ref={tapButtonRef}>
            <ReactionTestUI
              phase={getReactionPhase()}
              countdown={state.countdown}
              onTap={handleTap}
              disabled={tapped}
              reactionTime={getReactionTime()}
              opponentInfo={getOpponentInfo()}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameArena;
