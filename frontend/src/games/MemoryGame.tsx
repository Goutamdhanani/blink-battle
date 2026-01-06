import React, { useState, useEffect } from 'react';
import { saveGameScoreWithSync as saveGameScore } from '../lib/indexedDB';
import { GameScore, MemoryCard } from './types';
import { createTouchHandler } from '../lib/touchUtils';
import './MemoryGame.css';

const EMOJI_SETS = [
  ['🎮', '🎯', '🎲', '🎨', '🎭', '🎪', '🎸', '🎺'],
  ['🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍒'],
  ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼'],
  ['⚡', '🔥', '💧', '🌟', '💫', '✨', '🌈', '☀️'],
];

interface MemoryGameProps {
  onGameComplete: (score: GameScore) => void;
  onExit: () => void;
}

const MemoryGame: React.FC<MemoryGameProps> = ({ onGameComplete, onExit }) => {
  const [level, setLevel] = useState(1);
  const [cards, setCards] = useState<MemoryCard[]>([]);
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
  const [matchedIndices, setMatchedIndices] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [startTime, setStartTime] = useState(Date.now());
  const [isGameComplete, setIsGameComplete] = useState(false);
  const [canFlip, setCanFlip] = useState(true);

  useEffect(() => {
    initializeGame(level);
  }, [level]);

  useEffect(() => {
    if (flippedIndices.length === 2) {
      setCanFlip(false);
      const [first, second] = flippedIndices;
      
      if (cards[first].symbol === cards[second].symbol) {
        // Match found
        setMatchedIndices(prev => [...prev, first, second]);
        setFlippedIndices([]);
        setCanFlip(true);
      } else {
        // No match, flip back after delay
        setTimeout(() => {
          setFlippedIndices([]);
          setCanFlip(true);
        }, 1000);
      }
    }
  }, [flippedIndices, cards]);

  useEffect(() => {
    if (matchedIndices.length > 0 && matchedIndices.length === cards.length) {
      completeGame();
    }
  }, [matchedIndices, cards.length]);

  const initializeGame = (currentLevel: number) => {
    const pairCount = Math.min(4 + currentLevel, 8);
    const emojiSet = EMOJI_SETS[(currentLevel - 1) % EMOJI_SETS.length];
    const symbols = emojiSet.slice(0, pairCount);
    
    const cardPairs = [...symbols, ...symbols];
    const shuffled = cardPairs
      .map((symbol, index) => ({ symbol, index }))
      .sort(() => Math.random() - 0.5);

    const newCards: MemoryCard[] = shuffled.map((item, id) => ({
      id,
      symbol: item.symbol,
      isFlipped: false,
      isMatched: false,
    }));

    setCards(newCards);
    setFlippedIndices([]);
    setMatchedIndices([]);
    setMoves(0);
    setStartTime(Date.now());
    setIsGameComplete(false);
    setCanFlip(true);
  };

  const handleCardClick = (index: number) => {
    if (!canFlip || flippedIndices.includes(index) || matchedIndices.includes(index)) {
      return;
    }

    const newFlipped = [...flippedIndices, index];
    setFlippedIndices(newFlipped);
    
    if (newFlipped.length === 2) {
      setMoves(prev => prev + 1);
    }
  };

  const completeGame = async () => {
    setIsGameComplete(true);
    const timeMs = Date.now() - startTime;
    const totalPairs = cards.length / 2;
    const optimalMoves = totalPairs;
    const accuracy = Math.max(0, Math.min(100, Math.round((optimalMoves / Math.max(moves, 1)) * 100)));
    const score = Math.round((accuracy * level * 10) + (totalPairs * 100) - (timeMs / 100));

    const gameScore: GameScore = {
      gameType: 'memory',
      score: Math.max(0, score),
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
  };

  const handleRestart = () => {
    initializeGame(level);
  };

  const isFlipped = (index: number) => {
    return flippedIndices.includes(index) || matchedIndices.includes(index);
  };

  const isMatched = (index: number) => {
    return matchedIndices.includes(index);
  };

  // Create touch handlers for better mobile support
  const exitHandler = createTouchHandler(() => {
    console.log('[MemoryGame] Exiting game');
    onExit();
  });

  const createCardHandler = (index: number) => createTouchHandler(() => {
    console.log('[MemoryGame] Card clicked:', index);
    handleCardClick(index);
  });

  const nextLevelHandler = createTouchHandler(() => {
    console.log('[MemoryGame] Next level');
    handleNextLevel();
  });

  const restartHandler = createTouchHandler(() => {
    console.log('[MemoryGame] Restart level');
    handleRestart();
  });

  const gridCols = cards.length <= 8 ? 4 : cards.length <= 12 ? 4 : 4;

  return (
    <div className="memory-game">
      <div className="game-header">
        <button className="exit-btn" {...exitHandler}>← Exit</button>
        <div className="game-info">
          <span className="level-badge">Level {level}</span>
          <span className="moves-counter">Moves: {moves}</span>
        </div>
      </div>

      {!isGameComplete ? (
        <div className="cards-grid" style={{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }}>
          {cards.map((card, index) => (
            <div
              key={card.id}
              className={`memory-card ${isFlipped(index) ? 'flipped' : ''} ${isMatched(index) ? 'matched' : ''}`}
              {...createCardHandler(index)}
            >
              <div className="card-inner">
                <div className="card-front">?</div>
                <div className="card-back">{card.symbol}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="game-complete">
          <h2>🎉 Level Complete!</h2>
          <div className="completion-stats">
            <p>Moves: {moves}</p>
            <p>Time: {((Date.now() - startTime) / 1000).toFixed(1)}s</p>
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

export default MemoryGame;
