import React from 'react';
import { getCILabel } from '../../lib/dashboardCalculations';

interface IdentityHeaderProps {
  username?: string;
  cognitiveIndex: number;
  ciChange: number;
  level: number;
  xp: number;
  xpToNextLevel: number;
}

const IdentityHeader: React.FC<IdentityHeaderProps> = ({
  username,
  cognitiveIndex,
  ciChange,
  level,
  xp,
  xpToNextLevel,
}) => {
  const xpProgress = xpToNextLevel > 0 ? (xp % xpToNextLevel) / xpToNextLevel * 100 : 0;
  const ciLabel = getCILabel(cognitiveIndex);
  
  const getTrendArrow = () => {
    if (ciChange > 2) return '↑';
    if (ciChange < -2) return '↓';
    return '→';
  };

  const getTrendColor = () => {
    if (ciChange > 2) return 'var(--success)';
    if (ciChange < -2) return 'var(--error)';
    return 'var(--text-secondary)';
  };

  return (
    <div className="identity-header">
      <div className="identity-avatar">
        <div className="avatar-circle">
          <span className="avatar-icon">👤</span>
        </div>
      </div>

      <div className="identity-info">
        <h2 className="identity-name">{username || 'Brain Trainer'}</h2>
        <div className="identity-level">
          <span className="level-badge">Level {level}</span>
          <span className="level-title">{ciLabel.split(' ')[0]}</span>
        </div>
        <div className="xp-progress-container">
          <div className="xp-progress-bar">
            <div 
              className="xp-progress-fill" 
              style={{ width: `${xpProgress}%` }}
            ></div>
          </div>
          <span className="xp-text">{Math.round(xpProgress)}% to Level {level + 1}</span>
        </div>
      </div>

      <div className="cognitive-index-display">
        <div className="ci-main">
          <div className="ci-value">{cognitiveIndex}</div>
          <div className="ci-trend" style={{ color: getTrendColor() }}>
            <span className="trend-arrow">{getTrendArrow()}</span>
            <span className="trend-value">{Math.abs(ciChange)}%</span>
          </div>
        </div>
        <div className="ci-label">Cognitive Index</div>
        <div className="ci-description">{ciLabel}</div>
      </div>
    </div>
  );
};

export default IdentityHeader;
