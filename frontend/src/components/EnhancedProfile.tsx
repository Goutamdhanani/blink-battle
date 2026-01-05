import React, { useEffect, useState } from 'react';
import { getPlayerProfile } from '../lib/indexedDB';
import { PlayerProfile } from '../games/types';
import { useBrainTrainingData } from '../hooks/useBrainTrainingData';
import PersonalizedBrainCard from './PersonalizedBrainCard';
import './EnhancedProfile.css';

interface EnhancedProfileProps {
  onBack: () => void;
}

const EnhancedProfile: React.FC<EnhancedProfileProps> = ({ onBack }) => {
  const [selectedTheme, setSelectedTheme] = useState('Rookie');
  
  // Get token from localStorage if user is authenticated
  const token = localStorage.getItem('token');
  
  // Use hook to fetch data from backend or IndexedDB
  const { profile, loading, error } = useBrainTrainingData(token);

  useEffect(() => {
    if (profile) {
      setSelectedTheme(profile.currentTheme);
    }
  }, [profile]);

  if (loading) {
    return (
      <div className="enhanced-profile">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading your profile...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="enhanced-profile">
        <div className="empty-state">
          <p>No profile data available. Play some games first!</p>
          <button onClick={onBack} className="btn-primary">Back to Menu</button>
        </div>
      </div>
    );
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getProgressToNextLevel = () => {
    const XP_BASE_MULTIPLIER = 100; // Same as in indexedDB.ts
    const currentLevelXP = Math.pow(profile.level - 1, 2) * XP_BASE_MULTIPLIER;
    const nextLevelXP = Math.pow(profile.level, 2) * XP_BASE_MULTIPLIER;
    const progress = ((profile.xp - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100;
    return Math.min(100, Math.max(0, progress));
  };

  return (
    <div className="enhanced-profile">
      <div className="profile-container">
        {/* Header */}
        <header className="profile-header">
          <button className="back-btn" onClick={onBack}>←</button>
          <div className="header-title">
            <h1>Player Profile</h1>
          </div>
          <div className="header-spacer"></div>
        </header>

        {/* Player Card */}
        <div className="player-card">
          <div className="player-avatar">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="Avatar" />
            ) : (
              <div className="default-avatar">🧠</div>
            )}
          </div>
          <div className="player-info">
            <h2 className="player-name">{profile.username || 'Brain Trainer'}</h2>
            <div className="rank-badge-container">
              <span className="rank-badge">{profile.rankBadge}</span>
              <span className="level-badge">Level {profile.level}</span>
            </div>
            <div className="join-date">
              Member since {formatDate(profile.joinDate)}
            </div>
          </div>
        </div>

        {/* Personalized Brain Card */}
        <PersonalizedBrainCard profile={profile} />

        {/* XP Progress */}
        <div className="xp-section">
          <div className="xp-header">
            <span>Experience Points</span>
            <span className="xp-value">{profile.xp.toLocaleString()} XP</span>
          </div>
          <div className="xp-progress-bar">
            <div 
              className="xp-progress-fill" 
              style={{ width: `${getProgressToNextLevel()}%` }}
            />
          </div>
          <div className="xp-footer">
            <span>Level {profile.level}</span>
            <span>Level {profile.level + 1}</span>
          </div>
        </div>

        {/* Core Stats Grid */}
        <div className="core-stats-grid">
          <div className="stat-card">
            <div className="stat-icon">🎮</div>
            <div className="stat-value">{profile.totalSessions}</div>
            <div className="stat-label">Total Sessions</div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">🔥</div>
            <div className="stat-value">{profile.currentStreak}</div>
            <div className="stat-label">Play Streak</div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">📊</div>
            <div className="stat-value">{profile.overallAccuracy}%</div>
            <div className="stat-label">Accuracy</div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">🧠</div>
            <div className="stat-value">{profile.cognitiveIndex}</div>
            <div className="stat-label">Cognitive Index</div>
          </div>
        </div>

        {/* Achievements Section */}
        <div className="achievements-section">
          <h3 className="section-title">
            🏆 Achievements ({profile.achievements.filter(a => a.isUnlocked).length}/{profile.achievements.length})
          </h3>
          <div className="achievements-grid">
            {profile.achievements.map((achievement) => (
              <div 
                key={achievement.id} 
                className={`achievement-card ${achievement.isUnlocked ? 'unlocked' : 'locked'}`}
              >
                <div className="achievement-icon">{achievement.icon}</div>
                <div className="achievement-info">
                  <div className="achievement-name">{achievement.name}</div>
                  <div className="achievement-description">{achievement.description}</div>
                  {!achievement.isUnlocked && achievement.progress !== undefined && (
                    <div className="achievement-progress">
                      Progress: {achievement.progress}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Theme Selector */}
        <div className="theme-section">
          <h3 className="section-title">🎨 Unlocked Themes</h3>
          <div className="themes-grid">
            {profile.unlockedThemes.map((theme) => (
              <div
                key={theme}
                className={`theme-card ${selectedTheme === theme ? 'selected' : ''}`}
                onClick={() => setSelectedTheme(theme)}
              >
                <div className="theme-preview">
                  {theme === 'Rookie' && '🌟'}
                  {theme === 'Experienced' && '⚡'}
                  {theme === 'Elite' && '👑'}
                  {theme === 'Hacker Mode' && '🔥'}
                </div>
                <div className="theme-name">{theme}</div>
              </div>
            ))}
            {/* Locked themes */}
            {!profile.unlockedThemes.includes('Hacker Mode') && (
              <div className="theme-card locked">
                <div className="theme-preview">🔒</div>
                <div className="theme-name">Hacker Mode</div>
                <div className="unlock-requirement">Level 10</div>
              </div>
            )}
          </div>
        </div>

        {/* Game Stats Preview */}
        <div className="game-stats-section">
          <h3 className="section-title">📈 Game Statistics</h3>
          <div className="game-stats-list">
            {Object.entries(profile.gameStats)
              .filter(([_, stats]) => stats.gamesPlayed > 0)
              .map(([gameType, stats]) => (
                <div key={gameType} className="game-stat-row">
                  <div className="game-stat-name">{gameType.replace(/_/g, ' ')}</div>
                  <div className="game-stat-values">
                    <span className="game-stat-item">
                      Games: {stats.gamesPlayed}
                    </span>
                    <span className="game-stat-item">
                      Best: {stats.bestScore}
                    </span>
                    <span className="game-stat-item">
                      Avg: {stats.averageScore}
                    </span>
                    <span className="game-stat-item">
                      Level: {stats.highestLevel}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="profile-actions">
          <button className="action-btn" onClick={onBack}>
            Back to Games
          </button>
        </div>
      </div>
    </div>
  );
};

export default EnhancedProfile;
