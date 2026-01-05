import React, { useState } from 'react';
import { saveGameScoreWithSync as saveGameScore } from '../lib/indexedDB';
import { GameScore } from './types';
import './SequenceBuilder.css';

interface SequenceBuilderProps {
  onGameComplete: (score: GameScore) => void;
  onExit: () => void;
}

const EMOJIS = ['🔴', '🔵', '🟢', '🟡', '🟣', '🟠', '⚪', '⚫'];

const SequenceBuilder: React.FC<SequenceBuilderProps> = ({ onGameComplete, onExit }) => {
  const [level, setLevel] = useState(1);
  const [score, setScore] = useState(0);
  const [sequence, setSequence] = useState<string[]>([]);
  const [userSequence, setUserSequence] = useState<string[]>([]);
  const [showSequence, setShowSequence] = useState(true);
  const [gamePhase, setGamePhase] = useState<'instructions' | 'memorize' | 'input' | 'complete'>('instructions');
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [startTime] = useState(Date.now());
  
  const sequenceLength = Math.min(3 + level, 10);
  const TOTAL_ROUNDS = 5;
  const [round, setRound] = useState(0);

  const generateSequence = () => {
    const seq = [];
    for (let i = 0; i < sequenceLength; i++) {
      seq.push(EMOJIS[Math.floor(Math.random() * EMOJIS.length)]);
    }
    return seq;
  };

  const startRound = () => {
    const newSeq = generateSequence();
    setSequence(newSeq);
    setUserSequence([]);
    setShowSequence(true);
    setGamePhase('memorize');

    setTimeout(() => {
      setShowSequence(false);
      setGamePhase('input');
    }, sequenceLength * 800 + 1000);
  };

  const handleInput = (emoji: string) => {
    const newUserSeq = [...userSequence, emoji];
    setUserSequence(newUserSeq);

    if (newUserSeq.length === sequence.length) {
      checkAnswer(newUserSeq);
    }
  };

  const checkAnswer = (userSeq: string[]) => {
    const isCorrect = userSeq.every((val, idx) => val === sequence[idx]);
    
    if (isCorrect) {
      setCorrectAnswers(prev => prev + 1);
      setScore(prev => prev + (20 * level));
    }

    setTimeout(() => {
      if (round + 1 < TOTAL_ROUNDS) {
        setRound(prev => prev + 1);
        startRound();
      } else {
        completeGame();
      }
    }, 1500);
  };

  const completeGame = async () => {
    setGamePhase('complete');
    const timeMs = Date.now() - startTime;
    const accuracy = Math.round((correctAnswers / TOTAL_ROUNDS) * 100);

    const gameScore: GameScore = {
      gameType: 'sequence_builder',
      score,
      accuracy,
      timeMs,
      level,
      timestamp: Date.now(),
    };

    await saveGameScore(gameScore);
    onGameComplete(gameScore);
  };

  if (gamePhase === 'instructions') {
    return (
      <div className="sequence-builder-game">
        <div className="game-instructions">
          <button className="exit-btn" onClick={onExit}>✕</button>
          <h2>🔢 Sequence Builder</h2>
          <p className="game-subtitle">Level {level}</p>
          <div className="instructions-content">
            <p>👀 Watch the sequence carefully</p>
            <p>🧠 Remember the order</p>
            <p>🎯 Recreate the sequence</p>
            <p>📊 Sequence length: {sequenceLength}</p>
          </div>
          <button className="start-btn" onClick={() => { setRound(0); startRound(); }}>Start Level {level}</button>
        </div>
      </div>
    );
  }

  if (gamePhase === 'complete') {
    const accuracy = Math.round((correctAnswers / TOTAL_ROUNDS) * 100);
    return (
      <div className="sequence-builder-game">
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
          </div>
          <div className="action-buttons">
            <button className="next-level-btn" onClick={() => { setLevel(prev => prev + 1); setScore(0); setCorrectAnswers(0); setGamePhase('instructions'); }}>Next Level →</button>
            <button className="menu-btn" onClick={onExit}>Main Menu</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sequence-builder-game">
      <div className="game-header">
        <button className="exit-btn" onClick={onExit}>✕</button>
        <div className="game-info">
          <span>Level {level}</span>
          <span>Round {round + 1}/{TOTAL_ROUNDS}</span>
          <span>Score: {score}</span>
        </div>
      </div>

      <div className="game-arena">
        {showSequence ? (
          <div className="sequence-display">
            <p className="instruction">Memorize this sequence:</p>
            <div className="sequence-items">
              {sequence.map((emoji, idx) => (
                <div key={idx} className="sequence-item" style={{ animationDelay: `${idx * 0.2}s` }}>
                  {emoji}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="input-area">
            <p className="instruction">Recreate the sequence:</p>
            <div className="user-sequence">
              {userSequence.map((emoji, idx) => (
                <div key={idx} className="user-item">{emoji}</div>
              ))}
              {Array(sequence.length - userSequence.length).fill(null).map((_, idx) => (
                <div key={`empty-${idx}`} className="empty-slot">?</div>
              ))}
            </div>
            <div className="emoji-options">
              {EMOJIS.map((emoji, idx) => (
                <button key={idx} className="emoji-btn" onClick={() => handleInput(emoji)}>
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SequenceBuilder;
