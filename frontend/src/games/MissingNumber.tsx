import React, { useState, useEffect } from 'react';
import { saveGameScoreWithSync as saveGameScore } from '../lib/indexedDB';
import { GameScore } from './types';
import './MissingNumber.css';

interface MissingNumberProps {
  onGameComplete: (score: GameScore) => void;
  onExit: () => void;
}

const MissingNumber: React.FC<MissingNumberProps> = ({ onGameComplete, onExit }) => {
  const [level, setLevel] = useState(1);
  const [score, setScore] = useState(0);
  const [gamePhase, setGamePhase] = useState<'instructions' | 'playing' | 'complete'>('instructions');
  const [startTime] = useState(Date.now());
  const [round, setRound] = useState(0);
  const [sequence, setSequence] = useState<(number | null)[]>([]);
  const [missingNumber, setMissingNumber] = useState(0);
  const [options, setOptions] = useState<number[]>([]);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  
  const TOTAL_ROUNDS = 10;
  const sequenceLength = Math.min(5 + level, 10);

  useEffect(() => {
    if (gamePhase === 'playing' && round < TOTAL_ROUNDS) {
      generateSequence();
    } else if (round >= TOTAL_ROUNDS && gamePhase === 'playing') {
      completeGame();
    }
  }, [round, gamePhase]);

  const generateSequence = () => {
    const start = Math.floor(Math.random() * 20) + 1;
    const step = Math.floor(Math.random() * 3) + 1; // Step of 1, 2, or 3
    
    const fullSeq: number[] = [];
    for (let i = 0; i < sequenceLength; i++) {
      fullSeq.push(start + i * step);
    }

    // Remove one random number
    const missingIndex = Math.floor(Math.random() * sequenceLength);
    const missing = fullSeq[missingIndex];
    const seqWithGap = fullSeq.map((num, idx) => idx === missingIndex ? null : num);

    setSequence(seqWithGap);
    setMissingNumber(missing);

    // Generate options
    const opts = [missing];
    while (opts.length < 4) {
      const randomOffset = (Math.random() > 0.5 ? 1 : -1) * (Math.floor(Math.random() * 3) + 1) * step;
      const opt = missing + randomOffset;
      if (!opts.includes(opt) && opt > 0) {
        opts.push(opt);
      }
    }

    setOptions(opts.sort(() => Math.random() - 0.5));
    setFeedback(null);
  };

  const completeGame = async () => {
    setGamePhase('complete');
    const timeMs = Date.now() - startTime;
    const accuracy = Math.round((correctAnswers / TOTAL_ROUNDS) * 100);

    const gameScore: GameScore = {
      gameType: 'missing_number',
      score,
      accuracy,
      timeMs,
      level,
      timestamp: Date.now(),
    };

    await saveGameScore(gameScore);
    onGameComplete(gameScore);
  };

  const startGame = () => {
    setGamePhase('playing');
    setScore(0);
    setRound(0);
    setCorrectAnswers(0);
  };

  const handleAnswer = (answer: number) => {
    if (feedback) return;

    const isCorrect = answer === missingNumber;
    
    if (isCorrect) {
      setCorrectAnswers(prev => prev + 1);
      setScore(prev => prev + (15 * level));
      setFeedback('correct');
    } else {
      setFeedback('wrong');
    }

    setTimeout(() => {
      setRound(prev => prev + 1);
    }, 1200);
  };

  if (gamePhase === 'instructions') {
    return (
      <div className="missing_number-game">
        <div className="game-instructions">
          <button className="exit-btn" onClick={onExit}>✕</button>
          <h2>🔢 Missing Number</h2>
          <p className="game-subtitle">Level {level}</p>
          <div className="instructions-content">
            <p>🔍 Look at the number sequence</p>
            <p>❓ One number is missing</p>
            <p>🎯 Find the pattern and select the missing number</p>
            <p>📊 Sequence length: {sequenceLength}</p>
            <p>🎮 {TOTAL_ROUNDS} rounds per level</p>
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
      <div className="missing_number-game">
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

  return (
    <div className="missing_number-game">
      <div className="game-header">
        <button className="exit-btn" onClick={onExit}>✕</button>
        <div className="game-info">
          <span>Level {level}</span>
          <span>Round {round + 1}/{TOTAL_ROUNDS}</span>
          <span>Score: {score}</span>
        </div>
      </div>
      <div className="game-arena">
        <div className="instruction-text">Find the missing number:</div>
        
        <div className="sequence-display">
          {sequence.map((num, idx) => (
            <div key={idx} className={`sequence-item ${num === null ? 'missing' : ''}`}>
              {num === null ? '?' : num}
            </div>
          ))}
        </div>

        {feedback && (
          <div className={`feedback ${feedback}`}>
            {feedback === 'correct' ? `✓ Correct! It was ${missingNumber}` : `✗ Wrong! It was ${missingNumber}`}
          </div>
        )}

        {!feedback && (
          <div className="options-grid">
            {options.map((opt, idx) => (
              <button
                key={idx}
                className="option-btn"
                onClick={() => handleAnswer(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${(round / TOTAL_ROUNDS) * 100}%` }} />
        </div>
      </div>
    </div>
  );
};

export default MissingNumber;
