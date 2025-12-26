import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameContext } from '../context/GameContext';
import { useWebSocket } from '../hooks/useWebSocket';
import './GameArena.css';

const GameArena: React.FC = () => {
  const navigate = useNavigate();
  const { state, setGamePhase } = useGameContext();
  const { playerReady, playerTap, connected } = useWebSocket();
  const [tapped, setTapped] = useState(false);
  const [tapTime, setTapTime] = useState<number | null>(null);

  useEffect(() => {
    if (!state.user || !state.matchId) {
      navigate('/dashboard');
      return;
    }

    // Auto-send player ready when entering game
    if (state.gamePhase === 'countdown' && state.matchId) {
      playerReady(state.matchId);
    }

    // Navigate to result screen when match completes
    if (state.gamePhase === 'result') {
      navigate('/result');
    }
  }, [state.user, state.matchId, state.gamePhase, navigate]);

  const handleTap = () => {
    if (tapped || !state.matchId || state.gamePhase !== 'signal') return;

    const clientTimestamp = Date.now();
    setTapped(true);
    setTapTime(clientTimestamp);
    playerTap(state.matchId, clientTimestamp);

    // Add haptic feedback if available
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  };

  const renderPhaseContent = () => {
    switch (state.gamePhase) {
      case 'countdown':
        return (
          <div className="phase-content fade-in">
            <h2 className="phase-title">Get Ready!</h2>
            {state.countdown !== null ? (
              <div className="countdown-number glow-primary pulse">
                {state.countdown}
              </div>
            ) : (
              <div className="waiting-text">
                <p>Waiting for opponent...</p>
                <div className="spinner"></div>
              </div>
            )}
          </div>
        );

      case 'waiting':
        return (
          <div className="phase-content fade-in">
            <div className="waiting-for-signal">
              <div className="focus-circle pulse"></div>
              <p className="focus-text">Wait for the signal...</p>
            </div>
          </div>
        );

      case 'signal':
        return (
          <div className="phase-content fade-in">
            <div className={`tap-button ${tapped ? 'tapped' : ''}`} onClick={handleTap}>
              <div className="tap-button-inner glow">
                {tapped ? (
                  <span className="tapped-text">✓ Tapped!</span>
                ) : (
                  <span className="tap-text">TAP NOW!</span>
                )}
              </div>
            </div>
            {tapped && tapTime && state.signalTimestamp && (
              <div className="reaction-time fade-in">
                Your reaction: {tapTime - state.signalTimestamp}ms
              </div>
            )}
          </div>
        );

      default:
        return (
          <div className="phase-content">
            <p>Loading...</p>
          </div>
        );
    }
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
          {renderPhaseContent()}
        </div>

        <div className="game-footer">
          <p className="opponent-info">
            vs {state.opponentWallet?.substring(0, 8)}...
          </p>
        </div>
      </div>
    </div>
  );
};

export default GameArena;
