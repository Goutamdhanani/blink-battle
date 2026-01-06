import React, { useState } from 'react';
import { GameStats, GameType } from '../../games/types';

interface IndividualGamesProps {
  gameStats: Record<GameType, GameStats>;
  onGameSelect?: (gameType: GameType) => void;
}

const IndividualGames: React.FC<IndividualGamesProps> = ({ gameStats, onGameSelect }) => {
  const [expandedGame, setExpandedGame] = useState<GameType | null>(null);

  const allGames: { type: GameType; name: string; icon: string }[] = [
    { type: 'memory', name: 'Memory Match', icon: '🃏' },
    { type: 'attention', name: 'Focus Test', icon: '🎯' },
    { type: 'reflex', name: 'Reflex Rush', icon: '⚡' },
    { type: 'missing_number', name: 'Missing Number', icon: '🔢' },
    { type: 'sequence_builder', name: 'Sequence Builder', icon: '🔗' },
    { type: 'color_swap', name: 'Color Swap', icon: '🎨' },
    { type: 'path_memory', name: 'Path Memory', icon: '🗺️' },
    { type: 'focus_filter', name: 'Focus Filter', icon: '🔍' },
    { type: 'shape_shadow', name: 'Shape Shadow', icon: '🔷' },
    { type: 'word_flash', name: 'Word Flash', icon: '📝' },
    { type: 'reverse_recall', name: 'Reverse Recall', icon: '🔄' },
    { type: 'blink_count', name: 'Blink Count', icon: '👁️' },
    { type: 'word_pair_match', name: 'Word Pair Match', icon: '🔤' },
  ];

  const getTrend = (stats: GameStats): { icon: string; color: string } => {
    if (stats.gamesPlayed < 2) return { icon: '→', color: 'var(--text-secondary)' };
    
    const recentAvg = stats.averageScore;
    const bestScore = stats.bestScore;
    const ratio = recentAvg / (bestScore || 1);
    
    if (ratio >= 0.9) return { icon: '↑', color: 'var(--success)' };
    if (ratio >= 0.7) return { icon: '→', color: 'var(--text-secondary)' };
    return { icon: '↓', color: 'var(--error)' };
  };

  const toggleExpand = (gameType: GameType) => {
    setExpandedGame(expandedGame === gameType ? null : gameType);
  };

  return (
    <div className="individual-games">
      <h3 className="games-title">Individual Games</h3>
      
      <div className="games-grid">
        {allGames.map((game) => {
          const stats = gameStats[game.type];
          const trend = getTrend(stats);
          const isExpanded = expandedGame === game.type;
          const hasPlayed = stats.gamesPlayed > 0;

          return (
            <div 
              key={game.type} 
              className={`game-card ${isExpanded ? 'expanded' : ''} ${!hasPlayed ? 'unplayed' : ''}`}
            >
              <div className="game-card-header" onClick={() => hasPlayed && toggleExpand(game.type)}>
                <div className="game-icon">{game.icon}</div>
                <div className="game-info">
                  <h4 className="game-name">{game.name}</h4>
                  {hasPlayed ? (
                    <div className="game-quick-stats">
                      <span className="quick-stat">Best: {stats.bestScore}</span>
                      <span className="quick-stat">Avg: {stats.averageScore}</span>
                      <span 
                        className="quick-stat trend"
                        style={{ color: trend.color }}
                      >
                        {trend.icon}
                      </span>
                    </div>
                  ) : (
                    <div className="game-unplayed">Not played yet</div>
                  )}
                </div>
                {hasPlayed && (
                  <button className="expand-btn">
                    {isExpanded ? '▲' : '▼'}
                  </button>
                )}
              </div>

              {isExpanded && hasPlayed && (
                <div className="game-card-details">
                  <div className="detail-stats">
                    <div className="detail-stat">
                      <span className="detail-label">Sessions Played</span>
                      <span className="detail-value">{stats.gamesPlayed}</span>
                    </div>
                    <div className="detail-stat">
                      <span className="detail-label">Best Score</span>
                      <span className="detail-value">{stats.bestScore}</span>
                    </div>
                    <div className="detail-stat">
                      <span className="detail-label">Avg Score (Last 10)</span>
                      <span className="detail-value">{stats.averageScore}</span>
                    </div>
                    <div className="detail-stat">
                      <span className="detail-label">Avg Accuracy</span>
                      <span className="detail-value">{stats.averageAccuracy}%</span>
                    </div>
                    <div className="detail-stat">
                      <span className="detail-label">Highest Level</span>
                      <span className="detail-value">{stats.highestLevel}</span>
                    </div>
                    {stats.lastPlayed && (
                      <div className="detail-stat">
                        <span className="detail-label">Last Played</span>
                        <span className="detail-value">
                          {new Date(stats.lastPlayed).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>

                  {onGameSelect && (
                    <button 
                      className="play-again-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onGameSelect(game.type);
                      }}
                    >
                      Play Again
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default IndividualGames;
