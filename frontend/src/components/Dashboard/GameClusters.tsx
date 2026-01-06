import React, { useState } from 'react';
import { ClusterStats } from '../../lib/dashboardCalculations';

interface GameClustersProps {
  clusters: ClusterStats[];
}

const GameClusters: React.FC<GameClustersProps> = ({ clusters }) => {
  const [activeCluster, setActiveCluster] = useState(0);

  const getTrendIcon = (direction: string) => {
    switch (direction) {
      case 'up': return '↑';
      case 'down': return '↓';
      default: return '→';
    }
  };

  const getTrendColor = (direction: string) => {
    switch (direction) {
      case 'up': return 'var(--success)';
      case 'down': return 'var(--error)';
      default: return 'var(--text-secondary)';
    }
  };

  const getClusterIcon = (name: string) => {
    switch (name) {
      case 'Memory': return '🧠';
      case 'Focus': return '🎯';
      case 'Speed & Reaction': return '⚡';
      case 'Logic & Association': return '🧩';
      default: return '🎮';
    }
  };

  const handleSwipe = (direction: 'left' | 'right') => {
    if (direction === 'left' && activeCluster < clusters.length - 1) {
      setActiveCluster(activeCluster + 1);
    } else if (direction === 'right' && activeCluster > 0) {
      setActiveCluster(activeCluster - 1);
    }
  };

  return (
    <div className="game-clusters">
      <h3 className="clusters-title">Game Clusters</h3>
      
      <div className="cluster-carousel">
        <button 
          className="carousel-btn carousel-prev"
          onClick={() => handleSwipe('right')}
          disabled={activeCluster === 0}
        >
          ‹
        </button>

        <div className="cluster-cards-container">
          <div 
            className="cluster-cards" 
            style={{ transform: `translateX(-${activeCluster * 100}%)` }}
          >
            {clusters.map((cluster, index) => (
              <div key={index} className="cluster-card">
                <div className="cluster-icon">{getClusterIcon(cluster.name)}</div>
                <h4 className="cluster-name">{cluster.name}</h4>
                
                <div className="cluster-score-display">
                  <span className="cluster-score">{cluster.averageScore}</span>
                  <span 
                    className="cluster-trend"
                    style={{ color: getTrendColor(cluster.trend.direction) }}
                  >
                    {getTrendIcon(cluster.trend.direction)} {Math.abs(cluster.trend.percentChange)}%
                  </span>
                </div>

                {cluster.gamesPlayed > 0 ? (
                  <>
                    <div className="cluster-stats">
                      <div className="cluster-stat-item">
                        <span className="stat-label">Strongest</span>
                        <span className="stat-value">{cluster.bestGame || 'N/A'}</span>
                      </div>
                      <div className="cluster-stat-item">
                        <span className="stat-label">Weakest</span>
                        <span className="stat-value">{cluster.weakestGame || 'N/A'}</span>
                      </div>
                    </div>
                    
                    <div className="cluster-games-played">
                      {cluster.gamesPlayed} games played
                    </div>
                  </>
                ) : (
                  <div className="cluster-empty">
                    <p>No games played in this cluster yet</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <button 
          className="carousel-btn carousel-next"
          onClick={() => handleSwipe('left')}
          disabled={activeCluster === clusters.length - 1}
        >
          ›
        </button>
      </div>

      <div className="cluster-dots">
        {clusters.map((_, index) => (
          <button
            key={index}
            className={`cluster-dot ${index === activeCluster ? 'active' : ''}`}
            onClick={() => setActiveCluster(index)}
          />
        ))}
      </div>
    </div>
  );
};

export default GameClusters;
