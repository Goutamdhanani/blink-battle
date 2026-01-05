import React, { useState, useEffect } from 'react';
import { saveGameScoreWithSync as saveGameScore } from '../lib/indexedDB';
import { GameScore } from './types';
import './PathMemory.css';

interface PathMemoryProps {
  onGameComplete: (score: GameScore) => void;
  onExit: () => void;
}

const PathMemory: React.FC<PathMemoryProps> = ({ onGameComplete, onExit }) => {
  const [level, setLevel] = useState(1);
  const [score, setScore] = useState(0);
  const [gamePhase, setGamePhase] = useState<'instructions' | 'memorize' | 'recall' | 'complete'>('instructions');
  const [startTime] = useState(Date.now());
  const [round, setRound] = useState(0);
  const [path, setPath] = useState<number[]>([]);
  const [userPath, setUserPath] = useState<number[]>([]);
  const [showingPath, setShowingPath] = useState(false);
  const [currentPathIndex, setCurrentPathIndex] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  
  const TOTAL_ROUNDS = 8;
  const gridSize = 4; // 4x4 grid
  const pathLength = Math.min(3 + level, 8);
  const PATH_STEP_DELAY = 800;

  useEffect(() => {
    if (gamePhase === 'memorize' && showingPath) {
      const timer = setTimeout(() => {
        if (currentPathIndex < path.length - 1) {
          setCurrentPathIndex(prev => prev + 1);
        } else {
          setShowingPath(false);
          setGamePhase('recall');
        }
      }, PATH_STEP_DELAY);
      return () => clearTimeout(timer);
    }
  }, [currentPathIndex, showingPath, path, gamePhase]);

  const generatePath = () => {
    const newPath: number[] = [];
    const used = new Set<number>();
    
    while (newPath.length < pathLength) {
      const cell = Math.floor(Math.random() * (gridSize * gridSize));
      if (!used.has(cell)) {
        used.add(cell);
        newPath.push(cell);
      }
    }
    
    return newPath;
  };

  const startRound = () => {
    const newPath = generatePath();
    setPath(newPath);
    setUserPath([]);
    setCurrentPathIndex(0);
    setShowingPath(true);
    setFeedback(null);
    setGamePhase('memorize');
  };

  const completeGame = async () => {
    setGamePhase('complete');
    const timeMs = Date.now() - startTime;
    const accuracy = Math.round((correctAnswers / TOTAL_ROUNDS) * 100);

    const gameScore: GameScore = {
      gameType: 'path_memory',
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
    setScore(0);
    setRound(0);
    setCorrectAnswers(0);
    startRound();
  };

  const handleCellClick = (cellIndex: number) => {
    if (gamePhase !== 'recall' || feedback) return;

    const newUserPath = [...userPath, cellIndex];
    setUserPath(newUserPath);

    // Check if the path is correct so far
    const isCorrectSoFar = newUserPath.every((cell, idx) => cell === path[idx]);
    
    if (!isCorrectSoFar) {
      setFeedback('wrong');
      setTimeout(() => {
        if (round + 1 < TOTAL_ROUNDS) {
          setRound(prev => prev + 1);
          startRound();
        } else {
          completeGame();
        }
      }, 1500);
    } else if (newUserPath.length === path.length) {
      setCorrectAnswers(prev => prev + 1);
      setScore(prev => prev + (20 * level));
      setFeedback('correct');
      setTimeout(() => {
        if (round + 1 < TOTAL_ROUNDS) {
          setRound(prev => prev + 1);
          startRound();
        } else {
          completeGame();
        }
      }, 1500);
    }
  };

  if (gamePhase === 'instructions') {
    return (
      <div className="path_memory-game">
        <div className="game-instructions">
          <button className="exit-btn" onClick={onExit}>✕</button>
          <h2>🗺️ Path Memory</h2>
          <p className="game-subtitle">Level {level}</p>
          <div className="instructions-content">
            <p>👀 Watch the path light up on the grid</p>
            <p>🧠 Memorize the sequence</p>
            <p>🎯 Recreate the path in the same order</p>
            <p>📊 Path length: {pathLength} cells</p>
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
      <div className="path_memory-game">
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
    <div className="path_memory-game">
      <div className="game-header">
        <button className="exit-btn" onClick={onExit}>✕</button>
        <div className="game-info">
          <span>Level {level}</span>
          <span>Round {round + 1}/{TOTAL_ROUNDS}</span>
          <span>Score: {score}</span>
        </div>
      </div>
      <div className="game-arena">
        <div className="instruction-text">
          {gamePhase === 'memorize' ? 'Watch the path...' : 'Recreate the path!'}
        </div>

        <div className="grid-container">
          {Array.from({ length: gridSize * gridSize }).map((_, index) => {
            const isInPath = showingPath && path.slice(0, currentPathIndex + 1).includes(index);
            const isUserSelected = userPath.includes(index);
            const pathOrder = path.indexOf(index);
            
            return (
              <div
                key={index}
                className={`grid-cell ${isInPath ? 'highlighted' : ''} ${isUserSelected ? 'selected' : ''}`}
                onClick={() => handleCellClick(index)}
              >
                {showingPath && isInPath && (
                  <span className="path-number">{pathOrder + 1}</span>
                )}
              </div>
            );
          })}
        </div>

        {feedback && (
          <div className={`feedback ${feedback}`}>
            {feedback === 'correct' ? '✓ Perfect!' : '✗ Wrong sequence!'}
          </div>
        )}

        <div className="path-progress">
          {gamePhase === 'recall' && `${userPath.length} / ${path.length}`}
        </div>
      </div>
    </div>
  );
};

export default PathMemory;
