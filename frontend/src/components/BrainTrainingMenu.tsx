import React, { useState, useEffect } from 'react';
import { GameType as GameTypeEnum, Achievement } from '../games/types';
import { useBrainTrainingData } from '../hooks/useBrainTrainingData';
import { useMiniKit } from '../providers/MiniKitProvider';
import { createTouchHandler } from '../lib/touchUtils';
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
import EnhancedProfile from './EnhancedProfile';
import GamesPage from './GamesPage';
import MasterDashboard from './Dashboard/MasterDashboard';
import LoginButton from './ui/LoginButton';
import Tutorial from './ui/Tutorial';
import { GameScore } from '../games/types';
import './BrainTrainingMenu.css';

type GameType = GameTypeEnum | 'stats' | 'profile' | 'games' | 'dashboard' | null;

const BrainTrainingMenu: React.FC = () => {
  const [currentGame, setCurrentGame] = useState<GameType>(null);
  const [showWelcome, setShowWelcome] = useState(true);
  const [showTutorial, setShowTutorial] = useState(false);
  
  // Get MiniKit authentication state
  const { isAuthenticated } = useMiniKit();
  
  // Get token from localStorage if user is authenticated (from PvP auth)
  const token = localStorage.getItem('token');
  
  // Use hook to fetch data from backend or IndexedDB
  const { profile, refresh } = useBrainTrainingData(token);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowWelcome(false);
      // Check if user has seen the app tutorial
      const hasSeenTutorial = localStorage.getItem('tutorial_app_intro');
      if (!hasSeenTutorial) {
        setShowTutorial(true);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleGameComplete = (score: GameScore) => {
    console.log('Game completed:', score);
    refresh(); // Refresh stats
  };

  const handleGameExit = () => {
    setCurrentGame(null);
    refresh(); // Refresh stats when exiting
  };

  const handleGameSelect = (game: GameTypeEnum) => {
    setCurrentGame(game);
  };

  // Create touch handlers for menu navigation
  const navigateToGames = createTouchHandler(() => {
    console.log('[Menu] Navigating to games');
    setCurrentGame('games');
  });

  const navigateToProfile = createTouchHandler(() => {
    console.log('[Menu] Navigating to profile');
    setCurrentGame('profile');
  });

  const navigateToStats = createTouchHandler(() => {
    console.log('[Menu] Navigating to stats');
    setCurrentGame('stats');
  });

  const navigateToDashboard = createTouchHandler(() => {
    console.log('[Menu] Navigating to dashboard');
    setCurrentGame('dashboard');
  });

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

  if (currentGame === 'profile') {
    return <EnhancedProfile onBack={handleGameExit} />;
  }

  if (currentGame === 'games') {
    return <GamesPage onBack={handleGameExit} onGameSelect={handleGameSelect} profile={profile} />;
  }

  if (currentGame === 'dashboard') {
    return (
      <MasterDashboard 
        onBack={handleGameExit}
        onGameSelect={handleGameSelect}
        username={profile?.username}
        level={profile?.level || 1}
        xp={profile?.xp || 0}
        gameStats={profile?.gameStats || {}}
      />
    );
  }

  // Tutorial steps for first-time users
  const tutorialSteps = [
    {
      title: 'Welcome to Blink Battle',
      description: 'Train your brain with 13 engaging cognitive games designed to improve memory, attention, and reflexes.',
      icon: '🧠',
    },
    {
      title: 'Track Your Progress',
      description: 'Monitor your performance with detailed statistics, achievements, and cognitive insights.',
      icon: '📊',
    },
    {
      title: 'Personalized Experience',
      description: 'Login with MiniKit to save your progress and compete on global leaderboards.',
      icon: '🌐',
    },
    {
      title: 'Ready to Start?',
      description: 'Choose a game from the menu and begin your brain training journey!',
      icon: '🎮',
    },
  ];

  return (
    <div className="brain-training-menu">
      {/* Tutorial Overlay */}
      {showTutorial && (
        <Tutorial
          steps={tutorialSteps}
          onComplete={() => setShowTutorial(false)}
          onSkip={() => setShowTutorial(false)}
          storageKey="app_intro"
        />
      )}

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

        {/* Login Section */}
        {!isAuthenticated && (
          <div className="login-section">
            <LoginButton />
          </div>
        )}

        {isAuthenticated && (
          <div className="auth-status-section">
            <LoginButton />
          </div>
        )}

        {/* Dashboard Overview */}
        <div className="dashboard-section">
          <h2 className="section-title">Your Progress</h2>
          
          {profile && profile.totalGamesPlayed > 0 ? (
            <>
              {/* Quick Stats Overview */}
              <div className="quick-stats">
                <div className="quick-stat-item">
                  <div className="quick-stat-icon">🎮</div>
                  <div className="quick-stat-value">{profile.totalGamesPlayed}</div>
                  <div className="quick-stat-label">Games</div>
                </div>
                <div className="quick-stat-item">
                  <div className="quick-stat-icon">🏆</div>
                  <div className="quick-stat-value">{profile.achievements?.filter((a: Achievement) => a.isUnlocked).length || 0}</div>
                  <div className="quick-stat-label">Badges</div>
                </div>
                <div className="quick-stat-item">
                  <div className="quick-stat-icon">⚡</div>
                  <div className="quick-stat-value">{profile.level || 1}</div>
                  <div className="quick-stat-label">Level</div>
                </div>
                <div className="quick-stat-item">
                  <div className="quick-stat-icon">🧠</div>
                  <div className="quick-stat-value">{profile.cognitiveIndex}</div>
                  <div className="quick-stat-label">Cognitive</div>
                </div>
              </div>

              {/* Recent Performance */}
              <div className="recent-performance glass-card">
                <h3 className="card-title">Cognitive Overview</h3>
                <div className="performance-grid">
                  <div className="performance-item">
                    <span className="perf-label">Overall Accuracy</span>
                    <span className="perf-value">{profile.overallAccuracy}%</span>
                  </div>
                  <div className="performance-item">
                    <span className="perf-label">Rank</span>
                    <span className="perf-value">{profile.rankBadge}</span>
                  </div>
                  <div className="performance-item">
                    <span className="perf-label">XP</span>
                    <span className="perf-value">{profile.xp.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state glass-card">
              <div className="empty-icon">🎮</div>
              <h3>Start Your Brain Training Journey</h3>
              <p>Play games to unlock insights about your cognitive abilities</p>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="quick-actions-section">
          <h2 className="section-title">Quick Actions</h2>
          <div className="action-cards">
            <button className="action-card action-card-dashboard" {...navigateToDashboard}>
              <div className="action-icon">📊</div>
              <div className="action-info">
                <h3 className="action-title">Master Dashboard</h3>
                <p className="action-description">Complete cognitive analysis</p>
              </div>
              <div className="action-arrow">→</div>
            </button>

            <button className="action-card action-card-games" {...navigateToGames}>
              <div className="action-icon">🎮</div>
              <div className="action-info">
                <h3 className="action-title">Play Games</h3>
                <p className="action-description">13 brain training games</p>
              </div>
              <div className="action-arrow">→</div>
            </button>

            <button className="action-card action-card-profile" {...navigateToProfile}>
              <div className="action-icon">👤</div>
              <div className="action-info">
                <h3 className="action-title">Brain Profile</h3>
                <p className="action-description">View detailed analytics</p>
              </div>
              <div className="action-arrow">→</div>
            </button>

            <button className="action-card action-card-stats" {...navigateToStats}>
              <div className="action-icon">📈</div>
              <div className="action-info">
                <h3 className="action-title">Statistics</h3>
                <p className="action-description">Track your progress</p>
              </div>
              <div className="action-arrow">→</div>
            </button>
          </div>
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
        <button className="nav-item" {...navigateToGames}>
          <span className="nav-icon">🎮</span>
          <span className="nav-label">Games</span>
        </button>
        <button className="nav-item" {...navigateToProfile}>
          <span className="nav-icon">👤</span>
          <span className="nav-label">Profile</span>
        </button>
        <button className="nav-item" {...navigateToStats}>
          <span className="nav-icon">📊</span>
          <span className="nav-label">Stats</span>
        </button>
      </nav>
    </div>
  );
};

export default BrainTrainingMenu;
