import React, { useEffect, useState } from 'react';
import { PlayerProfile, GameType } from '../games/types';
import { brainTrainingService } from '../services/brainTrainingService';
import './PersonalizedBrainCard.css';

interface PersonalizedBrainCardProps {
  profile: PlayerProfile;
}

interface CognitiveComparison {
  userCognitiveIndex: number;
  globalAverage: number;
  top10Threshold: number;
}

const PersonalizedBrainCard: React.FC<PersonalizedBrainCardProps> = ({ profile }) => {
  const [cognitiveComparison, setCognitiveComparison] = useState<CognitiveComparison | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCognitiveComparison();
  }, []);

  const loadCognitiveComparison = async () => {
    setLoading(true);
    try {
      // Get token from localStorage if available
      const token = localStorage.getItem('token');
      
      if (token) {
        // Fetch from backend with authentication
        const data = await brainTrainingService.getCognitiveComparison(token);
        setCognitiveComparison({
          userCognitiveIndex: data.userCognitiveIndex,
          globalAverage: data.globalAverage,
          top10Threshold: data.top10Threshold,
        });
      } else {
        // Use profile-based cognitive index when not authenticated
        setCognitiveComparison({
          userCognitiveIndex: profile.cognitiveIndex,
          globalAverage: profile.cognitiveIndex, // Use user's own score as baseline
          top10Threshold: Math.max(profile.cognitiveIndex + 10, 85), // Aspirational goal
        });
      }
    } catch (error) {
      console.error('[PersonalizedBrainCard] Failed to load cognitive comparison:', error);
      // On error, use profile-based values instead of hardcoded mock data
      setCognitiveComparison({
        userCognitiveIndex: profile.cognitiveIndex,
        globalAverage: profile.cognitiveIndex,
        top10Threshold: Math.max(profile.cognitiveIndex + 10, 85),
      });
    } finally {
      setLoading(false);
    }
  };

  // Calculate reaction labels for each game type
  const getReactionLabel = (gameType: GameType): { label: string; score: number; color: string } => {
    const stats = profile.gameStats[gameType];
    if (!stats || stats.gamesPlayed === 0) {
      return { label: 'Not Played', score: 0, color: '#666' };
    }

    // Calculate score based on game type
    let score = 0;
    let label = '';
    let color = '';

    if (gameType === 'reflex') {
      // Lower time is better for reflex
      if (stats.averageTimeMs < 200) {
        score = 95;
        label = 'Lightning';
        color = '#ffd700';
      } else if (stats.averageTimeMs < 300) {
        score = 85;
        label = 'Fast';
        color = '#00ff7f';
      } else if (stats.averageTimeMs < 400) {
        score = 70;
        label = 'Good';
        color = '#00bfff';
      } else {
        score = 50;
        label = 'Training';
        color = '#b45eff';
      }
    } else {
      // For other games, use accuracy-based scoring
      score = stats.averageAccuracy;
      if (score >= 90) {
        label = 'Master';
        color = '#ffd700';
      } else if (score >= 80) {
        label = 'Expert';
        color = '#00ff7f';
      } else if (score >= 70) {
        label = 'Skilled';
        color = '#00bfff';
      } else if (score >= 60) {
        label = 'Proficient';
        color = '#b45eff';
      } else {
        label = 'Learning';
        color = '#ff69b4';
      }
    }

    return { label, score, color };
  };

  // Calculate cognitive breakdown
  const cognitiveBreakdown = {
    memory: Math.round(
      (profile.gameStats.memory?.averageAccuracy || 0) * 0.4 +
      (profile.gameStats.path_memory?.averageAccuracy || 0) * 0.3 +
      (profile.gameStats.word_pair_match?.averageAccuracy || 0) * 0.3
    ),
    attention: Math.round(
      (profile.gameStats.attention?.averageAccuracy || 0) * 0.5 +
      (profile.gameStats.focus_filter?.averageAccuracy || 0) * 0.5
    ),
    speed: Math.round(
      100 - Math.min(100, (profile.gameStats.reflex?.averageTimeMs || 1000) / 10)
    ),
    processing: Math.round(
      (profile.gameStats.word_flash?.averageAccuracy || 0) * 0.4 +
      (profile.gameStats.blink_count?.averageAccuracy || 0) * 0.3 +
      (profile.gameStats.missing_number?.averageAccuracy || 0) * 0.3
    ),
  };

  // Main games to display reaction labels
  const mainGames: GameType[] = ['memory', 'attention', 'reflex', 'word_flash', 'shape_shadow', 'sequence_builder'];

  return (
    <div className="personalized-brain-card">
      {/* Cognitive Index - Main Display */}
      <div className="cognitive-index-display">
        <div className="index-circle">
          <svg viewBox="0 0 200 200" className="index-svg">
            <defs>
              <linearGradient id="indexGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00ffff" />
                <stop offset="50%" stopColor="#b45eff" />
                <stop offset="100%" stopColor="#ff00ff" />
              </linearGradient>
              <filter id="indexGlow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            {/* Background circle */}
            <circle
              cx="100"
              cy="100"
              r="80"
              fill="none"
              stroke="rgba(255, 255, 255, 0.1)"
              strokeWidth="12"
            />
            {/* Progress circle */}
            <circle
              cx="100"
              cy="100"
              r="80"
              fill="none"
              stroke="url(#indexGradient)"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${profile.cognitiveIndex * 5.03} 503`}
              transform="rotate(-90 100 100)"
              filter="url(#indexGlow)"
            />
          </svg>
          <div className="index-content">
            <div className="brain-emoji">🧠</div>
            <div className="index-value">{profile.cognitiveIndex}</div>
            <div className="index-label">Cognitive Index</div>
          </div>
        </div>
      </div>

      {/* Cognitive Breakdown */}
      <div className="cognitive-breakdown">
        <h3 className="breakdown-title">Cognitive Analytics</h3>
        <div className="breakdown-grid">
          <div className="breakdown-item">
            <div className="breakdown-icon">🧠</div>
            <div className="breakdown-info">
              <div className="breakdown-label">Memory</div>
              <div className="breakdown-bar">
                <div 
                  className="breakdown-fill breakdown-fill-memory"
                  style={{ width: `${cognitiveBreakdown.memory}%` }}
                />
              </div>
              <div className="breakdown-value">{cognitiveBreakdown.memory}</div>
            </div>
          </div>

          <div className="breakdown-item">
            <div className="breakdown-icon">👁️</div>
            <div className="breakdown-info">
              <div className="breakdown-label">Attention</div>
              <div className="breakdown-bar">
                <div 
                  className="breakdown-fill breakdown-fill-attention"
                  style={{ width: `${cognitiveBreakdown.attention}%` }}
                />
              </div>
              <div className="breakdown-value">{cognitiveBreakdown.attention}</div>
            </div>
          </div>

          <div className="breakdown-item">
            <div className="breakdown-icon">⚡</div>
            <div className="breakdown-info">
              <div className="breakdown-label">Speed</div>
              <div className="breakdown-bar">
                <div 
                  className="breakdown-fill breakdown-fill-speed"
                  style={{ width: `${cognitiveBreakdown.speed}%` }}
                />
              </div>
              <div className="breakdown-value">{cognitiveBreakdown.speed}</div>
            </div>
          </div>

          <div className="breakdown-item">
            <div className="breakdown-icon">🔄</div>
            <div className="breakdown-info">
              <div className="breakdown-label">Processing</div>
              <div className="breakdown-bar">
                <div 
                  className="breakdown-fill breakdown-fill-processing"
                  style={{ width: `${cognitiveBreakdown.processing}%` }}
                />
              </div>
              <div className="breakdown-value">{cognitiveBreakdown.processing}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Reaction Labels by Game */}
      <div className="reaction-labels">
        <h3 className="labels-title">⚡ Reaction Labels</h3>
        <div className="labels-grid">
          {mainGames.map(gameType => {
            const { label, score, color } = getReactionLabel(gameType);
            const gameName = gameType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            
            return (
              <div key={gameType} className="label-item">
                <div className="label-game-name">{gameName}</div>
                <div className="label-badge" style={{ borderColor: color, color: color }}>
                  <span className="label-text">{label}</span>
                  <span className="label-score">{score}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Skill Range Analytics */}
      <div className="skill-range-analytics">
        <h3 className="analytics-title">📊 Global Range Stats</h3>
        <div className="range-visualization">
          <div className="range-item">
            <div className="range-label">
              <span>Global Average</span>
              <span className="range-value">{cognitiveComparison?.globalAverage || 65}</span>
            </div>
            <div className="range-bar">
              <div className="range-fill range-fill-global" style={{ width: `${cognitiveComparison?.globalAverage || 65}%` }} />
              <div className="range-marker" style={{ left: `${cognitiveComparison?.globalAverage || 65}%` }}>
                <div className="marker-dot"></div>
              </div>
            </div>
          </div>

          <div className="range-item">
            <div className="range-label">
              <span>Your Score</span>
              <span className="range-value">{cognitiveComparison?.userCognitiveIndex || profile.cognitiveIndex}</span>
            </div>
            <div className="range-bar">
              <div className="range-fill range-fill-yours" style={{ width: `${cognitiveComparison?.userCognitiveIndex || profile.cognitiveIndex}%` }} />
              <div className="range-marker" style={{ left: `${cognitiveComparison?.userCognitiveIndex || profile.cognitiveIndex}%` }}>
                <div className="marker-dot marker-dot-you"></div>
              </div>
            </div>
          </div>

          <div className="range-item">
            <div className="range-label">
              <span>Top 10%</span>
              <span className="range-value">{cognitiveComparison?.top10Threshold || 85}</span>
            </div>
            <div className="range-bar">
              <div className="range-fill range-fill-top" style={{ width: `${cognitiveComparison?.top10Threshold || 85}%` }} />
              <div className="range-marker" style={{ left: `${cognitiveComparison?.top10Threshold || 85}%` }}>
                <div className="marker-dot marker-dot-top"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Performance Tag */}
        <div className="performance-tag">
          {(cognitiveComparison?.userCognitiveIndex || profile.cognitiveIndex) >= (cognitiveComparison?.top10Threshold || 85) ? (
            <div className="tag tag-elite">
              <span className="tag-icon">👑</span>
              <span className="tag-text">Elite Performance - Top 10%</span>
            </div>
          ) : (cognitiveComparison?.userCognitiveIndex || profile.cognitiveIndex) >= 75 ? (
            <div className="tag tag-excellent">
              <span className="tag-icon">⭐</span>
              <span className="tag-text">Excellent - Above Average</span>
            </div>
          ) : (cognitiveComparison?.userCognitiveIndex || profile.cognitiveIndex) >= (cognitiveComparison?.globalAverage || 65) ? (
            <div className="tag tag-good">
              <span className="tag-icon">✨</span>
              <span className="tag-text">Good - On Track</span>
            </div>
          ) : (
            <div className="tag tag-growing">
              <span className="tag-icon">🌱</span>
              <span className="tag-text">Growing - Keep Training</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PersonalizedBrainCard;
