import React, { useState, useEffect, useRef } from 'react';
import { saveGameScoreWithSync as saveGameScore } from '../lib/indexedDB';
import { GameScore } from './types';
import './BlinkCount.css';

interface BlinkCountProps {
  onGameComplete: (score: GameScore) => void;
  onExit: () => void;
}

const BlinkCount: React.FC<BlinkCountProps> = ({ onGameComplete, onExit }) => {
  const [level, setLevel] = useState(1);
  const [score, setScore] = useState(0);
  const [gamePhase, setGamePhase] = useState<'instructions' | 'showing' | 'answering' | 'complete'>('instructions');
  const [startTime] = useState(Date.now());
  const [round, setRound] = useState(0);
  const [blinkCount, setBlinkCount] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [isBlinking, setIsBlinking] = useState(false);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const intervalRef = useRef<NodeJS.Timeout>();
  
  const TOTAL_ROUNDS = 8;
  const minBlinks = 3;
  const maxBlinks = Math.min(5 + level * 2, 15);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const completeGame = async () => {
    setGamePhase('complete');
    const timeMs = Date.now() - startTime;
    const accuracy = Math.round((correctAnswers / TOTAL_ROUNDS) * 100);

    const gameScore: GameScore = {
      gameType: 'blink_count',
      score,
      accuracy,
      timeMs,
      level,
      timestamp: Date.now(),
    };

    await saveGameScore(gameScore);
    onGameComplete(gameScore);
  };

  const startRound = () => {
    const randomBlinks = Math.floor(Math.random() * (maxBlinks - minBlinks + 1)) + minBlinks;
    setBlinkCount(randomBlinks);
    setUserAnswer('');
    setFeedback(null);
    setGamePhase('showing');

    let count = 0;
    let wasBlinking = false;
    intervalRef.current = setInterval(() => {
      setIsBlinking(prev => {
        const newBlinking = !prev;
        // Count when transitioning from hidden to visible
        if (newBlinking && !wasBlinking) {
          count++;
          if (count >= randomBlinks) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            setTimeout(() => {
              setGamePhase('answering');
            }, 500);
          }
        }
        wasBlinking = newBlinking;
        return newBlinking;
      });
    }, Math.max(200, 400 - level * 20));
  };

  const startGame = () => {
    setScore(0);
    setRound(0);
    setCorrectAnswers(0);
    startRound();
  };

  const handleSubmit = () => {
    const answer = parseInt(userAnswer);
    if (isNaN(answer)) return;

    const isCorrect = answer === blinkCount;
    
    if (isCorrect) {
      setCorrectAnswers(prev => prev + 1);
      setScore(prev => prev + (15 * level));
      setFeedback('correct');
    } else {
      setFeedback('wrong');
    }

    setTimeout(() => {
      if (round + 1 < TOTAL_ROUNDS) {
        setRound(prev => prev + 1);
        startRound();
      } else {
        completeGame();
      }
    }, 1500);
  };

  const handleNumberInput = (num: number) => {
    setUserAnswer(prev => {
      const newVal = prev + num.toString();
      return parseInt(newVal) > 20 ? prev : newVal;
    });
  };

  const handleClear = () => {
    setUserAnswer('');
  };

  if (gamePhase === 'instructions') {
    return (
      <div className="blink_count-game">
        <div className="game-instructions">
          <button className="exit-btn" onClick={onExit}>✕</button>
          <h2>👁️ Blink Count</h2>
          <p className="game-subtitle">Level {level}</p>
          <div className="instructions-content">
            <p>👀 Watch the circle blink on screen</p>
            <p>🧮 Count how many times it blinks</p>
            <p>📝 Enter the correct count</p>
            <p>⚡ Speed increases with level</p>
            <p>🎯 {TOTAL_ROUNDS} rounds per level</p>
          </div>
          <button className="start-btn" onClick={startGame}>
            Start Level {level}
          </button>
        </div>
      </div>
    );
  }

  if (gamePhase === 'complete') {
    const accuracy = Math.round((correctAnswers / TOTAL_ROUNDS) * 100);
    return (
      <div className="blink_count-game">
        <div className="game-complete">
          <h2>🎉 Level {level} Complete!</h2>
          <div className="final-stats">
            <div className="stat-item">
              <div className="stat-value">{score}</div>
              <div className="stat-label">Score</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{accuracy}%</div>
              <div className="stat-label">Accuracy</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{correctAnswers}/{TOTAL_ROUNDS}</div>
              <div className="stat-label">Correct</div>
            </div>
          </div>
          <div className="action-buttons">
            <button className="next-level-btn" onClick={() => { setLevel(prev => prev + 1); setGamePhase('instructions'); }}>
              Next Level →
            </button>
            <button className="menu-btn" onClick={onExit}>Main Menu</button>
          </div>
        </div>
      </div>
    );
  }

  if (gamePhase === 'showing') {
    return (
      <div className="blink_count-game">
        <div className="game-header">
          <button className="exit-btn" onClick={onExit}>✕</button>
          <div className="game-info">
            <span>Level {level}</span>
            <span>Round {round + 1}/{TOTAL_ROUNDS}</span>
            <span>Score: {score}</span>
          </div>
        </div>
        <div className="game-arena">
          <div className="instruction-text">Count the blinks!</div>
          <div className="blink-container">
            <div className={`blink-circle ${isBlinking ? 'visible' : 'hidden'}`}>
              👁️
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="blink_count-game">
      <div className="game-header">
        <button className="exit-btn" onClick={onExit}>✕</button>
        <div className="game-info">
          <span>Level {level}</span>
          <span>Round {round + 1}/{TOTAL_ROUNDS}</span>
          <span>Score: {score}</span>
        </div>
      </div>
      <div className="game-arena">
        <div className="answer-section">
          <div className="question">How many blinks did you count?</div>
          <div className="answer-display">
            {userAnswer || '?'}
          </div>
          
          {feedback && (
            <div className={`feedback ${feedback}`}>
              {feedback === 'correct' ? `✓ Correct! It was ${blinkCount}` : `✗ Wrong! It was ${blinkCount}`}
            </div>
          )}

          {!feedback && (
            <>
              <div className="number-pad">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                  <button
                    key={num}
                    className="number-btn"
                    onClick={() => handleNumberInput(num)}
                  >
                    {num}
                  </button>
                ))}
                <button className="number-btn clear-btn" onClick={handleClear}>Clear</button>
                <button className="number-btn" onClick={() => handleNumberInput(0)}>0</button>
                <button className="number-btn submit-btn" onClick={handleSubmit}>✓</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BlinkCount;
