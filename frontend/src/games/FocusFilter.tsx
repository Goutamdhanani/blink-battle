import React, { useState, useEffect } from 'react';
import { saveGameScoreWithSync as saveGameScore } from '../lib/indexedDB';
import { GameScore } from './types';
import './FocusFilter.css';

interface FocusFilterProps {
  onGameComplete: (score: GameScore) => void;
  onExit: () => void;
}

interface Item {
  id: number;
  symbol: string;
  isTarget: boolean;
  x: number;
  y: number;
}

const FocusFilter: React.FC<FocusFilterProps> = ({ onGameComplete, onExit }) => {
  const [level, setLevel] = useState(1);
  const [score, setScore] = useState(0);
  const [gamePhase, setGamePhase] = useState<'instructions' | 'playing' | 'complete'>('instructions');
  const [startTime] = useState(Date.now());
  const [round, setRound] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [targetSymbol, setTargetSymbol] = useState('');
  const [targetCount, setTargetCount] = useState(0);
  const [foundCount, setFoundCount] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [wrongClicks, setWrongClicks] = useState(0);
  const [clickedIds, setClickedIds] = useState<Set<number>>(new Set());
  
  const TOTAL_ROUNDS = 10;
  const SYMBOLS = ['⭐', '🔵', '🔺', '💎', '🌙', '☀️', '❤️', '🔶'];
  const itemsPerRound = Math.min(10 + level * 2, 25);

  useEffect(() => {
    if (gamePhase === 'playing' && round < TOTAL_ROUNDS) {
      generateRound();
    } else if (round >= TOTAL_ROUNDS && gamePhase === 'playing') {
      completeGame();
    }
  }, [round, gamePhase]);

  const generateRound = () => {
    const target = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    const distractors = SYMBOLS.filter(s => s !== target);
    const targetsInRound = Math.floor(Math.random() * 3) + 2; // 2-4 targets
    
    const newItems: Item[] = [];
    for (let i = 0; i < itemsPerRound; i++) {
      const isTarget = i < targetsInRound;
      newItems.push({
        id: i,
        symbol: isTarget ? target : distractors[Math.floor(Math.random() * distractors.length)],
        isTarget,
        x: Math.random() * 85,
        y: Math.random() * 75,
      });
    }
    
    // Shuffle items
    newItems.sort(() => Math.random() - 0.5);
    
    setItems(newItems);
    setTargetSymbol(target);
    setTargetCount(targetsInRound);
    setFoundCount(0);
    setClickedIds(new Set());
  };

  const completeGame = async () => {
    setGamePhase('complete');
    const timeMs = Date.now() - startTime;
    const accuracy = Math.round((correctAnswers / TOTAL_ROUNDS) * 100);

    const gameScore: GameScore = {
      gameType: 'focus_filter',
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
    setWrongClicks(0);
  };

  const handleItemClick = (item: Item) => {
    if (clickedIds.has(item.id)) return;

    const newClickedIds = new Set(clickedIds);
    newClickedIds.add(item.id);
    setClickedIds(newClickedIds);

    if (item.isTarget) {
      const newFoundCount = foundCount + 1;
      setFoundCount(newFoundCount);
      setScore(prev => prev + (10 * level));

      if (newFoundCount >= targetCount) {
        setCorrectAnswers(prev => prev + 1);
        setTimeout(() => {
          setRound(prev => prev + 1);
        }, 800);
      }
    } else {
      setWrongClicks(prev => prev + 1);
    }
  };

  if (gamePhase === 'instructions') {
    return (
      <div className="focus_filter-game">
        <div className="game-instructions">
          <button className="exit-btn" onClick={onExit}>✕</button>
          <h2>🎯 Focus Filter</h2>
          <p className="game-subtitle">Level {level}</p>
          <div className="instructions-content">
            <p>👁️ Find all instances of the target symbol</p>
            <p>🎯 Tap only the target symbols</p>
            <p>🚫 Avoid clicking distractors</p>
            <p>⚡ Speed and accuracy both count!</p>
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
      <div className="focus_filter-game">
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
              <div className="stat-value">{wrongClicks}</div>
              <div className="stat-label">Mistakes</div>
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
    <div className="focus_filter-game">
      <div className="game-header">
        <button className="exit-btn" onClick={onExit}>✕</button>
        <div className="game-info">
          <span>Level {level}</span>
          <span>Round {round + 1}/{TOTAL_ROUNDS}</span>
          <span>Score: {score}</span>
        </div>
      </div>
      <div className="game-arena">
        <div className="target-display">
          Find all: <span className="target-symbol">{targetSymbol}</span>
          <span className="target-progress">({foundCount}/{targetCount})</span>
        </div>

        <div className="items-container">
          {items.map((item) => (
            <div
              key={item.id}
              className={`floating-item ${clickedIds.has(item.id) ? (item.isTarget ? 'clicked-correct' : 'clicked-wrong') : ''}`}
              style={{
                left: `${item.x}%`,
                top: `${item.y}%`,
              }}
              onClick={() => handleItemClick(item)}
            >
              {item.symbol}
            </div>
          ))}
        </div>

        <div className="stats-bar">
          <span className="found-count">Found: {foundCount}</span>
          <span className="wrong-count">Mistakes: {wrongClicks}</span>
        </div>
      </div>
    </div>
  );
};

export default FocusFilter;
