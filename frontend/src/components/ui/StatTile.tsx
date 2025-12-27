import React from 'react';
import './StatTile.css';

interface StatTileProps {
  value: string | number;
  label: string;
  icon?: string;
  highlight?: boolean;
  color?: 'cyan' | 'pink' | 'green' | 'purple';
}

const StatTile: React.FC<StatTileProps> = ({ 
  value, 
  label, 
  icon, 
  highlight = false,
  color = 'cyan'
}) => {
  return (
    <div className={`stat-tile ${highlight ? 'stat-tile-highlight' : ''}`}>
      <div className="stat-tile-inner">
        {icon && <div className="stat-tile-icon">{icon}</div>}
        <div className={`stat-tile-value stat-tile-value-${color}`}>
          {value}
        </div>
        <div className="stat-tile-label">{label}</div>
      </div>
    </div>
  );
};

export default StatTile;
