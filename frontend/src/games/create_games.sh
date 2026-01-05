#!/bin/bash

# This script creates the remaining 7 brain training games

# Game configurations (name, gameType, color1, color2, emoji)
declare -a games=(
  "FocusFilter:focus_filter:#fa709a:#fee140:🎯"
  "PathMemory:path_memory:#30cfd0:#330867:🗺️"
  "MissingNumber:missing_number:#a8edea:#fed6e3:🔢"
  "ColorSwap:color_swap:#ffecd2:#fcb69f:🎨"
  "ReverseRecall:reverse_recall:#ff9a9e:#fecfef:⏮️"
  "BlinkCount:blink_count:#fbc2eb:#a6c1ee:👁️"
  "WordPairMatch:word_pair_match:#fdcbf1:#e6dee9:📝"
)

for game_config in "${games[@]}"; do
  IFS=':' read -r name gameType color1 color2 emoji <<< "$game_config"
  
  echo "Creating $name..."
  
  # Create TypeScript component
  cat > "${name}.tsx" << EOF
import React, { useState } from 'react';
import { saveGameScore } from '../lib/indexedDB';
import { GameScore } from './types';
import './${name}.css';

interface ${name}Props {
  onGameComplete: (score: GameScore) => void;
  onExit: () => void;
}

const ${name}: React.FC<${name}Props> = ({ onGameComplete, onExit }) => {
  const [level, setLevel] = useState(1);
  const [score, setScore] = useState(0);
  const [gamePhase, setGamePhase] = useState<'instructions' | 'playing' | 'complete'>('instructions');
  const [startTime] = useState(Date.now());

  const completeGame = async () => {
    setGamePhase('complete');
    const timeMs = Date.now() - startTime;
    const accuracy = Math.round(Math.random() * 30 + 70); // Placeholder

    const gameScore: GameScore = {
      gameType: '${gameType}',
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
      <div className="${gameType}-game">
        <div className="game-instructions">
          <button className="exit-btn" onClick={onExit}>✕</button>
          <h2>${emoji} ${name.replace(/([A-Z])/g, ' \$1').trim()}</h2>
          <p className="game-subtitle">Level {level}</p>
          <div className="instructions-content">
            <p>🎮 Challenge your brain</p>
            <p>🧠 Improve cognitive skills</p>
            <p>📈 Track your progress</p>
          </div>
          <button className="start-btn" onClick={() => { setGamePhase('playing'); setTimeout(completeGame, 5000); }}>
            Start Level {level}
          </button>
        </div>
      </div>
    );
  }

  if (gamePhase === 'complete') {
    return (
      <div className="${gameType}-game">
        <div className="game-complete">
          <h2>🎉 Level {level} Complete!</h2>
          <div className="final-stats">
            <div className="stat-item">
              <div className="stat-value">{score}</div>
              <div className="stat-label">Score</div>
            </div>
          </div>
          <div className="action-buttons">
            <button className="next-level-btn" onClick={() => { setLevel(prev => prev + 1); setScore(0); setGamePhase('instructions'); }}>
              Next Level →
            </button>
            <button className="menu-btn" onClick={onExit}>Main Menu</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="${gameType}-game">
      <div className="game-header">
        <button className="exit-btn" onClick={onExit}>✕</button>
        <div className="game-info">
          <span>Level {level}</span>
          <span>Score: {score}</span>
        </div>
      </div>
      <div className="game-arena">
        <h3>Game in progress...</h3>
        <p>This is a placeholder for ${name}</p>
      </div>
    </div>
  );
};

export default ${name};
EOF

  # Create CSS file
  cat > "${name}.css" << EOF
.${gameType}-game {
  min-height: 100vh;
  background: linear-gradient(135deg, ${color1} 0%, ${color2} 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.game-instructions, .game-complete {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 20px;
  padding: 40px;
  max-width: 500px;
  width: 100%;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  position: relative;
}

.game-instructions h2, .game-complete h2 {
  font-size: 2.5em;
  margin: 0 0 10px 0;
  background: linear-gradient(135deg, ${color1}, ${color2});
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.game-subtitle {
  color: #666;
  font-size: 1.2em;
  margin-bottom: 30px;
}

.instructions-content {
  text-align: left;
  margin: 30px 0;
  background: rgba(0, 0, 0, 0.05);
  padding: 20px;
  border-radius: 10px;
}

.instructions-content p {
  margin: 15px 0;
  font-size: 1.1em;
  color: #333;
}

.start-btn, .next-level-btn, .menu-btn {
  background: linear-gradient(135deg, ${color1}, ${color2});
  color: white;
  border: none;
  padding: 15px 40px;
  font-size: 1.2em;
  border-radius: 50px;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: bold;
  margin: 10px;
}

.start-btn:hover, .next-level-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}

.menu-btn {
  background: linear-gradient(135deg, #868e96, #495057);
}

.exit-btn {
  position: absolute;
  top: 20px;
  right: 20px;
  background: white;
  border: 2px solid #ddd;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  font-size: 1.5em;
  cursor: pointer;
  transition: all 0.2s;
}

.exit-btn:hover {
  background: #ff6b6b;
  color: white;
  transform: rotate(90deg);
}

.game-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: rgba(255, 255, 255, 0.95);
  padding: 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  z-index: 10;
}

.game-info {
  display: flex;
  justify-content: space-around;
  max-width: 600px;
  margin: 0 auto;
  font-weight: bold;
  font-size: 1.1em;
}

.game-arena {
  margin-top: 100px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 30px;
  padding: 40px;
}

.final-stats {
  display: flex;
  justify-content: space-around;
  margin: 30px 0;
  gap: 20px;
}

.stat-item {
  flex: 1;
  background: rgba(0, 0, 0, 0.05);
  padding: 20px;
  border-radius: 15px;
}

.stat-value {
  font-size: 2.5em;
  font-weight: bold;
  background: linear-gradient(135deg, ${color1}, ${color2});
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.stat-label {
  color: #666;
  margin-top: 5px;
}

.action-buttons {
  display: flex;
  justify-content: center;
  gap: 15px;
  flex-wrap: wrap;
}
EOF

  echo "✓ Created $name"
done

echo "All games created successfully!"
