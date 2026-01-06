import React, { useState, useEffect, useRef } from 'react';
import { saveGameScoreWithSync as saveGameScore } from '../lib/indexedDB';
import { GameScore, AttentionTarget } from './types';
import { createTouchHandler } from '../lib/touchUtils';
import './AttentionGame.css';

interface AttentionGameProps {
  onGameComplete: (score: GameScore) => void;
  onExit: () => void;
}

const AttentionGame: React.FC<AttentionGameProps> = ({ onGameComplete, onExit }) => {
  const [level, setLevel] = useState(1);
  const [targets, setTargets] = useState<AttentionTarget[]>([]);
  const [score, setScore] = useState(0);
  const [missed, setMissed] = useState(0);
  const [startTime] = useState(Date.now());
  const [isGameActive, setIsGameActive] = useState(false);
  const [isGameComplete, setIsGameComplete] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(30);
  const [countdown, setCountdown] = useState(3);
  const gameAreaRef = useRef<HTMLDivElement>(null);
  const targetIdRef = useRef(0);

  useEffect(() => {
    const countdownInterval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          setIsGameActive(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, []);

  useEffect(() => {
    if (!isGameActive || isGameComplete) return;

    const timerInterval = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          completeGame();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerInterval);
  }, [isGameActive, isGameComplete]);

  useEffect(() => {
    if (!isGameActive || isGameComplete) return;

    const spawnInterval = setInterval(() => {
      spawnTarget();
    }, Math.max(1000 - level * 100, 400));

    return () => clearInterval(spawnInterval);
  }, [isGameActive, isGameComplete, level]);

  const spawnTarget = () => {
    if (!gameAreaRef.current) return;

    const rect = gameAreaRef.current.getBoundingClientRect();
    const size = 60;
    const padding = 20;

    const x = Math.random() * (rect.width - size - padding * 2) + padding;
    const y = Math.random() * (rect.height - size - padding * 2) + padding;
    const isTarget = Math.random() > 0.3; // 70% targets, 30% distractors

    const newTarget: AttentionTarget = {
      id: targetIdRef.current++,
      x,
      y,
      isTarget,
      isClicked: false,
      appearTime: Date.now(),
    };

    setTargets(prev => [...prev, newTarget]);

    setTimeout(() => {
      setTargets(prev => prev.filter(t => {
        if (t.id === newTarget.id && !t.isClicked) {
          if (isTarget) {
            setMissed(m => m + 1);
          }
          return false;
        }
        return true;
      }));
    }, 2000 - level * 100);
  };

  const handleTargetClick = (target: AttentionTarget) => {
    if (target.isClicked) return;

    setTargets(prev => prev.map(t => 
      t.id === target.id ? { ...t, isClicked: true } : t
    ));

    if (target.isTarget) {
      setScore(s => s + 10);
    } else {
      setScore(s => Math.max(0, s - 5));
    }

    setTimeout(() => {
      setTargets(prev => prev.filter(t => t.id !== target.id));
    }, 200);
  };

  const completeGame = async () => {
    setIsGameComplete(true);
    setIsGameActive(false);
    const timeMs = Date.now() - startTime;
    const totalTargets = score / 10 + missed;
    const accuracy = totalTargets > 0 ? Math.round((score / 10 / totalTargets) * 100) : 0;
    const finalScore = Math.max(0, score + (level * 50));

    const gameScore: GameScore = {
      gameType: 'attention',
      score: finalScore,
      accuracy,
      timeMs,
      level,
      timestamp: Date.now(),
    };

    await saveGameScore(gameScore);
    onGameComplete(gameScore);
  };

  const handleNextLevel = () => {
    setLevel(prev => prev + 1);
    setScore(0);
    setMissed(0);
    setTargets([]);
    setTimeRemaining(30);
    setIsGameComplete(false);
    setCountdown(3);
  };

  const handleRestart = () => {
    setScore(0);
    setMissed(0);
    setTargets([]);
    setTimeRemaining(30);
    setIsGameComplete(false);
    setCountdown(3);
  };

  // Create touch handlers for better mobile support
  const exitHandler = createTouchHandler(() => {
    console.log('[AttentionGame] Exiting game');
    onExit();
  });

  const createTargetHandler = (target: AttentionTarget) => createTouchHandler(() => {
    console.log('[AttentionGame] Target clicked:', target.id);
    handleTargetClick(target);
  });

  const nextLevelHandler = createTouchHandler(() => {
    console.log('[AttentionGame] Next level');
    handleNextLevel();
  });

  const restartHandler = createTouchHandler(() => {
    console.log('[AttentionGame] Restart level');
    handleRestart();
  });

  return (
    <div className="attention-game">
      <div className="game-header">
        <button className="exit-btn" {...exitHandler}>← Exit</button>
        <div className="game-info">
          <span className="level-badge">Level {level}</span>
          <span className="score-display">Score: {score}</span>
        </div>
      </div>

      {countdown > 0 && !isGameComplete && (
        <div className="countdown-overlay">
          <div className="countdown-number">{countdown}</div>
          <p className="countdown-text">Get Ready!</p>
        </div>
      )}

      {!isGameComplete ? (
        <>
          <div className="game-stats-bar">
            <div className="stat-item">
              <span className="stat-icon">⏱️</span>
              <span className="stat-value">{timeRemaining}s</span>
            </div>
            <div className="stat-item">
              <span className="stat-icon">✅</span>
              <span className="stat-value">{score / 10}</span>
            </div>
            <div className="stat-item">
              <span className="stat-icon">❌</span>
              <span className="stat-value">{missed}</span>
            </div>
          </div>

          <div className="game-area" ref={gameAreaRef}>
            {!isGameActive && (
              <div className="game-instructions">
                <p className="instruction-text">
                  Focus and react quickly!
                </p>
              </div>
            )}

            {targets.map(target => (
              <div
                key={target.id}
                className={`attention-target ${target.isTarget ? 'target-valid' : 'target-distractor'} ${target.isClicked ? 'target-clicked' : ''}`}
                style={{
                  left: `${target.x}px`,
                  top: `${target.y}px`,
                }}
                {...createTargetHandler(target)}
              >
                {target.isTarget ? '🎯' : '🔴'}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="game-complete">
          <h2>🎉 Level Complete!</h2>
          <div className="completion-stats">
            <p>Score: {score}</p>
            <p>Hit: {score / 10} / {score / 10 + missed}</p>
            <p>Accuracy: {((score / 10) / Math.max(1, score / 10 + missed) * 100).toFixed(1)}%</p>
          </div>
          <div className="completion-actions">
            <button className="btn-primary" {...nextLevelHandler}>
              Next Level →
            </button>
            <button className="btn-secondary" {...restartHandler}>
              Retry Level
            </button>
            <button className="btn-ghost" {...exitHandler}>
              Exit to Menu
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AttentionGame;
