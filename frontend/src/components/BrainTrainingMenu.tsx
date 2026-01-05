import React, { useState, useEffect } from 'react';
import { getPlayerProfile } from '../lib/indexedDB';
import { PlayerProfile, GameType as GameTypeEnum } from '../games/types';
import MemoryGame from '../games/MemoryGame';
import AttentionGame from '../games/AttentionGame';
import ReflexGame from '../games/ReflexGame';
import WordFlash from '../games/WordFlash';
import ShapeShadow from '../games/ShapeShadow';
import SequenceBuilder from '../games/SequenceBuilder';
import FocusFilter from '../games/FocusFilter';
import PathMemory from '../games/PathMemory';
import MissingNumber from '../games/MissingNumber';
import ColorSwap from '../games/ColorSwap';
import ReverseRecall from '../games/ReverseRecall';
import BlinkCount from '../games/BlinkCount';
import WordPairMatch from '../games/WordPairMatch';
import BrainStats from './BrainStats';
import { GameScore } from '../games/types';
import './BrainTrainingMenu.css';

type GameType = GameTypeEnum | 'stats' | null;

const BrainTrainingMenu: React.FC = () => {
  const [currentGame, setCurrentGame] = useState<GameType>(null);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [showWelcome, setShowWelcome] = useState(true);

  useEffect(() => {
    loadProfile();
    const timer = setTimeout(() => setShowWelcome(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  const loadProfile = async () => {
    const data = await getPlayerProfile();
    setProfile(data);
  };

  const handleGameComplete = (score: GameScore) => {
    console.log('Game completed:', score);
    loadProfile(); // Refresh stats
  };

  const handleGameExit = () => {
    setCurrentGame(null);
    loadProfile(); // Refresh stats when exiting
  };

  if (showWelcome) {
    return (
      <div className="welcome-screen">
        <div className="welcome-content">
          <div className="brain-logo">🧠</div>
          <h1 className="welcome-title">Blink Battle</h1>
          <p className="welcome-subtitle">Brain Training</p>
          <div className="loading-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
    );
  }

  if (currentGame === 'memory') {
    return <MemoryGame onGameComplete={handleGameComplete} onExit={handleGameExit} />;
  }

  if (currentGame === 'attention') {
    return <AttentionGame onGameComplete={handleGameComplete} onExit={handleGameExit} />;
  }

  if (currentGame === 'reflex') {
    return <ReflexGame onGameComplete={handleGameComplete} onExit={handleGameExit} />;
  }

  if (currentGame === 'word_flash') {
    return <WordFlash onGameComplete={handleGameComplete} onExit={handleGameExit} />;
  }

  if (currentGame === 'shape_shadow') {
    return <ShapeShadow onGameComplete={handleGameComplete} onExit={handleGameExit} />;
  }

  if (currentGame === 'sequence_builder') {
    return <SequenceBuilder onGameComplete={handleGameComplete} onExit={handleGameExit} />;
  }

  if (currentGame === 'focus_filter') {
    return <FocusFilter onGameComplete={handleGameComplete} onExit={handleGameExit} />;
  }

  if (currentGame === 'path_memory') {
    return <PathMemory onGameComplete={handleGameComplete} onExit={handleGameExit} />;
  }

  if (currentGame === 'missing_number') {
    return <MissingNumber onGameComplete={handleGameComplete} onExit={handleGameExit} />;
  }

  if (currentGame === 'color_swap') {
    return <ColorSwap onGameComplete={handleGameComplete} onExit={handleGameExit} />;
  }

  if (currentGame === 'reverse_recall') {
    return <ReverseRecall onGameComplete={handleGameComplete} onExit={handleGameExit} />;
  }

  if (currentGame === 'blink_count') {
    return <BlinkCount onGameComplete={handleGameComplete} onExit={handleGameExit} />;
  }

  if (currentGame === 'word_pair_match') {
    return <WordPairMatch onGameComplete={handleGameComplete} onExit={handleGameExit} />;
  }

  if (currentGame === 'stats') {
    return <BrainStats onBack={handleGameExit} />;
  }

  return (
    <div className="brain-training-menu">
      <div className="menu-container">
        {/* Header */}
        <header className="menu-header">
          <div className="app-logo">
            <div className="logo-icon">🧠</div>
            <div className="logo-text">
              <h1 className="app-name">Blink Battle</h1>
              <p className="app-tagline">Brain Training</p>
            </div>
          </div>
        </header>

        {/* Quick Stats Overview */}
        {profile && profile.totalGamesPlayed > 0 && (
          <div className="quick-stats">
            <div className="quick-stat-item">
              <div className="quick-stat-icon">🎮</div>
              <div className="quick-stat-value">{profile.totalGamesPlayed}</div>
              <div className="quick-stat-label">Games</div>
            </div>
            <div className="quick-stat-item">
              <div className="quick-stat-icon">🏆</div>
              <div className="quick-stat-value">{profile.achievements?.length || 0}</div>
              <div className="quick-stat-label">Badges</div>
            </div>
            <div className="quick-stat-item">
              <div className="quick-stat-icon">⚡</div>
              <div className="quick-stat-value">
                {profile.level || 1}
              </div>
              <div className="quick-stat-label">Level</div>
            </div>
          </div>
        )}

        {/* Game Selection Cards */}
        <div className="games-section">
          <h2 className="section-title">Choose Your Challenge</h2>
          
          <div className="game-cards">
            {/* Original 3 Games */}
            <div className="game-card game-card-memory" onClick={() => setCurrentGame('memory')}>
              <div className="game-card-glow"></div>
              <div className="game-card-content">
                <div className="game-icon">🧠</div>
                <h3 className="game-title">Memory Match</h3>
                <p className="game-description">Match pairs of symbols</p>
                <div className="play-btn">
                  <span>Play</span>
                  <span className="play-arrow">→</span>
                </div>
              </div>
            </div>

            <div className="game-card game-card-attention" onClick={() => setCurrentGame('attention')}>
              <div className="game-card-glow"></div>
              <div className="game-card-content">
                <div className="game-icon">👁️</div>
                <h3 className="game-title">Focus Test</h3>
                <p className="game-description">Hit targets quickly</p>
                <div className="play-btn">
                  <span>Play</span>
                  <span className="play-arrow">→</span>
                </div>
              </div>
            </div>

            <div className="game-card game-card-reflex" onClick={() => setCurrentGame('reflex')}>
              <div className="game-card-glow"></div>
              <div className="game-card-content">
                <div className="game-icon">⚡</div>
                <h3 className="game-title">Reflex Rush</h3>
                <p className="game-description">Test reaction time</p>
                <div className="play-btn">
                  <span>Play</span>
                  <span className="play-arrow">→</span>
                </div>
              </div>
            </div>

            {/* New Phase 2 Games */}
            <div className="game-card game-card-word" onClick={() => setCurrentGame('word_flash')}>
              <div className="game-card-glow"></div>
              <div className="game-card-content">
                <div className="game-icon">⚡</div>
                <h3 className="game-title">Word Flash</h3>
                <p className="game-description">Rapid word recognition</p>
                <div className="play-btn">
                  <span>Play</span>
                  <span className="play-arrow">→</span>
                </div>
              </div>
            </div>

            <div className="game-card game-card-shape" onClick={() => setCurrentGame('shape_shadow')}>
              <div className="game-card-glow"></div>
              <div className="game-card-content">
                <div className="game-icon">🔲</div>
                <h3 className="game-title">Shape Shadow</h3>
                <p className="game-description">Match shadows to shapes</p>
                <div className="play-btn">
                  <span>Play</span>
                  <span className="play-arrow">→</span>
                </div>
              </div>
            </div>

            <div className="game-card game-card-sequence" onClick={() => setCurrentGame('sequence_builder')}>
              <div className="game-card-glow"></div>
              <div className="game-card-content">
                <div className="game-icon">🔢</div>
                <h3 className="game-title">Sequence Builder</h3>
                <p className="game-description">Remember and recreate</p>
                <div className="play-btn">
                  <span>Play</span>
                  <span className="play-arrow">→</span>
                </div>
              </div>
            </div>

            <div className="game-card game-card-filter" onClick={() => setCurrentGame('focus_filter')}>
              <div className="game-card-glow"></div>
              <div className="game-card-content">
                <div className="game-icon">🎯</div>
                <h3 className="game-title">Focus Filter</h3>
                <p className="game-description">Selective attention</p>
                <div className="play-btn">
                  <span>Play</span>
                  <span className="play-arrow">→</span>
                </div>
              </div>
            </div>

            <div className="game-card game-card-path" onClick={() => setCurrentGame('path_memory')}>
              <div className="game-card-glow"></div>
              <div className="game-card-content">
                <div className="game-icon">🗺️</div>
                <h3 className="game-title">Path Memory</h3>
                <p className="game-description">Trace the path</p>
                <div className="play-btn">
                  <span>Play</span>
                  <span className="play-arrow">→</span>
                </div>
              </div>
            </div>

            <div className="game-card game-card-number" onClick={() => setCurrentGame('missing_number')}>
              <div className="game-card-glow"></div>
              <div className="game-card-content">
                <div className="game-icon">🔢</div>
                <h3 className="game-title">Missing Number</h3>
                <p className="game-description">Find the gap</p>
                <div className="play-btn">
                  <span>Play</span>
                  <span className="play-arrow">→</span>
                </div>
              </div>
            </div>

            <div className="game-card game-card-color" onClick={() => setCurrentGame('color_swap')}>
              <div className="game-card-glow"></div>
              <div className="game-card-content">
                <div className="game-icon">🎨</div>
                <h3 className="game-title">Color Swap</h3>
                <p className="game-description">Pattern matching</p>
                <div className="play-btn">
                  <span>Play</span>
                  <span className="play-arrow">→</span>
                </div>
              </div>
            </div>

            <div className="game-card game-card-reverse" onClick={() => setCurrentGame('reverse_recall')}>
              <div className="game-card-glow"></div>
              <div className="game-card-content">
                <div className="game-icon">⏮️</div>
                <h3 className="game-title">Reverse Recall</h3>
                <p className="game-description">Backward memory</p>
                <div className="play-btn">
                  <span>Play</span>
                  <span className="play-arrow">→</span>
                </div>
              </div>
            </div>

            <div className="game-card game-card-blink" onClick={() => setCurrentGame('blink_count')}>
              <div className="game-card-glow"></div>
              <div className="game-card-content">
                <div className="game-icon">👁️</div>
                <h3 className="game-title">Blink Count</h3>
                <p className="game-description">Count the flashes</p>
                <div className="play-btn">
                  <span>Play</span>
                  <span className="play-arrow">→</span>
                </div>
              </div>
            </div>

            <div className="game-card game-card-pairs" onClick={() => setCurrentGame('word_pair_match')}>
              <div className="game-card-glow"></div>
              <div className="game-card-content">
                <div className="game-icon">📝</div>
                <h3 className="game-title">Word Pair Match</h3>
                <p className="game-description">Associate words</p>
                <div className="play-btn">
                  <span>Play</span>
                  <span className="play-arrow">→</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Button */}
        <div className="menu-actions">
          <button className="stats-button" onClick={() => setCurrentGame('stats')}>
            <span className="stats-icon">📊</span>
            <span>View Detailed Stats</span>
          </button>
        </div>

        {/* Footer */}
        <footer className="menu-footer">
          <p className="footer-text">Train your brain, one game at a time</p>
          <p className="footer-subtext">Powered by Worldcoin MiniKit</p>
        </footer>
      </div>

      {/* Bottom Navigation */}
      <nav className="bottom-nav">
        <button className="nav-item nav-item-active">
          <span className="nav-icon">🏠</span>
          <span className="nav-label">Home</span>
        </button>
        <button className="nav-item" onClick={() => setCurrentGame('stats')}>
          <span className="nav-icon">📊</span>
          <span className="nav-label">Stats</span>
        </button>
        <button className="nav-item">
          <span className="nav-icon">🎮</span>
          <span className="nav-label">Games</span>
        </button>
        <button className="nav-item">
          <span className="nav-icon">👤</span>
          <span className="nav-label">Profile</span>
        </button>
      </nav>
    </div>
  );
};

export default BrainTrainingMenu;
