import React from 'react';

interface ConsistencyTrackerProps {
  currentStreak: number;
  longestStreak: number;
  activeDays: number;
  totalDays: number;
  avgSessionDuration: number;
  activityMap: { date: string; played: boolean }[];
}

const ConsistencyTracker: React.FC<ConsistencyTrackerProps> = ({
  currentStreak,
  longestStreak,
  activeDays,
  totalDays,
  avgSessionDuration,
  activityMap,
}) => {
  const getActivityLevel = (date: string): number => {
    const activity = activityMap.find(a => a.date === date);
    return activity?.played ? 1 : 0;
  };

  const getLast30Days = () => {
    const days: { date: string; dayName: string; level: number }[] = [];
    const today = new Date();
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toDateString();
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      
      days.push({
        date: dateStr,
        dayName,
        level: getActivityLevel(dateStr),
      });
    }
    
    return days;
  };

  const last30Days = getLast30Days();
  const weekRows: typeof last30Days[] = [];
  for (let i = 0; i < last30Days.length; i += 7) {
    weekRows.push(last30Days.slice(i, i + 7));
  }

  const formatDuration = (minutes: number): string => {
    if (minutes < 1) return '< 1 min';
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  return (
    <div className="consistency-tracker">
      <h3 className="tracker-title">Consistency & Habits</h3>
      
      <div className="streak-stats">
        <div className="streak-stat">
          <div className="streak-icon">🔥</div>
          <div className="streak-info">
            <span className="streak-value">{currentStreak}</span>
            <span className="streak-label">Day Streak</span>
          </div>
        </div>
        <div className="streak-stat">
          <div className="streak-icon">🏆</div>
          <div className="streak-info">
            <span className="streak-value">{longestStreak}</span>
            <span className="streak-label">Longest Streak</span>
          </div>
        </div>
        <div className="streak-stat">
          <div className="streak-icon">📅</div>
          <div className="streak-info">
            <span className="streak-value">{activeDays}/{totalDays}</span>
            <span className="streak-label">Active Days</span>
          </div>
        </div>
      </div>

      <div className="activity-heatmap">
        <h4 className="heatmap-title">Last 30 Days</h4>
        <div className="heatmap-grid">
          {weekRows.map((week, weekIndex) => (
            <div key={weekIndex} className="heatmap-week">
              {week.map((day, dayIndex) => (
                <div
                  key={dayIndex}
                  className={`heatmap-day ${day.level > 0 ? 'active' : ''}`}
                  title={`${day.date}${day.level > 0 ? ' - Played' : ' - No activity'}`}
                >
                  <div className="day-label">{day.dayName[0]}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="heatmap-legend">
          <span className="legend-label">Less</span>
          <div className="legend-item legend-level-0"></div>
          <div className="legend-item legend-level-1"></div>
          <span className="legend-label">More</span>
        </div>
      </div>

      <div className="habit-insights">
        <div className="habit-item">
          <span className="habit-icon">⏱️</span>
          <div className="habit-info">
            <span className="habit-label">Avg Session</span>
            <span className="habit-value">{formatDuration(avgSessionDuration)}</span>
          </div>
        </div>
        <div className="habit-item">
          <span className="habit-icon">📊</span>
          <div className="habit-info">
            <span className="habit-label">Consistency Rate</span>
            <span className="habit-value">
              {totalDays > 0 ? Math.round((activeDays / totalDays) * 100) : 0}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConsistencyTracker;
