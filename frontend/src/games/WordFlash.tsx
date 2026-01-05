import React, { useState, useEffect } from 'react';
import { saveGameScore } from '../lib/indexedDB';
import { GameScore } from './types';
import './WordFlash.css';

interface WordFlashProps {
  onGameComplete: (score: GameScore) => void;
  onExit: () => void;
}

const WORD_CATEGORIES = {
  animals: ['cat', 'dog', 'elephant', 'tiger', 'lion', 'bear', 'wolf', 'fox', 'deer', 'rabbit'],
  colors: ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'brown', 'black', 'white'],
  fruits: ['apple', 'banana', 'orange', 'grape', 'mango', 'peach', 'pear', 'cherry', 'kiwi', 'plum'],
  countries: ['usa', 'canada', 'mexico', 'brazil', 'france', 'germany', 'italy', 'spain', 'japan', 'china'],
};

const WordFlash: React.FC<WordFlashProps> = ({ onGameComplete, onExit }) => {
  const [level, setLevel] = useState(1);
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(0);
  const [currentWord, setCurrentWord] = useState('');
  const [targetCategory, setTargetCategory] = useState('');
  const [showWord, setShowWord] = useState(false);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [wrongAnswers, setWrongAnswers] = useState(0);
  const [startTime] = useState(Date.now());
  const [gamePhase, setGamePhase] = useState<'instructions' | 'ready' | 'playing' | 'complete'>('instructions');
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);

  const TOTAL_ROUNDS = 10;
  const FLASH_DURATION = Math.max(500, 1500 - level * 100); // Gets faster with level

  useEffect(() => {
    if (gamePhase === 'playing' && round < TOTAL_ROUNDS) {
      presentNextWord();
    } else if (round >= TOTAL_ROUNDS && gamePhase === 'playing') {
      completeGame();
    }
  }, [round, gamePhase]);

  const presentNextWord() => {
    // Select random category
    const categories = Object.keys(WORD_CATEGORIES) as Array<keyof typeof WORD_CATEGORIES>;
    const randomCategory = categories[Math.floor(Math.random() * categories.length)];
    setTargetCategory(randomCategory);

    // Select random word from a category (might match or not)
    const shouldMatch = Math.random() > 0.5;
    let selectedWord: string;

    if (shouldMatch) {
      const words = WORD_CATEGORIES[randomCategory];
      selectedWord = words[Math.floor(Math.random() * words.length)];
    } else {
      // Pick from a different category
      const otherCategories = categories.filter(c => c !== randomCategory);
      const otherCategory = otherCategories[Math.floor(Math.random() * otherCategories.length)];
      const words = WORD_CATEGORIES[otherCategory];
      selectedWord = words[Math.floor(Math.random() * words.length)];
    }

    setCurrentWord(selectedWord);
    setShowWord(true);
    setFeedback(null);

    // Hide word after flash duration
    setTimeout(() => {
      setShowWord(false);
    }, FLASH_DURATION);
  };

  const handleAnswer = (isMatch: boolean) => {
    if (showWord || feedback) return; // Prevent clicking during flash or after answering

    const categories = Object.keys(WORD_CATEGORIES) as Array<keyof typeof WORD_CATEGORIES>;
    const correctCategory = categories.find(cat => 
      WORD_CATEGORIES[cat].includes(currentWord.toLowerCase())
    );

    const isCorrect = (correctCategory === targetCategory) === isMatch;

    if (isCorrect) {
      setCorrectAnswers(prev => prev + 1);
      setScore(prev => prev + (10 * level));
      setFeedback('correct');
    } else {
      setWrongAnswers(prev => prev + 1);
      setFeedback('wrong');
    }

    setTimeout(() => {
      setRound(prev => prev + 1);
      setFeedback(null);
    }, 800);
  };

  const completeGame = async () => {
    setGamePhase('complete');
    const timeMs = Date.now() - startTime;
    const accuracy = Math.round((correctAnswers / TOTAL_ROUNDS) * 100);

    const gameScore: GameScore = {
      gameType: 'word_flash',
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
    setScore(0);
    setCorrectAnswers(0);
    setWrongAnswers(0);
  };

  const nextLevel = () => {
    setLevel(prev => prev + 1);
    setGamePhase('instructions');
  };

  if (gamePhase === 'instructions') {
    return (
      <div className="word-flash-game">
        <div className="game-instructions">
          <button className="exit-btn" onClick={onExit}>✕</button>
          <h2>⚡ Word Flash</h2>
          <p className="game-subtitle">Level {level}</p>
          <div className="instructions-content">
            <p>🎯 Words will flash briefly on screen</p>
            <p>📝 Remember the category shown at the top</p>
            <p>✅ Decide if the word matches that category</p>
            <p>⏱️ Flash duration: {FLASH_DURATION}ms</p>
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
      <div className="word-flash-game">
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
            <button className="next-level-btn" onClick={nextLevel}>
              Next Level →
            </button>
            <button className="menu-btn" onClick={onExit}>
              Main Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="word-flash-game">
      <div className="game-header">
        <button className="exit-btn" onClick={onExit}>✕</button>
        <div className="game-info">
          <span>Level {level}</span>
          <span>Round {round + 1}/{TOTAL_ROUNDS}</span>
          <span>Score: {score}</span>
        </div>
      </div>

      <div className="game-arena">
        <div className="category-display">
          Category: <strong>{targetCategory.toUpperCase()}</strong>
        </div>

        <div className={`word-display ${showWord ? 'visible' : 'hidden'} ${feedback || ''}`}>
          {showWord ? currentWord.toUpperCase() : '?'}
        </div>

        {!showWord && !feedback && (
          <div className="answer-buttons">
            <button 
              className="answer-btn match-btn"
              onClick={() => handleAnswer(true)}
            >
              ✓ MATCH
            </button>
            <button 
              className="answer-btn no-match-btn"
              onClick={() => handleAnswer(false)}
            >
              ✗ NO MATCH
            </button>
          </div>
        )}

        {feedback && (
          <div className={`feedback ${feedback}`}>
            {feedback === 'correct' ? '✓ Correct!' : '✗ Wrong!'}
          </div>
        )}

        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${((round) / TOTAL_ROUNDS) * 100}%` }}
          />
        </div>

        <div className="score-tracker">
          <span className="correct">✓ {correctAnswers}</span>
          <span className="wrong">✗ {wrongAnswers}</span>
        </div>
      </div>
    </div>
  );
};

export default WordFlash;
