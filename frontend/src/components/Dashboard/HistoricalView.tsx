import React, { useState } from 'react';
import { GameScore, GameType } from '../../games/types';

interface HistoricalViewProps {
  allSessions: GameScore[];
}

const HistoricalView: React.FC<HistoricalViewProps> = ({ allSessions }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [filterGame, setFilterGame] = useState<GameType | 'all'>('all');
  const [filterDays, setFilterDays] = useState<number>(30);

  const allGameTypes: GameType[] = [
    'memory', 'attention', 'reflex', 'word_flash', 'shape_shadow',
    'sequence_builder', 'focus_filter', 'path_memory', 'missing_number',
    'color_swap', 'reverse_recall', 'blink_count', 'word_pair_match'
  ];

  const getFilteredSessions = () => {
    let filtered = allSessions;
    
    if (filterGame !== 'all') {
      filtered = filtered.filter(s => s.gameType === filterGame);
    }
    
    const cutoff = Date.now() - (filterDays * 24 * 60 * 60 * 1000);
    filtered = filtered.filter(s => s.timestamp >= cutoff);
    
    return filtered.sort((a, b) => b.timestamp - a.timestamp);
  };

  const filteredSessions = getFilteredSessions();

  const exportToCSV = () => {
    const headers = ['Date', 'Time', 'Game', 'Score', 'Accuracy', 'Time (ms)', 'Level'];
    const rows = filteredSessions.map(s => [
      new Date(s.timestamp).toLocaleDateString(),
      new Date(s.timestamp).toLocaleTimeString(),
      s.gameType,
      s.score,
      s.accuracy,
      s.timeMs,
      s.level,
    ]);
    
    const csv = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `brain-training-history-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isExpanded) {
    return (
      <div className="historical-view collapsed">
        <button 
          className="expand-historical-btn"
          onClick={() => setIsExpanded(true)}
        >
          <span>📊</span>
          <span>View Historical Data & Export</span>
          <span>▼</span>
        </button>
      </div>
    );
  }

  return (
    <div className="historical-view">
      <div className="historical-header">
        <h3 className="historical-title">Historical Deep Dive</h3>
        <button 
          className="collapse-btn"
          onClick={() => setIsExpanded(false)}
        >
          ▲
        </button>
      </div>

      <div className="historical-filters">
        <div className="filter-group">
          <label htmlFor="game-filter">Game</label>
          <select 
            id="game-filter"
            value={filterGame} 
            onChange={(e) => setFilterGame(e.target.value as GameType | 'all')}
          >
            <option value="all">All Games</option>
            {allGameTypes.map(game => (
              <option key={game} value={game}>{game}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="time-filter">Time Range</label>
          <select 
            id="time-filter"
            value={filterDays} 
            onChange={(e) => setFilterDays(Number(e.target.value))}
          >
            <option value={7}>Last 7 Days</option>
            <option value={30}>Last 30 Days</option>
            <option value={90}>Last 90 Days</option>
            <option value={365}>Last Year</option>
            <option value={99999}>All Time</option>
          </select>
        </div>

        <button className="export-btn" onClick={exportToCSV}>
          📥 Export CSV
        </button>
      </div>

      <div className="sessions-table-container">
        <table className="sessions-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Game</th>
              <th>Score</th>
              <th>Accuracy</th>
              <th>Level</th>
            </tr>
          </thead>
          <tbody>
            {filteredSessions.length > 0 ? (
              filteredSessions.slice(0, 50).map((session, index) => (
                <tr key={index}>
                  <td>{new Date(session.timestamp).toLocaleString()}</td>
                  <td>{session.gameType}</td>
                  <td>{session.score}</td>
                  <td>{session.accuracy}%</td>
                  <td>{session.level}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="no-data">No sessions found</td>
              </tr>
            )}
          </tbody>
        </table>
        {filteredSessions.length > 50 && (
          <div className="table-footer">
            Showing 50 of {filteredSessions.length} sessions
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoricalView;
