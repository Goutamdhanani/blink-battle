import React, { useState, useEffect } from 'react';
import { saveGameScoreWithSync as saveGameScore } from '../lib/indexedDB';
import { GameScore } from './types';
import './ColorSwap.css';

interface ColorSwapProps {
  onGameComplete: (score: GameScore) => void;
  onExit: () => void;
}

const COLORS = [
  { name: 'RED', hex: '#ef4444' },
  { name: 'BLUE', hex: '#3b82f6' },
  { name: 'GREEN', hex: '#22c55e' },
  { name: 'YELLOW', hex: '#eab308' },
  { name: 'PURPLE', hex: '#a855f7' },
  { name: 'ORANGE', hex: '#f97316' },
];

const ColorSwap: React.FC<ColorSwapProps> = ({ onGameComplete, onExit }) => {
  const [level, setLevel] = useState(1);
  const [score, setScore] = useState(0);
  const [gamePhase, setGamePhase] = useState<'instructions' | 'playing' | 'complete'>('instructions');
  const [startTime] = useState(Date.now());
  const [round, setRound] = useState(0);
  const [wordText, setWordText] = useState('');
  const [wordColor, setWordColor] = useState('');
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [questionType, setQuestionType] = useState<'word' | 'color'>('word');
  
  const TOTAL_ROUNDS = 12;

  useEffect(() => {
    if (gamePhase === 'playing' && round < TOTAL_ROUNDS) {
      presentQuestion();
    } else if (round >= TOTAL_ROUNDS && gamePhase === 'playing') {
      completeGame();
    }
  }, [round, gamePhase]);

  const presentQuestion = () => {
    // Randomly select the word to display
    const wordColor = COLORS[Math.floor(Math.random() * COLORS.length)];
    
    // Randomly select a different color for displaying the word
    let displayColor = COLORS[Math.floor(Math.random() * COLORS.length)];
    
    // Ensure color and word are different for difficulty
    while (displayColor.name === wordColor.name) {
      displayColor = COLORS[Math.floor(Math.random() * COLORS.length)];
    }
    
    // Randomly ask for word meaning or text color
    const askAbout = Math.random() > 0.5 ? 'word' : 'color';

    setWordText(wordColor.name);
    setWordColor(displayColor.hex);
    setQuestionType(askAbout);
    setCorrectAnswer(askAbout === 'word' ? wordColor.name : displayColor.name);
    setFeedback(null);
  };

  const completeGame = async () => {
    setGamePhase('complete');
    const timeMs = Date.now() - startTime;
    const accuracy = Math.round((correctAnswers / TOTAL_ROUNDS) * 100);

    const gameScore: GameScore = {
      gameType: 'color_swap',
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
    console.log('[ColorSwap] Starting game - Level', level);
    setGamePhase('playing');
    setScore(0);
    setRound(0);
    setCorrectAnswers(0);
  };

  const handleAnswer = (colorName: string) => {
    if (feedback) return;

    const isCorrect = colorName === correctAnswer;

    if (isCorrect) {
      setCorrectAnswers(prev => prev + 1);
      setScore(prev => prev + (12 * level));
      setFeedback('correct');
    } else {
      setFeedback('wrong');
    }

    setTimeout(() => {
      setRound(prev => prev + 1);
    }, 800);
  };

  if (gamePhase === 'instructions') {
    return (
      <div className="color_swap-game">
        <div className="game-instructions">
          <button className="exit-btn" onClick={onExit}>✕</button>
          <h2>🎨 Color Swap</h2>
          <p className="game-subtitle">Level {level}</p>
          <div className="instructions-content">
            <p>👁️ See a word displayed in color</p>
            <p>🧠 Answer based on the question:</p>
            <p>📝 &quot;What WORD?&quot; - select the word you read</p>
            <p>🎨 &quot;What COLOR?&quot; - select the color you see</p>
            <p>⚡ Test your focus and avoid distractions!</p>
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
      <div className="color_swap-game">
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
    <div className="color_swap-game">
      <div className="game-header">
        <button className="exit-btn" onClick={onExit}>✕</button>
        <div className="game-info">
          <span>Level {level}</span>
          <span>Round {round + 1}/{TOTAL_ROUNDS}</span>
          <span>Score: {score}</span>
        </div>
      </div>
      <div className="game-arena">
        <div className="question-text">
          {questionType === 'word' ? 'What WORD do you see?' : 'What COLOR do you see?'}
        </div>

        <div className="color-word-display" style={{ color: wordColor }}>
          {wordText}
        </div>

        {feedback && (
          <div className={`feedback ${feedback}`}>
            {feedback === 'correct' ? '✓ Correct!' : '✗ Wrong!'}
          </div>
        )}

        {!feedback && (
          <div className="color-options">
            {COLORS.map((color) => (
              <button
                key={color.name}
                className={`color-option color-btn-${color.name.toLowerCase()}`}
                onClick={() => handleAnswer(color.name)}
              >
                {color.name}
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

export default ColorSwap;
