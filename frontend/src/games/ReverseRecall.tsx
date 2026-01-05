import React, { useState, useEffect } from 'react';
import { saveGameScoreWithSync as saveGameScore } from '../lib/indexedDB';
import { GameScore } from './types';
import './ReverseRecall.css';

interface ReverseRecallProps {
  onGameComplete: (score: GameScore) => void;
  onExit: () => void;
}

const ITEMS = ['🔴', '🔵', '🟢', '🟡', '🟣', '🟠', '⚪', '⚫', '🟤'];

const ReverseRecall: React.FC<ReverseRecallProps> = ({ onGameComplete, onExit }) => {
  const [level, setLevel] = useState(1);
  const [score, setScore] = useState(0);
  const [gamePhase, setGamePhase] = useState<'instructions' | 'memorize' | 'recall' | 'complete'>('instructions');
  const [startTime] = useState(Date.now());
  const [round, setRound] = useState(0);
  const [sequence, setSequence] = useState<string[]>([]);
  const [userSequence, setUserSequence] = useState<string[]>([]);
  const [showSequence, setShowSequence] = useState(false);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  
  const TOTAL_ROUNDS = 8;
  const sequenceLength = Math.min(3 + level, 8);

  useEffect(() => {
    if (gamePhase === 'memorize' && round < TOTAL_ROUNDS) {
      generateSequence();
    } else if (round >= TOTAL_ROUNDS && gamePhase === 'memorize') {
      completeGame();
    }
  }, [round, gamePhase]);

  const generateSequence = () => {
    const newSeq: string[] = [];
    for (let i = 0; i < sequenceLength; i++) {
      newSeq.push(ITEMS[Math.floor(Math.random() * ITEMS.length)]);
    }
    setSequence(newSeq);
    setUserSequence([]);
    setShowSequence(true);
    setFeedback(null);

    setTimeout(() => {
      setShowSequence(false);
      setGamePhase('recall');
    }, sequenceLength * 700 + 1000);
  };

  const completeGame = async () => {
    setGamePhase('complete');
    const timeMs = Date.now() - startTime;
    const accuracy = Math.round((correctAnswers / TOTAL_ROUNDS) * 100);

    const gameScore: GameScore = {
      gameType: 'reverse_recall',
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
    setGamePhase('memorize');
  };

  const handleItemClick = (item: string) => {
    if (feedback || gamePhase !== 'recall') return;

    const newUserSeq = [...userSequence, item];
    setUserSequence(newUserSeq);

    if (newUserSeq.length === sequence.length) {
      checkAnswer(newUserSeq);
    }
  };

  const checkAnswer = (userSeq: string[]) => {
    const reversedSequence = [...sequence].reverse();
    const isCorrect = userSeq.every((item, idx) => item === reversedSequence[idx]);
    
    if (isCorrect) {
      setCorrectAnswers(prev => prev + 1);
      setScore(prev => prev + (20 * level));
      setFeedback('correct');
    } else {
      setFeedback('wrong');
    }

    setTimeout(() => {
      setRound(prev => prev + 1);
      setGamePhase('memorize');
    }, 1500);
  };

  if (gamePhase === 'instructions') {
    return (
      <div className="reverse_recall-game">
        <div className="game-instructions">
          <button className="exit-btn" onClick={onExit}>✕</button>
          <h2>⏮️ Reverse Recall</h2>
          <p className="game-subtitle">Level {level}</p>
          <div className="instructions-content">
            <p>👀 Watch the sequence carefully</p>
            <p>🔄 Recall it in REVERSE order</p>
            <p>🧠 Challenge your working memory</p>
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
      <div className="reverse_recall-game">
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

  if (gamePhase === 'memorize') {
    return (
      <div className="reverse_recall-game">
        <div className="game-header">
          <button className="exit-btn" onClick={onExit}>✕</button>
          <div className="game-info">
            <span>Level {level}</span>
            <span>Round {round + 1}/{TOTAL_ROUNDS}</span>
            <span>Score: {score}</span>
          </div>
        </div>
        <div className="game-arena">
          <div className="instruction-text">Memorize this sequence:</div>
          {showSequence && (
            <div className="sequence-display">
              {sequence.map((item, idx) => (
                <div key={idx} className="sequence-item" style={{ animationDelay: `${idx * 0.15}s` }}>
                  {item}
                </div>
              ))}
            </div>
          )}
          {!showSequence && (
            <div className="loading-text">Get ready to recall...</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="reverse_recall-game">
      <div className="game-header">
        <button className="exit-btn" onClick={onExit}>✕</button>
        <div className="game-info">
          <span>Level {level}</span>
          <span>Round {round + 1}/{TOTAL_ROUNDS}</span>
          <span>Score: {score}</span>
        </div>
      </div>
      <div className="game-arena">
        <div className="instruction-text">Tap in REVERSE order:</div>
        
        <div className="user-sequence">
          {userSequence.map((item, idx) => (
            <div key={idx} className="user-item">{item}</div>
          ))}
          {Array(sequence.length - userSequence.length).fill(null).map((_, idx) => (
            <div key={`empty-${idx}`} className="empty-slot">?</div>
          ))}
        </div>

        {feedback && (
          <div className={`feedback ${feedback}`}>
            {feedback === 'correct' ? '✓ Perfect reverse!' : '✗ Wrong order!'}
          </div>
        )}

        {!feedback && (
          <div className="item-options">
            {ITEMS.map((item, idx) => (
              <button
                key={idx}
                className="item-btn"
                onClick={() => handleItemClick(item)}
              >
                {item}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReverseRecall;
