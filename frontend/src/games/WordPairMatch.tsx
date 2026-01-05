import React, { useState } from 'react';
import { saveGameScoreWithSync as saveGameScore } from '../lib/indexedDB';
import { GameScore } from './types';
import './WordPairMatch.css';

interface WordPairMatchProps {
  onGameComplete: (score: GameScore) => void;
  onExit: () => void;
}

const WordPairMatch: React.FC<WordPairMatchProps> = ({ onGameComplete, onExit }) => {
  const [level, setLevel] = useState(1);
  const [score, setScore] = useState(0);
  const [gamePhase, setGamePhase] = useState<'instructions' | 'playing' | 'complete'>('instructions');
  const [startTime] = useState(Date.now());
  const [round, setRound] = useState(0);
  const TOTAL_ROUNDS = 10;

  const completeGame = async () => {
    setGamePhase('complete');
    const timeMs = Date.now() - startTime;
    const accuracy = Math.round(Math.random() * 30 + 70);

    const gameScore: GameScore = {
      gameType: 'word_pair_match',
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
    // Simulate gameplay
    const interval = setInterval(() => {
      setRound(prev => {
        if (prev >= TOTAL_ROUNDS - 1) {
          clearInterval(interval);
          setTimeout(completeGame, 500);
          return prev;
        }
        setScore(s => s + (10 * level));
        return prev + 1;
      });
    }, 800);
  };

  if (gamePhase === 'instructions') {
    return (
      <div className="word_pair_match-game">
        <div className="game-instructions">
          <button className="exit-btn" onClick={onExit}>✕</button>
          <h2>📝 Word Pair Match</h2>
          <p className="game-subtitle">Level {level}</p>
          <div className="instructions-content">
            <p>🎮 Challenge your cognitive abilities</p>
            <p>🧠 Improve your brain skills</p>
            <p>📈 Track your progress</p>
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
    return (
      <div className="word_pair_match-game">
        <div className="game-complete">
          <h2>🎉 Level {level} Complete!</h2>
          <div className="final-stats">
            <div className="stat-item">
              <div className="stat-value">{score}</div>
              <div className="stat-label">Score</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{TOTAL_ROUNDS}</div>
              <div className="stat-label">Rounds</div>
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
    <div className="word_pair_match-game">
      <div className="game-header">
        <button className="exit-btn" onClick={onExit}>✕</button>
        <div className="game-info">
          <span>Level {level}</span>
          <span>Round {round + 1}/{TOTAL_ROUNDS}</span>
          <span>Score: {score}</span>
        </div>
      </div>
      <div className="game-arena">
        <div className="game-content">
          <h3>Playing WordPairMatch...</h3>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${(round / TOTAL_ROUNDS) * 100}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default WordPairMatch;
