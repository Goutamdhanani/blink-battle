import React, { useState, useEffect } from 'react';
import { saveGameScoreWithSync as saveGameScore } from '../lib/indexedDB';
import { GameScore } from './types';
import './WordPairMatch.css';

interface WordPairMatchProps {
  onGameComplete: (score: GameScore) => void;
  onExit: () => void;
}

const WORD_PAIRS: Record<string, string> = {
  'Sun': 'Moon',
  'Hot': 'Cold',
  'Day': 'Night',
  'Up': 'Down',
  'Left': 'Right',
  'Fast': 'Slow',
  'Big': 'Small',
  'Young': 'Old',
  'Happy': 'Sad',
  'Good': 'Bad',
  'Start': 'End',
  'Love': 'Hate',
  'Win': 'Lose',
  'Buy': 'Sell',
  'Push': 'Pull',
};

const WordPairMatch: React.FC<WordPairMatchProps> = ({ onGameComplete, onExit }) => {
  const [level, setLevel] = useState(1);
  const [score, setScore] = useState(0);
  const [gamePhase, setGamePhase] = useState<'instructions' | 'memorize' | 'matching' | 'complete'>('instructions');
  const [startTime] = useState(Date.now());
  const [round, setRound] = useState(0);
  const [currentWord, setCurrentWord] = useState('');
  const [correctPair, setCorrectPair] = useState('');
  const [options, setOptions] = useState<string[]>([]);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [showPairs, setShowPairs] = useState(false);
  const [pairsToShow, setPairsToShow] = useState<[string, string][]>([]);
  
  const TOTAL_ROUNDS = 10;
  const pairsPerRound = Math.min(3 + Math.floor(level / 2), 6);

  useEffect(() => {
    if (gamePhase === 'memorize' && round < TOTAL_ROUNDS) {
      showPairsPhase();
    } else if (round >= TOTAL_ROUNDS && gamePhase === 'memorize') {
      completeGame();
    }
  }, [round, gamePhase]);

  const showPairsPhase = () => {
    const allPairs = Object.entries(WORD_PAIRS);
    const selectedPairs = allPairs
      .sort(() => Math.random() - 0.5)
      .slice(0, pairsPerRound);
    
    setPairsToShow(selectedPairs);
    setShowPairs(true);
    setFeedback(null);

    setTimeout(() => {
      setShowPairs(false);
      presentQuestion(selectedPairs);
    }, pairsPerRound * 1200 + 1500);
  };

  const presentQuestion = (pairs: [string, string][]) => {
    const [word, pair] = pairs[Math.floor(Math.random() * pairs.length)];
    const flip = Math.random() > 0.5;
    const questionWord = flip ? word : pair;
    const answer = flip ? pair : word;

    setCurrentWord(questionWord);
    setCorrectPair(answer);

    // Generate options
    const opts = [answer];
    const allWords = Object.entries(WORD_PAIRS).flat();
    while (opts.length < 4) {
      const randomWord = allWords[Math.floor(Math.random() * allWords.length)];
      if (!opts.includes(randomWord) && randomWord !== questionWord) {
        opts.push(randomWord);
      }
    }

    setOptions(opts.sort(() => Math.random() - 0.5));
    setGamePhase('matching');
  };

  const completeGame = async () => {
    setGamePhase('complete');
    const timeMs = Date.now() - startTime;
    const accuracy = Math.round((correctAnswers / TOTAL_ROUNDS) * 100);

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
    setScore(0);
    setRound(0);
    setCorrectAnswers(0);
    setGamePhase('memorize');
  };

  const handleAnswer = (answer: string) => {
    if (feedback) return;

    const isCorrect = answer === correctPair;
    
    if (isCorrect) {
      setCorrectAnswers(prev => prev + 1);
      setScore(prev => prev + (15 * level));
      setFeedback('correct');
    } else {
      setFeedback('wrong');
    }

    setTimeout(() => {
      setRound(prev => prev + 1);
      setGamePhase('memorize');
    }, 1200);
  };

  if (gamePhase === 'instructions') {
    return (
      <div className="word_pair_match-game">
        <div className="game-instructions">
          <button className="exit-btn" onClick={onExit}>✕</button>
          <h2>📝 Word Pair Match</h2>
          <p className="game-subtitle">Level {level}</p>
          <div className="instructions-content">
            <p>👀 Memorize the word pairs shown</p>
            <p>🧠 Remember which words go together</p>
            <p>🎯 Match the word with its pair</p>
            <p>📊 {pairsPerRound} pairs to remember</p>
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
      <div className="word_pair_match-game">
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
          <div className="instruction-text">Memorize these pairs:</div>
          {showPairs && (
            <div className="pairs-display">
              {pairsToShow.map(([word1, word2], idx) => (
                <div key={idx} className="pair-item" style={{ animationDelay: `${idx * 0.2}s` }}>
                  <span className="pair-word">{word1}</span>
                  <span className="pair-arrow">↔</span>
                  <span className="pair-word">{word2}</span>
                </div>
              ))}
            </div>
          )}
          {!showPairs && (
            <div className="loading-text">Get ready...</div>
          )}
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
        <div className="question-text">What pairs with:</div>
        <div className="current-word">{currentWord}</div>

        {feedback && (
          <div className={`feedback ${feedback}`}>
            {feedback === 'correct' ? `✓ Correct! ${currentWord} ↔ ${correctPair}` : `✗ Wrong! It was ${correctPair}`}
          </div>
        )}

        {!feedback && (
          <div className="options-grid">
            {options.map((opt, idx) => (
              <button
                key={idx}
                className="option-btn"
                onClick={() => handleAnswer(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default WordPairMatch;
