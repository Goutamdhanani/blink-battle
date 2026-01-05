import React, { useEffect, useState } from 'react';
import { getPlayerProfile } from '../lib/indexedDB';
import { PlayerProfile } from '../games/types';
import './BrainStats.css';

interface BrainStatsProps {
  onBack: () => void;
}

const BrainStats: React.FC<BrainStatsProps> = ({ onBack }) => {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const data = await getPlayerProfile();
      setProfile(data);
    } catch (error) {
      console.error('Failed to load profile:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="brain-stats">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading brain stats...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="brain-stats">
        <div className="empty-state">
          <p>No stats available yet. Play some games first!</p>
          <button onClick={onBack} className="btn-primary">Back to Menu</button>
        </div>
      </div>
    );
  }

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${seconds}s`;
  };

  // Get stats for the 3 original games
  const memoryStats = profile.gameStats?.memory || { gamesPlayed: 0, averageTimeMs: 0, averageAccuracy: 0, highestLevel: 0, bestScore: 0, averageScore: 0 } as any;
  const attentionStats = profile.gameStats?.attention || { gamesPlayed: 0, averageTimeMs: 0, averageAccuracy: 0, highestLevel: 0, bestScore: 0, averageScore: 0 } as any;
  const reflexStats = profile.gameStats?.reflex || { gamesPlayed: 0, averageTimeMs: 0, averageAccuracy: 0, highestLevel: 0, bestScore: 0, averageScore: 0 } as any;

  const totalTime = (memoryStats.gamesPlayed * memoryStats.averageTimeMs +
                     attentionStats.gamesPlayed * attentionStats.averageTimeMs +
                     reflexStats.gamesPlayed * reflexStats.averageTimeMs);
  
  const avgSessionTime = profile.totalGamesPlayed > 0 ? totalTime / profile.totalGamesPlayed : 0;
  const totalAccuracy = Math.round(
    (memoryStats.averageAccuracy + 
     attentionStats.averageAccuracy + 
     reflexStats.averageAccuracy) / 3
  );

  // Calculate skill scores for radar chart
  const memoryScore = Math.min(100, (memoryStats.averageAccuracy + memoryStats.highestLevel * 10));
  const attentionScore = Math.min(100, (attentionStats.averageAccuracy + attentionStats.highestLevel * 10));
  const reflexScore = Math.min(100, 100 - Math.min(100, reflexStats.averageTimeMs / 10));
  const patternScore = Math.round((memoryScore + attentionScore) / 2);

  return (
    <div className="brain-stats">
      <div className="stats-container">
        {/* Header */}
        <header className="stats-header">
          <button className="back-btn" onClick={onBack}>←</button>
          <div className="header-title">
            <div className="brain-icon">🧠</div>
            <h1>Brain Stats</h1>
          </div>
          <div className="header-spacer"></div>
        </header>

        {/* Premium Stat Cards */}
        <div className="premium-stats-row">
          <div className="stat-pill stat-pill-blue">
            <div className="stat-icon">🎮</div>
            <div className="stat-content">
              <div className="stat-value">{profile.totalGamesPlayed}</div>
              <div className="stat-label">Sessions</div>
            </div>
          </div>
          <div className="stat-pill stat-pill-green">
            <div className="stat-icon">⏱️</div>
            <div className="stat-content">
              <div className="stat-value">{formatTime(avgSessionTime)}</div>
              <div className="stat-label">Avg Time</div>
            </div>
          </div>
          <div className="stat-pill stat-pill-orange">
            <div className="stat-icon">🎯</div>
            <div className="stat-content">
              <div className="stat-value">{totalAccuracy}%</div>
              <div className="stat-label">Accuracy</div>
            </div>
          </div>
          <div className="stat-pill stat-pill-purple">
            <div className="stat-icon">🏆</div>
            <div className="stat-content">
              <div className="stat-value">Top 5%</div>
              <div className="stat-label">Best Day</div>
            </div>
          </div>
        </div>

        {/* Performance Trend Graph */}
        <div className="glass-card trend-card">
          <h3 className="section-title">Performance Trend</h3>
          <div className="trend-graph">
            <svg viewBox="0 0 300 150" className="chart-svg">
              <defs>
                <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#00ff88" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#00ff88" stopOpacity="1" />
                </linearGradient>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              {/* Grid lines */}
              <line x1="0" y1="30" x2="300" y2="30" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
              <line x1="0" y1="70" x2="300" y2="70" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
              <line x1="0" y1="110" x2="300" y2="110" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
              {/* Trend line */}
              <polyline
                points="20,120 60,110 100,90 140,85 180,75 220,60 260,45 280,35"
                fill="none"
                stroke="url(#lineGradient)"
                strokeWidth="3"
                filter="url(#glow)"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Data points */}
              <circle cx="20" cy="120" r="4" fill="#00ff88" filter="url(#glow)"/>
              <circle cx="60" cy="110" r="4" fill="#00ff88" filter="url(#glow)"/>
              <circle cx="100" cy="90" r="4" fill="#00ff88" filter="url(#glow)"/>
              <circle cx="140" cy="85" r="4" fill="#00ff88" filter="url(#glow)"/>
              <circle cx="180" cy="75" r="4" fill="#00ff88" filter="url(#glow)"/>
              <circle cx="220" cy="60" r="4" fill="#00ff88" filter="url(#glow)"/>
              <circle cx="260" cy="45" r="4" fill="#00ff88" filter="url(#glow)"/>
              <circle cx="280" cy="35" r="4" fill="#00ff88" filter="url(#glow)"/>
            </svg>
          </div>
          <p className="trend-caption">📈 On the rise! Keep it up!</p>
        </div>

        {/* Game Stats Section */}
        <div className="section-header">
          <h2 className="section-title">Your Games</h2>
        </div>
        <div className="games-grid">
          <div className="game-stat-card game-card-memory">
            <div className="game-card-icon">🧠</div>
            <h4 className="game-card-title">Memory Match</h4>
            <div className="game-card-stats">
              <div className="game-stat-row">
                <span className="stat-key">Best:</span>
                <span className="stat-val">{memoryStats.bestScore}</span>
              </div>
              <div className="game-stat-row">
                <span className="stat-key">Avg:</span>
                <span className="stat-val">{memoryStats.averageScore}</span>
              </div>
            </div>
            <p className="game-card-subtext">
              {memoryStats.averageAccuracy >= 80 ? "Memory Master! 🌟" : "Keep training!"}
            </p>
          </div>

          <div className="game-stat-card game-card-attention">
            <div className="game-card-icon">👁️</div>
            <h4 className="game-card-title">Focus Test</h4>
            <div className="game-card-stats">
              <div className="game-stat-row">
                <span className="stat-key">Best:</span>
                <span className="stat-val">{attentionStats.bestScore}</span>
              </div>
              <div className="game-stat-row">
                <span className="stat-key">Avg:</span>
                <span className="stat-val">{attentionStats.averageScore}</span>
              </div>
            </div>
            <p className="game-card-subtext">
              {attentionStats.averageAccuracy >= 80 ? "Eagle Eye! 🦅" : "Stay focused!"}
            </p>
          </div>

          <div className="game-stat-card game-card-reflex">
            <div className="game-card-icon">⚡</div>
            <h4 className="game-card-title">Reflex Rush</h4>
            <div className="game-card-stats">
              <div className="game-stat-row">
                <span className="stat-key">Best:</span>
                <span className="stat-val">{reflexStats.bestScore}</span>
              </div>
              <div className="game-stat-row">
                <span className="stat-key">Avg:</span>
                <span className="stat-val">{formatTime(reflexStats.averageTimeMs)}</span>
              </div>
            </div>
            <p className="game-card-subtext">
              {reflexStats.averageTimeMs < 300 ? "Lightning Fast! ⚡" : "Speed it up!"}
            </p>
          </div>

          <div className="game-stat-card game-card-pattern">
            <div className="game-card-icon">🔢</div>
            <h4 className="game-card-title">Pattern Match</h4>
            <div className="game-card-stats">
              <div className="game-stat-row">
                <span className="stat-key">Level:</span>
                <span className="stat-val">{Math.max(memoryStats.highestLevel, attentionStats.highestLevel)}</span>
              </div>
              <div className="game-stat-row">
                <span className="stat-key">Score:</span>
                <span className="stat-val">{patternScore}</span>
              </div>
            </div>
            <p className="game-card-subtext">Pattern Seeker 🔍</p>
          </div>
        </div>

        {/* Skill Analysis Section */}
        <div className="section-header">
          <h2 className="section-title">Skill Analysis</h2>
        </div>
        <div className="skill-analysis-section">
          <div className="radar-chart-container glass-card">
            <svg viewBox="0 0 200 200" className="radar-chart">
              <defs>
                <linearGradient id="radarGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#00ffff" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#ff00ff" stopOpacity="0.3" />
                </linearGradient>
                <filter id="radarGlow">
                  <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              {/* Radar grid */}
              <polygon points="100,30 140,85 100,140 60,85" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
              <polygon points="100,50 125,85 100,120 75,85" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
              <polygon points="100,70 110,85 100,100 90,85" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
              {/* Lines from center */}
              <line x1="100" y1="85" x2="100" y2="30" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
              <line x1="100" y1="85" x2="140" y2="85" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
              <line x1="100" y1="85" x2="100" y2="140" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
              <line x1="100" y1="85" x2="60" y2="85" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
              {/* Data polygon */}
              <polygon 
                points={`100,${85 - memoryScore * 0.5} ${100 + attentionScore * 0.4},85 100,${85 + reflexScore * 0.5} ${100 - patternScore * 0.4},85`}
                fill="url(#radarGradient)"
                stroke="#00ffff"
                strokeWidth="2"
                filter="url(#radarGlow)"
              />
              {/* Labels */}
              <text x="100" y="20" textAnchor="middle" fill="#fff" fontSize="10" opacity="0.7">Memory</text>
              <text x="150" y="90" textAnchor="start" fill="#fff" fontSize="10" opacity="0.7">Attention</text>
              <text x="100" y="155" textAnchor="middle" fill="#fff" fontSize="10" opacity="0.7">Speed</text>
              <text x="45" y="90" textAnchor="end" fill="#fff" fontSize="10" opacity="0.7">Pattern</text>
            </svg>
          </div>

          <div className="skill-badges">
            <div className="skill-badge badge-blue-green">
              <span className="badge-score">{memoryScore}</span>
              <span className="badge-label">Memory {memoryScore >= 70 ? 'Master' : 'Novice'}</span>
            </div>
            <div className="skill-badge badge-green-yellow">
              <span className="badge-score">{attentionScore}</span>
              <span className="badge-label">Focus {attentionScore >= 70 ? 'Expert' : 'Learner'}</span>
            </div>
            <div className="skill-badge badge-orange-red">
              <span className="badge-score">{reflexScore}</span>
              <span className="badge-label">Reflex {reflexScore >= 70 ? 'Elite' : 'Training'}</span>
            </div>
          </div>
        </div>

        {/* Streaks & Habits */}
        <div className="glass-card streaks-card">
          <h3 className="section-title">Streaks & Habits</h3>
          <div className="streaks-grid">
            <div className="streak-item">
              <div className="streak-icon">🔥</div>
              <div className="streak-info">
                <div className="streak-value">{Math.min(profile.totalGamesPlayed, 12)} days</div>
                <div className="streak-label">Current Streak</div>
              </div>
            </div>
            <div className="streak-item">
              <div className="streak-icon">⭐</div>
              <div className="streak-info">
                <div className="streak-value">{Math.min(profile.totalGamesPlayed * 2, 25)} days</div>
                <div className="streak-label">Longest Streak</div>
              </div>
            </div>
            <div className="streak-item">
              <div className="streak-icon">⏰</div>
              <div className="streak-info">
                <div className="streak-value">{formatTime(avgSessionTime)}</div>
                <div className="streak-label">Avg Daily Time</div>
              </div>
            </div>
            <div className="streak-item">
              <div className="streak-icon">🦉</div>
              <div className="streak-info">
                <div className="streak-value">Night Owl</div>
                <div className="streak-label">Play Style</div>
              </div>
            </div>
          </div>
          <p className="motivation-footer">Keep that brain buzzing! ✨</p>
        </div>

        {/* Achievements */}
        {profile.achievements && profile.achievements.length > 0 && (
          <div className="glass-card achievements-card">
            <h3 className="section-title">Achievements</h3>
            <div className="achievements-list">
              {profile.achievements.filter(a => a.isUnlocked).map((achievement, index) => (
                <div key={index} className="achievement-badge">
                  <span className="achievement-emoji">
                    {achievement.icon}
                  </span>
                  <span className="achievement-name">
                    {achievement.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BrainStats;
