import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameContext } from '../context/GameContext';
import { useSocket } from '../context/SocketContext';
import { minikit } from '../lib/minikit';
import ReactionTestUI, { ReactionPhase } from './ReactionTestUI';
import './GameArena.css';

const GameArena: React.FC = () => {
  const navigate = useNavigate();
  const { state } = useGameContext();
  const { playerReady, playerTap, connected } = useSocket();
  const [tapped, setTapped] = useState(false);
  const [tapTime, setTapTime] = useState<number | null>(null);
  const readySent = useRef(false);

  useEffect(() => {
    if (!state.user || !state.matchId) {
      navigate('/dashboard');
      return;
    }

    // Navigate to result screen when match completes
    if (state.gamePhase === 'result') {
      navigate('/result');
    }
  }, [state.user, state.matchId, state.gamePhase, navigate]);

  // Send player ready when entering game and connected
  useEffect(() => {
    if (state.gamePhase === 'countdown' && state.matchId && connected && !readySent.current) {
      console.log('[GameArena] Sending player_ready (connected)');
      playerReady(state.matchId);
      readySent.current = true;
    }
  }, [state.gamePhase, state.matchId, connected, playerReady]);

  // Retry sending player ready if we reconnect
  useEffect(() => {
    if (connected && state.matchId && state.gamePhase === 'countdown' && !readySent.current) {
      console.log('[GameArena] Reconnected, sending player_ready');
      playerReady(state.matchId);
      readySent.current = true;
    }
  }, [connected, state.matchId, state.gamePhase, playerReady]);

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

  const handleTap = () => {
    if (tapped || !state.matchId || state.gamePhase !== 'signal') return;

    const clientTimestamp = Date.now();
    setTapped(true);
    setTapTime(clientTimestamp);
    playerTap(state.matchId, clientTimestamp);

    // Send haptic feedback
    minikit.sendHaptic('success');
    
    // Fallback vibration for browsers
    if (navigator.vibrate) {
      navigator.vibrate(50);
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
              {connected ? '🟢 Connected' : '🔴 Disconnected'}
            </span>
          </div>
        </div>

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
