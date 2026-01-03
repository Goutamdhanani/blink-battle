import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameContext } from '../context/GameContext';
import { usePollingGame } from '../hooks/usePollingGame';
import { minikit } from '../lib/minikit';
import ReactionTestUI, { ReactionPhase } from './ReactionTestUI';
import './GameArena.css';

const GameArena: React.FC = () => {
  const navigate = useNavigate();
  const { state } = useGameContext();
  const { recordTap, error: pollingError } = usePollingGame();
  const [tapped, setTapped] = useState(false);
  const [tapTime, setTapTime] = useState<number | null>(null);

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
      minikit.sendHaptic('warning');
    }
  }, [state.countdown]);

  // Send haptic feedback for signal
  useEffect(() => {
    if (state.gamePhase === 'signal') {
      minikit.sendHaptic('success');
    }
  }, [state.gamePhase]);

  const handleTap = async () => {
    if (tapped || !state.matchId || state.gamePhase !== 'signal') return;

    const clientTimestamp = Date.now();
    setTapped(true);
    setTapTime(clientTimestamp);
    
    try {
      await recordTap(state.matchId);
      
      // Send haptic feedback
      minikit.sendHaptic('success');
      
      // Fallback vibration for browsers
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    } catch (error) {
      console.error('[GameArena] Error recording tap:', error);
      // Still provide feedback even if recording failed
      minikit.sendHaptic('error');
    }
  };

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
  );
};

export default GameArena;
