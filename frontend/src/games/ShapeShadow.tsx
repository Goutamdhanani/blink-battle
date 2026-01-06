import React, { useState, useEffect } from 'react';
import { saveGameScoreWithSync as saveGameScore } from '../lib/indexedDB';
import { GameScore } from './types';
import './ShapeShadow.css';

interface ShapeShadowProps {
  onGameComplete: (score: GameScore) => void;
  onExit: () => void;
}

const SHAPES = [
  { name: 'circle', shape: '⚫', shadow: '○' },
  { name: 'square', shape: '■', shadow: '□' },
  { name: 'triangle', shape: '▲', shadow: '△' },
  { name: 'star', shape: '★', shadow: '☆' },
  { name: 'diamond', shape: '◆', shadow: '◇' },
  { name: 'heart', shape: '♥', shadow: '♡' },
];

const ShapeShadow: React.FC<ShapeShadowProps> = ({ onGameComplete, onExit }) => {
  const [level, setLevel] = useState(1);
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(0);
  const [shadowShape, setShadowShape] = useState('');
  const [options, setOptions] = useState<string[]>([]);
  const [correctShape, setCorrectShape] = useState('');
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [startTime] = useState(Date.now());
  const [gamePhase, setGamePhase] = useState<'instructions' | 'playing' | 'complete'>('instructions');
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);

  const TOTAL_ROUNDS = 10;
  
  // Increase number of shapes based on level: start with 6, increase by 2 per level, max 16
  const getShapesForLevel = (currentLevel: number) => {
    return Math.min(6 + (currentLevel - 1) * 2, 16);
  };
  
  const optionCount = getShapesForLevel(level);

  useEffect(() => {
    if (gamePhase === 'playing' && round < TOTAL_ROUNDS) {
      presentNextRound();
    } else if (round >= TOTAL_ROUNDS && gamePhase === 'playing') {
      completeGame();
    }
  }, [round, gamePhase]);

  const presentNextRound = () => {
    const correct = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    setShadowShape(correct.shadow);
    setCorrectShape(correct.shape);

    // Create options including the correct one
    const opts = [correct.shape];
    const availableShapes = SHAPES.filter(s => s.shape !== correct.shape);
    
    // Add random shapes without modifying the original array
    const selectedIndices = new Set<number>();
    while (opts.length < optionCount && selectedIndices.size < availableShapes.length) {
      const randomIndex = Math.floor(Math.random() * availableShapes.length);
      if (!selectedIndices.has(randomIndex)) {
        selectedIndices.add(randomIndex);
        opts.push(availableShapes[randomIndex].shape);
      }
    }

    // Shuffle options
    setOptions(opts.sort(() => Math.random() - 0.5));
    setFeedback(null);
  };

  const handleChoice = (chosen: string) => {
    if (feedback) return;

    const isCorrect = chosen === correctShape;
    
    if (isCorrect) {
      setCorrectAnswers(prev => prev + 1);
      setScore(prev => prev + (15 * level));
      setFeedback('correct');
    } else {
      setFeedback('wrong');
    }

    setTimeout(() => {
      setRound(prev => prev + 1);
      setFeedback(null);
    }, 1000);
  };

  const completeGame = async () => {
    setGamePhase('complete');
    const timeMs = Date.now() - startTime;
    const accuracy = Math.round((correctAnswers / TOTAL_ROUNDS) * 100);

    const gameScore: GameScore = {
      gameType: 'shape_shadow',
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
    setRound(0);
  };

  const nextLevel = () => {
    setLevel(prev => prev + 1);
    setScore(0);
    setCorrectAnswers(0);
    setGamePhase('instructions');
  };

  if (gamePhase === 'instructions') {
    return (
      <div className="shape-shadow-game">
        <div className="game-instructions">
          <button className="exit-btn" onClick={onExit}>✕</button>
          <h2>🔲 Shape Shadow</h2>
          <p className="game-subtitle">Level {level}</p>
          <div className="instructions-content">
            <p>👁️ Match the shadow to its correct shape</p>
            <p>🎯 Select the shape that casts the shadow</p>
            <p>⚡ {optionCount} options to choose from</p>
            <p>🎮 {TOTAL_ROUNDS} rounds per level</p>
          </div>
          <button className="start-btn" onClick={startGame}>Start Level {level}</button>
        </div>
      </div>
    );
  }

  if (gamePhase === 'complete') {
    const accuracy = Math.round((correctAnswers / TOTAL_ROUNDS) * 100);
    return (
      <div className="shape-shadow-game">
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
            <button className="next-level-btn" onClick={nextLevel}>Next Level →</button>
            <button className="menu-btn" onClick={onExit}>Main Menu</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="shape-shadow-game">
      <div className="game-header">
        <button className="exit-btn" onClick={onExit}>✕</button>
        <div className="game-info">
          <span>Level {level}</span>
          <span>Round {round + 1}/{TOTAL_ROUNDS}</span>
          <span>Score: {score}</span>
        </div>
      </div>

      <div className="game-arena">
        <div className="shadow-display">
          <div className="shadow-label">Shadow:</div>
          <div className={`shadow-shape ${feedback || ''}`}>{shadowShape}</div>
        </div>

        <div className={`shape-options ${optionCount > 6 ? 'many-shapes' : ''}`}>
          {options.map((shape, index) => (
            <button
              key={index}
              className={`shape-option ${feedback && shape === correctShape ? 'correct-answer' : ''}`}
              onClick={() => handleChoice(shape)}
              disabled={!!feedback}
            >
              {shape}
            </button>
          ))}
        </div>

        {feedback && (
          <div className={`feedback ${feedback}`}>
            {feedback === 'correct' ? '✓ Correct!' : '✗ Wrong!'}
          </div>
        )}

        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${(round / TOTAL_ROUNDS) * 100}%` }} />
        </div>
      </div>
    </div>
  );
};

export default ShapeShadow;
