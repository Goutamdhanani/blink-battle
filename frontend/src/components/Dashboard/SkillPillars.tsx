import React from 'react';
import { PillarScores, getPillarTier } from '../../lib/dashboardCalculations';

interface SkillPillarsProps {
  pillars: PillarScores;
}

const SkillPillars: React.FC<SkillPillarsProps> = ({ pillars }) => {
  const pillarData = [
    { key: 'processingSpeed', name: 'Processing Speed', score: pillars.processingSpeed },
    { key: 'workingMemory', name: 'Working Memory', score: pillars.workingMemory },
    { key: 'visualRecall', name: 'Visual Recall', score: pillars.visualRecall },
    { key: 'focusAttention', name: 'Focus & Attention', score: pillars.focusAttention },
    { key: 'reasoningPattern', name: 'Reasoning', score: pillars.reasoningPattern },
  ];

  const generateInsight = () => {
    const sorted = [...pillarData].sort((a, b) => b.score - a.score);
    const strongest = sorted[0];
    const weakest = sorted[sorted.length - 1];
    
    const parts: string[] = [];
    
    if (strongest.score >= 80) {
      parts.push(`Strong ${strongest.name.toLowerCase()}`);
    } else if (strongest.score >= 60) {
      parts.push(`Developing ${strongest.name.toLowerCase()}`);
    }
    
    const improving = sorted.filter(p => p.score >= 60 && p.score < 80);
    if (improving.length > 0) {
      parts.push(`${improving[0].name.toLowerCase()} improving`);
    }
    
    if (weakest.score < 60) {
      parts.push(`${weakest.name.toLowerCase()} inconsistent`);
    }
    
    return parts.length > 0 ? parts.join('. ') + '.' : 'Keep training to build your skills.';
  };

  const getRadarPoints = () => {
    const centerX = 125;
    const centerY = 125;
    const maxRadius = 100;
    const angleStep = (Math.PI * 2) / pillarData.length;
    
    const points = pillarData.map((pillar, i) => {
      const angle = i * angleStep - Math.PI / 2;
      const radius = (pillar.score / 100) * maxRadius;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      return `${x},${y}`;
    });
    
    return points.join(' ');
  };

  const getRadarGridPoints = (radiusPercent: number) => {
    const centerX = 125;
    const centerY = 125;
    const maxRadius = 100;
    const angleStep = (Math.PI * 2) / pillarData.length;
    
    const points = pillarData.map((_, i) => {
      const angle = i * angleStep - Math.PI / 2;
      const radius = (radiusPercent / 100) * maxRadius;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      return `${x},${y}`;
    });
    
    return points.join(' ');
  };

  const getLabelPosition = (index: number) => {
    const centerX = 125;
    const centerY = 125;
    const labelRadius = 115;
    const angleStep = (Math.PI * 2) / pillarData.length;
    const angle = index * angleStep - Math.PI / 2;
    
    const x = centerX + labelRadius * Math.cos(angle);
    const y = centerY + labelRadius * Math.sin(angle);
    
    return { x, y };
  };

  return (
    <div className="skill-pillars">
      <h3 className="pillars-title">Cognitive Pillars</h3>
      
      <div className="radar-chart-container">
        <svg className="radar-chart" viewBox="0 0 250 250">
          <defs>
            <radialGradient id="radarGradient">
              <stop offset="0%" stopColor="var(--neon-cyan)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--neon-purple)" stopOpacity="0.1" />
            </radialGradient>
          </defs>
          
          <polygon
            points={getRadarGridPoints(100)}
            fill="none"
            stroke="rgba(255, 255, 255, 0.1)"
            strokeWidth="1"
          />
          <polygon
            points={getRadarGridPoints(75)}
            fill="none"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth="1"
          />
          <polygon
            points={getRadarGridPoints(50)}
            fill="none"
            stroke="rgba(255, 255, 255, 0.06)"
            strokeWidth="1"
          />
          <polygon
            points={getRadarGridPoints(25)}
            fill="none"
            stroke="rgba(255, 255, 255, 0.04)"
            strokeWidth="1"
          />
          
          {pillarData.map((_, i) => {
            const start = getLabelPosition(i);
            return (
              <line
                key={i}
                x1="125"
                y1="125"
                x2={start.x}
                y2={start.y}
                stroke="rgba(255, 255, 255, 0.1)"
                strokeWidth="1"
              />
            );
          })}
          
          <polygon
            points={getRadarPoints()}
            fill="url(#radarGradient)"
            stroke="var(--neon-cyan)"
            strokeWidth="2"
          />
          
          {pillarData.map((pillar, i) => {
            const centerX = 125;
            const centerY = 125;
            const maxRadius = 100;
            const angleStep = (Math.PI * 2) / pillarData.length;
            const angle = i * angleStep - Math.PI / 2;
            const radius = (pillar.score / 100) * maxRadius;
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);
            
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="4"
                fill="var(--neon-cyan)"
                stroke="var(--background)"
                strokeWidth="2"
              />
            );
          })}
        </svg>
      </div>

      <div className="pillars-list">
        {pillarData.map((pillar) => (
          <div key={pillar.key} className="pillar-item">
            <div className="pillar-header">
              <span className="pillar-name">{pillar.name}</span>
              <span className="pillar-score">{pillar.score}</span>
            </div>
            <div className="pillar-tier">{getPillarTier(pillar.score)}</div>
            <div className="pillar-bar">
              <div 
                className="pillar-bar-fill" 
                style={{ width: `${pillar.score}%` }}
              ></div>
            </div>
          </div>
        ))}
      </div>

      <div className="pillars-insight">
        <span className="insight-icon">💡</span>
        <span className="insight-text">{generateInsight()}</span>
      </div>
    </div>
  );
};

export default SkillPillars;
