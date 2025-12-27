import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './BottomTabBar.css';

interface Tab {
  id: string;
  label: string;
  icon: string;
  path: string;
}

const tabs: Tab[] = [
  { id: 'home', label: 'Home', icon: '🏠', path: '/dashboard' },
  { id: 'history', label: 'History', icon: '📊', path: '/history' },
  { id: 'leaderboard', label: 'Leaders', icon: '🏆', path: '/leaderboard' },
];

const BottomTabBar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleTabClick = (path: string) => {
    navigate(path);
  };

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <div className="bottom-tab-bar">
      <div className="bottom-tab-bar-inner">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-button ${isActive(tab.path) ? 'tab-button-active' : ''}`}
            onClick={() => handleTabClick(tab.path)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default BottomTabBar;
