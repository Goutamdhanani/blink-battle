import React, { useState, useEffect } from 'react';
import { getPlayerProfile } from '../lib/indexedDB';
import { PlayerProfile } from '../games/types';
import MemoryGame from '../games/MemoryGame';
import AttentionGame from '../games/AttentionGame';
import ReflexGame from '../games/ReflexGame';
import BrainStats from './BrainStats';
import { GameScore } from '../games/types';
import './BrainTrainingMenu.css';

type GameType = 'memory' | 'attention' | 'reflex' | 'stats' | null;

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
              <div className="quick-stat-value">{profile.achievements.length}</div>
              <div className="quick-stat-label">Badges</div>
            </div>
            <div className="quick-stat-item">
              <div className="quick-stat-icon">⚡</div>
              <div className="quick-stat-value">
                {Math.max(profile.memoryStats.highestLevel, profile.attentionStats.highestLevel, profile.reflexStats.highestLevel)}
              </div>
              <div className="quick-stat-label">Max Level</div>
            </div>
          </div>
        )}

        {/* Game Selection Cards */}
        <div className="games-section">
          <h2 className="section-title">Choose Your Challenge</h2>
          
          <div className="game-cards">
            <div className="game-card game-card-memory" onClick={() => setCurrentGame('memory')}>
              <div className="game-card-glow"></div>
              <div className="game-card-content">
                <div className="game-icon">🧠</div>
                <h3 className="game-title">Memory Match</h3>
                <p className="game-description">
                  Test your memory by matching pairs of symbols
                </p>
                <div className="game-stats-preview">
                  {profile && profile.memoryStats.gamesPlayed > 0 && (
                    <>
                      <span className="stat-badge">Best: {profile.memoryStats.bestScore}</span>
                      <span className="stat-badge">Level: {profile.memoryStats.highestLevel}</span>
                    </>
                  )}
                </div>
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
                <p className="game-description">
                  Train your attention by hitting targets quickly
                </p>
                <div className="game-stats-preview">
                  {profile && profile.attentionStats.gamesPlayed > 0 && (
                    <>
                      <span className="stat-badge">Best: {profile.attentionStats.bestScore}</span>
                      <span className="stat-badge">Level: {profile.attentionStats.highestLevel}</span>
                    </>
                  )}
                </div>
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
                <p className="game-description">
                  Challenge your reaction time with rapid tests
                </p>
                <div className="game-stats-preview">
                  {profile && profile.reflexStats.gamesPlayed > 0 && (
                    <>
                      <span className="stat-badge">Best: {profile.reflexStats.bestScore}</span>
                      <span className="stat-badge">Avg: {profile.reflexStats.averageTimeMs}ms</span>
                    </>
                  )}
                </div>
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
