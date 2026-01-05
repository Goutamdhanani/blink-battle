import React, { useState, useEffect, useRef } from 'react';
import { saveGameScoreWithSync as saveGameScore } from '../lib/indexedDB';
import { GameScore, ReflexTrial } from './types';
import './ReflexGame.css';

interface ReflexGameProps {
  onGameComplete: (score: GameScore) => void;
  onExit: () => void;
}

const ReflexGame: React.FC<ReflexGameProps> = ({ onGameComplete, onExit }) => {
  const [level, setLevel] = useState(1);
  const [trials, setTrials] = useState<ReflexTrial[]>([]);
  const [currentTrial, setCurrentTrial] = useState(0);
  const [gameState, setGameState] = useState<'waiting' | 'ready' | 'go' | 'result'>('waiting');
  const [startTime, setStartTime] = useState(Date.now());
  const [greenLightTime, setGreenLightTime] = useState(0);
  const [reactionTime, setReactionTime] = useState<number | null>(null);
  const [isGameComplete, setIsGameComplete] = useState(false);
  const totalTrials = 5;
  const delayTimerRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (currentTrial < totalTrials && gameState === 'waiting') {
      startTrial();
    } else if (currentTrial >= totalTrials && !isGameComplete) {
      completeGame();
    }
  }, [currentTrial, gameState]);

  const startTrial = () => {
    setGameState('ready');
    setReactionTime(null);

    const delay = 2000 + Math.random() * 3000; // 2-5 seconds
    
    delayTimerRef.current = setTimeout(() => {
      const glTime = Date.now();
      setGreenLightTime(glTime);
      setGameState('go');
    }, delay);
  };

  const handleTap = () => {
    const tapTime = Date.now();

    if (gameState === 'ready') {
      // False start
      if (delayTimerRef.current) {
        clearTimeout(delayTimerRef.current);
      }

      const trial: ReflexTrial = {
        trialNumber: currentTrial + 1,
        delayMs: 0,
        reactionMs: undefined,
        isFalseStart: true,
        timestamp: tapTime,
      };

      setTrials(prev => [...prev, trial]);
      setGameState('result');
      setReactionTime(-1); // Indicate false start

      setTimeout(() => {
        setCurrentTrial(prev => prev + 1);
        setGameState('waiting');
      }, 1500);

    } else if (gameState === 'go') {
      const reaction = tapTime - greenLightTime;
      setReactionTime(reaction);
      setGameState('result');

      const trial: ReflexTrial = {
        trialNumber: currentTrial + 1,
        delayMs: greenLightTime - startTime,
        reactionMs: reaction,
        isFalseStart: false,
        timestamp: tapTime,
      };

      setTrials(prev => [...prev, trial]);

      setTimeout(() => {
        setCurrentTrial(prev => prev + 1);
        setGameState('waiting');
      }, 1500);
    }
  };

  const completeGame = async () => {
    setIsGameComplete(true);
    
    const validTrials = trials.filter(t => !t.isFalseStart && t.reactionMs);
    const avgReaction = validTrials.length > 0
      ? validTrials.reduce((sum, t) => sum + (t.reactionMs || 0), 0) / validTrials.length
      : 0;

    const accuracy = Math.round((validTrials.length / totalTrials) * 100);
    const score = Math.max(0, Math.round(
      (validTrials.length * 1000) - avgReaction + (level * 500)
    ));

    const gameScore: GameScore = {
      gameType: 'reflex',
      score,
      accuracy,
      timeMs: Math.round(avgReaction),
      level,
      timestamp: Date.now(),
    };

    await saveGameScore(gameScore);
    onGameComplete(gameScore);
  };

  const handleNextLevel = () => {
    setLevel(prev => prev + 1);
    setTrials([]);
    setCurrentTrial(0);
    setGameState('waiting');
    setIsGameComplete(false);
    setStartTime(Date.now());
  };

  const handleRestart = () => {
    setTrials([]);
    setCurrentTrial(0);
    setGameState('waiting');
    setIsGameComplete(false);
    setStartTime(Date.now());
  };

  const getBackgroundColor = () => {
    if (gameState === 'ready') return 'reflex-ready';
    if (gameState === 'go') return 'reflex-go';
    if (gameState === 'result' && reactionTime === -1) return 'reflex-false-start';
    return 'reflex-waiting';
  };

  const getDisplayText = () => {
    if (gameState === 'waiting') return 'Get Ready...';
    if (gameState === 'ready') return 'Wait for green...';
    if (gameState === 'go') return 'TAP NOW!';
    if (gameState === 'result') {
      if (reactionTime === -1) return '❌ Too Early!';
      return `⚡ ${reactionTime}ms`;
    }
    return '';
  };

  if (isGameComplete) {
    const validTrials = trials.filter(t => !t.isFalseStart && t.reactionMs);
    const avgReaction = validTrials.length > 0
      ? validTrials.reduce((sum, t) => sum + (t.reactionMs || 0), 0) / validTrials.length
      : 0;
    const bestReaction = validTrials.length > 0
      ? Math.min(...validTrials.map(t => t.reactionMs || Infinity))
      : 0;

    return (
      <div className="reflex-game">
        <div className="game-header">
          <button className="exit-btn" onClick={onExit}>← Exit</button>
          <span className="level-badge">Level {level}</span>
        </div>

        <div className="game-complete">
          <h2>⚡ Complete!</h2>
          <div className="completion-stats">
            <p>Valid Trials: {validTrials.length}/{totalTrials}</p>
            <p>Avg Reaction: {avgReaction.toFixed(0)}ms</p>
            <p>Best Reaction: {bestReaction === Infinity ? 'N/A' : `${bestReaction.toFixed(0)}ms`}</p>
          </div>
          <div className="trials-list">
            {trials.map(trial => (
              <div key={trial.trialNumber} className="trial-result">
                <span>Trial {trial.trialNumber}:</span>
                <span className={trial.isFalseStart ? 'false-start' : 'valid-time'}>
                  {trial.isFalseStart ? '❌ False Start' : `${trial.reactionMs}ms`}
                </span>
              </div>
            ))}
          </div>
          <div className="completion-actions">
            <button className="btn-primary" onClick={handleNextLevel}>
              Next Level →
            </button>
            <button className="btn-secondary" onClick={handleRestart}>
              Retry Level
            </button>
            <button className="btn-ghost" onClick={onExit}>
              Exit to Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="reflex-game">
      <div className="game-header">
        <button className="exit-btn" onClick={onExit}>← Exit</button>
        <div className="game-info">
          <span className="level-badge">Level {level}</span>
          <span className="trial-counter">Trial {currentTrial + 1}/{totalTrials}</span>
        </div>
      </div>

      <div className={`reflex-arena ${getBackgroundColor()}`} onClick={handleTap}>
        <div className="reflex-content">
          <div className="reflex-text">{getDisplayText()}</div>
          {gameState === 'waiting' && (
            <p className="reflex-instruction">Tap when you see green</p>
          )}
        </div>
      </div>

      <div className="trials-progress">
        {Array.from({ length: totalTrials }).map((_, index) => (
          <div
            key={index}
            className={`progress-dot ${index < currentTrial ? 'completed' : ''} ${index === currentTrial ? 'active' : ''}`}
          />
        ))}
      </div>
    </div>
  );
};

export default ReflexGame;
