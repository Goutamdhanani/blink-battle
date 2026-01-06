/**
 * CognitiveInsights Component
 * 
 * Displays personalized insights and recommendations.
 */

import React from 'react';
import { PerformanceInsight } from '../../games/types';
import './CognitiveInsights.css';

interface CognitiveInsightsProps {
  insights: PerformanceInsight[];
}

export const CognitiveInsights: React.FC<CognitiveInsightsProps> = ({
  insights,
}) => {
  const getInsightIcon = (type: PerformanceInsight['type']) => {
    switch (type) {
      case 'strength': return '💪';
      case 'weakness': return '⚠️';
      case 'recommendation': return '💡';
      case 'achievement': return '🎯';
      default: return '📊';
    }
  };

  const getInsightClass = (type: PerformanceInsight['type']) => {
    return `insight-${type}`;
  };

  if (insights.length === 0) {
    return (
      <div className="cognitive-insights">
        <div className="insights-empty">
          <p>Play more games to unlock personalized insights!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cognitive-insights">
      <h3 className="insights-title">Your Cognitive Insights</h3>
      <div className="insights-list">
        {insights.map((insight) => (
          <div 
            key={insight.id} 
            className={`insight-card ${getInsightClass(insight.type)}`}
          >
            <div className="insight-header">
              <span className="insight-icon">{getInsightIcon(insight.type)}</span>
              <h4 className="insight-title">{insight.title}</h4>
            </div>
            <p className="insight-message">{insight.message}</p>
            
            {insight.suggestedGames && insight.suggestedGames.length > 0 && (
              <div className="suggested-games">
                <span className="suggested-label">Try these games:</span>
                <div className="game-tags">
                  {insight.suggestedGames.map((game) => (
                    <span key={game} className="game-tag">
                      {formatGameName(game)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            <div className="insight-footer">
              <div className="confidence-bar">
                <div 
                  className="confidence-fill"
                  style={{ width: `${insight.confidence * 100}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

function formatGameName(gameType: string): string {
  const names: Record<string, string> = {
    reflex: 'Reflex Rush',
    memory: 'Memory Match',
    attention: 'Focus Test',
    word_flash: 'Word Flash',
    shape_shadow: 'Shape Shadow',
    sequence_builder: 'Sequence Builder',
    focus_filter: 'Focus Filter',
    path_memory: 'Path Memory',
    missing_number: 'Missing Number',
    color_swap: 'Color Swap',
    reverse_recall: 'Reverse Recall',
    blink_count: 'Blink Count',
    word_pair_match: 'Word Pair',
  };
  return names[gameType] || gameType;
}
