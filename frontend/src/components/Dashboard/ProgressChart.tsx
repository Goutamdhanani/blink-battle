import React, { useState } from 'react';

interface ProgressChartProps {
  ciHistory: { date: string; ci: number }[];
  bestCI: number;
  currentCI: number;
  stability: { value: number; label: string };
}

const ProgressChart: React.FC<ProgressChartProps> = ({
  ciHistory,
  bestCI,
  currentCI,
  stability,
}) => {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'all'>('30d');

  const getFilteredHistory = () => {
    if (ciHistory.length === 0) return [];
    
    const now = Date.now();
    const cutoff = timeRange === '7d' 
      ? now - 7 * 24 * 60 * 60 * 1000
      : timeRange === '30d'
      ? now - 30 * 24 * 60 * 60 * 1000
      : 0;

    return ciHistory.filter(h => new Date(h.date).getTime() >= cutoff);
  };

  const filteredHistory = getFilteredHistory();
  const netChange = filteredHistory.length >= 2
    ? filteredHistory[filteredHistory.length - 1].ci - filteredHistory[0].ci
    : 0;

  const maxCI = Math.max(...filteredHistory.map(h => h.ci), 100);
  const minCI = Math.min(...filteredHistory.map(h => h.ci), 0);
  const range = maxCI - minCI || 1;

  const getChartPath = () => {
    if (filteredHistory.length === 0) return '';

    const width = 300;
    const height = 150;
    const padding = 10;

    const points = filteredHistory.map((h, i) => {
      const x = padding + (i / (filteredHistory.length - 1 || 1)) * (width - 2 * padding);
      const y = height - padding - ((h.ci - minCI) / range) * (height - 2 * padding);
      return `${x},${y}`;
    });

    return `M ${points.join(' L ')}`;
  };

  return (
    <div className="progress-chart">
      <div className="chart-header">
        <h3 className="chart-title">Progress Trajectory</h3>
        <div className="time-range-selector">
          <button 
            className={`time-btn ${timeRange === '7d' ? 'active' : ''}`}
            onClick={() => setTimeRange('7d')}
          >
            7D
          </button>
          <button 
            className={`time-btn ${timeRange === '30d' ? 'active' : ''}`}
            onClick={() => setTimeRange('30d')}
          >
            30D
          </button>
          <button 
            className={`time-btn ${timeRange === 'all' ? 'active' : ''}`}
            onClick={() => setTimeRange('all')}
          >
            ALL
          </button>
        </div>
      </div>

      <div className="chart-container">
        {filteredHistory.length >= 2 ? (
          <svg className="line-chart" viewBox="0 0 300 150" preserveAspectRatio="none">
            <defs>
              <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="var(--neon-cyan)" />
                <stop offset="100%" stopColor="var(--neon-purple)" />
              </linearGradient>
              <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="var(--neon-cyan)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="var(--neon-cyan)" stopOpacity="0" />
              </linearGradient>
            </defs>
            
            <path
              d={`${getChartPath()} L 300,150 L 10,150 Z`}
              fill="url(#areaGradient)"
            />
            
            <path
              d={getChartPath()}
              fill="none"
              stroke="url(#lineGradient)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />

            {filteredHistory.map((h, i) => {
              const width = 300;
              const height = 150;
              const padding = 10;
              const x = padding + (i / (filteredHistory.length - 1)) * (width - 2 * padding);
              const y = height - padding - ((h.ci - minCI) / range) * (height - 2 * padding);
              return (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r="3"
                  fill="var(--neon-cyan)"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>
        ) : (
          <div className="chart-empty">
            <p>Play more games to see your progress chart</p>
          </div>
        )}
      </div>

      <div className="chart-stats">
        <div className="chart-stat">
          <span className="stat-label">Best CI</span>
          <span className="stat-value">{bestCI}</span>
        </div>
        <div className="chart-stat">
          <span className="stat-label">Current CI</span>
          <span className="stat-value">{currentCI}</span>
        </div>
        <div className="chart-stat">
          <span className="stat-label">Net Change</span>
          <span className="stat-value" style={{ color: netChange >= 0 ? 'var(--success)' : 'var(--error)' }}>
            {netChange >= 0 ? '+' : ''}{netChange}
          </span>
        </div>
        <div className="chart-stat">
          <span className="stat-label">Stability</span>
          <span className="stat-value">{stability.label}</span>
        </div>
      </div>
    </div>
  );
};

export default ProgressChart;
