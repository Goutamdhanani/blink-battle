/**
 * EnhancedResultsCard Component
 * 
 * Rich post-game feedback with percentiles, trends, and insights.
 */

import React from 'react';
import { GameScore, PercentileData } from '../../games/types';
import { AnimatedScore } from '../ui/AnimatedScore';
import { usePercentile } from '../../hooks/usePercentile';
import './EnhancedResultsCard.css';

interface EnhancedResultsCardProps {
  score: GameScore;
  previousBest?: number;
  trend?: 'improving' | 'stable' | 'declining';
  onClose: () => void;
}

export const EnhancedResultsCard: React.FC<EnhancedResultsCardProps> = ({
  score,
  previousBest,
  trend,
  onClose,
}) => {
  const { calculateMultiplePercentiles, getPerformanceTier } = usePercentile();
  
  const percentiles = calculateMultiplePercentiles(score);
  const scorePercentile = percentiles.find(p => p.metric === 'score');
  const tier = scorePercentile ? getPerformanceTier(scorePercentile.percentile) : null;

  const isPersonalBest = previousBest ? score.score > previousBest : false;
  const improvement = previousBest 
    ? Math.round(((score.score - previousBest) / previousBest) * 100)
    : 0;

  const getTrendIcon = () => {
    if (trend === 'improving') return '↑';
    if (trend === 'declining') return '↓';
    return '→';
  };

  const getTrendClass = () => {
    if (trend === 'improving') return 'trend-up';
    if (trend === 'declining') return 'trend-down';
    return 'trend-stable';
  };

  return (
    <div className="enhanced-results-overlay" onClick={onClose}>
      <div className="enhanced-results-card" onClick={(e) => e.stopPropagation()}>
        {/* Main Score */}
        <div className="results-main-score">
          <div className="score-value">
            <AnimatedScore 
              value={score.score} 
              duration={1500}
              className="big-score"
            />
          </div>
          {isPersonalBest && (
            <div className="personal-best-badge">
              🏆 Personal Best!
            </div>
          )}
        </div>

        {/* Quick Stats */}
        <div className="results-quick-stats">
          <div className="stat-item">
            <div className="stat-label">Accuracy</div>
            <div className="stat-value">
              <AnimatedScore value={score.accuracy} suffix="%" />
            </div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Level</div>
            <div className="stat-value">{score.level}</div>
          </div>
          {score.timeMs && (
            <div className="stat-item">
              <div className="stat-label">Time</div>
              <div className="stat-value">
                {(score.timeMs / 1000).toFixed(1)}s
              </div>
            </div>
          )}
        </div>

        {/* Performance Tier */}
        {tier && (
          <div className="performance-tier" style={{ borderColor: tier.color }}>
            <span className="tier-icon">{tier.icon}</span>
            <span className="tier-name">{tier.tier}</span>
          </div>
        )}

        {/* Percentile */}
        {scorePercentile && (
          <div className="percentile-section">
            <div className="percentile-bar-container">
              <div 
                className="percentile-bar-fill"
                style={{ width: `${scorePercentile.percentile}%` }}
              />
              <div className="percentile-marker" style={{ left: `${scorePercentile.percentile}%` }}>
                <div className="marker-dot" />
              </div>
            </div>
            <div className="percentile-label">
              {scorePercentile.label}
            </div>
          </div>
        )}

        {/* Improvement */}
        {previousBest && improvement !== 0 && (
          <div className={`improvement-section ${improvement > 0 ? 'positive' : 'negative'}`}>
            <span className="improvement-icon">
              {improvement > 0 ? '📈' : '📉'}
            </span>
            <span className="improvement-text">
              {improvement > 0 ? '+' : ''}{improvement}% vs last session
            </span>
          </div>
        )}

        {/* Trend */}
        {trend && (
          <div className={`trend-indicator ${getTrendClass()}`}>
            <span className="trend-icon">{getTrendIcon()}</span>
            <span className="trend-text">
              {trend === 'improving' && 'Your performance is improving!'}
              {trend === 'stable' && 'Consistent performance'}
              {trend === 'declining' && 'Consider taking a break'}
            </span>
          </div>
        )}

        {/* All Percentiles */}
        <div className="all-percentiles">
          {percentiles.map((p) => (
            <div key={p.metric} className="percentile-item">
              <span className="percentile-metric">
                {p.metric.charAt(0).toUpperCase() + p.metric.slice(1)}
              </span>
              <span className="percentile-value">{p.percentile}%</span>
            </div>
          ))}
        </div>

        {/* Close Button */}
        <button className="results-close-btn" onClick={onClose}>
          Continue
        </button>
      </div>
    </div>
  );
};
