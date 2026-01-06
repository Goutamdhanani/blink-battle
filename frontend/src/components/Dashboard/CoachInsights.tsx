import React from 'react';
import { CoachInsight } from '../../lib/dashboardCalculations';

interface CoachInsightsProps {
  insights: CoachInsight[];
}

const CoachInsights: React.FC<CoachInsightsProps> = ({ insights }) => {
  const getInsightIcon = (category: string): string => {
    switch (category) {
      case 'fatigue': return '😴';
      case 'plateau': return '📊';
      case 'improvement': return '🎉';
      case 'recommendation': return '💡';
      default: return '🤖';
    }
  };

  const getPriorityClass = (priority: string): string => {
    switch (priority) {
      case 'high': return 'priority-high';
      case 'medium': return 'priority-medium';
      case 'low': return 'priority-low';
      default: return '';
    }
  };

  if (insights.length === 0) {
    return (
      <div className="coach-insights">
        <h3 className="insights-title">Coach Insights</h3>
        <div className="insights-empty">
          <span className="empty-icon">🤖</span>
          <p>Play more games to unlock personalized insights</p>
        </div>
      </div>
    );
  }

  return (
    <div className="coach-insights">
      <h3 className="insights-title">Coach Insights</h3>
      
      <div className="insights-list">
        {insights.map((insight) => (
          <div 
            key={insight.id} 
            className={`insight-card ${getPriorityClass(insight.priority)}`}
          >
            <div className="insight-icon">{getInsightIcon(insight.category)}</div>
            <div className="insight-content">
              <p className="insight-message">{insight.message}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CoachInsights;
