import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameContext } from '../context/GameContext';
import { minikit } from '../lib/minikit';
import confetti from 'canvas-confetti';
import './ResultScreen.css';

const ResultScreen: React.FC = () => {
  const navigate = useNavigate();
  const { state, resetGame } = useGameContext();

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
  }, [state.user, state.result, state.winnerId, navigate]);

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

  if (!state.user || !state.result) return null;

  const isWinner = state.winnerId === state.user.userId;
  const isTie = state.result === 'tie';
  const yourReaction = state.yourReaction || 0;
  const opponentReaction = state.opponentReaction || 0;

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

  const winnings = calculateWinnings();

  return (
    <div className="result-screen">
      <div className="result-container fade-in">
        <div className={`result-header ${isWinner ? 'winner' : isTie ? 'tie' : 'loser'}`}>
          <h1 className="result-title">{getResultMessage()}</h1>
          <p className="result-description">{getResultDescription()}</p>
        </div>

        <div className="result-stats">
          <div className="stat-row">
            <div className="stat-box your-stat">
              <div className="stat-label">Your Reaction</div>
              <div className={`stat-value ${yourReaction < opponentReaction ? 'better' : ''}`}>
                {yourReaction > 0 ? `${yourReaction}ms` : 'No tap'}
              </div>
            </div>
            <div className="vs">VS</div>
            <div className="stat-box opponent-stat">
              <div className="stat-label">Opponent</div>
              <div className={`stat-value ${opponentReaction < yourReaction ? 'better' : ''}`}>
                {opponentReaction > 0 ? `${opponentReaction}ms` : 'No tap'}
              </div>
            </div>
          </div>

          {state.stake && state.stake > 0 && (
            <div className="winnings-box">
              <div className="winnings-label">
                {isTie ? 'Refunded' : isWinner ? 'You Won' : 'You Lost'}
              </div>
              <div className={`winnings-amount ${isWinner || isTie ? 'positive' : 'negative'}`}>
                {isWinner || isTie ? '+' : '-'}{winnings.toFixed(2)} WLD
              </div>
            </div>
          )}
        </div>

        <div className="result-actions">
          <button className="btn btn-primary glow" onClick={handlePlayAgain}>
            🎮 Play Again
          </button>
          <button className="btn btn-secondary" onClick={handleViewStats}>
            📊 View Stats
          </button>
          <button className="btn btn-outline" onClick={handleDashboard}>
            🏠 Dashboard
          </button>
        </div>

        {!isWinner && !isTie && (
          <div className="encouragement">
            <p>💡 Tip: Focus on the center and trust your instincts!</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResultScreen;
