import React, { useEffect, useState } from 'react';
import { GameType } from '../../games/types';
import { getAllScores } from '../../lib/indexedDB';
import { 
  calculateCognitiveIndex, 
  calculatePillarScores, 
  calculateStability,
  calculateGameClusters,
  generateCoachInsights,
  calculateStreakDays,
  calculateCIHistory,
} from '../../lib/dashboardCalculations';
import IdentityHeader from './IdentityHeader';
import ProgressChart from './ProgressChart';
import SkillPillars from './SkillPillars';
import GameClusters from './GameClusters';
import IndividualGames from './IndividualGames';
import ConsistencyTracker from './ConsistencyTracker';
import CoachInsights from './CoachInsights';
import HistoricalView from './HistoricalView';
import './Dashboard.css';

interface MasterDashboardProps {
  onBack: () => void;
  onGameSelect?: (gameType: GameType) => void;
  username?: string;
  level: number;
  xp: number;
  gameStats: any;
}

const MasterDashboard: React.FC<MasterDashboardProps> = ({
  onBack,
  onGameSelect,
  username,
  level,
  xp,
  gameStats,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<any>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);
      const allSessions = await getAllScores();
      
      const cognitiveIndex = calculateCognitiveIndex(allSessions);
      const ciHistory = calculateCIHistory(allSessions);
      
      const last7Sessions = allSessions.slice(-7);
      const prev7Sessions = allSessions.slice(-14, -7);
      const last7Avg = last7Sessions.length > 0 
        ? last7Sessions.reduce((sum, s) => sum + s.accuracy, 0) / last7Sessions.length 
        : 0;
      const prev7Avg = prev7Sessions.length > 0
        ? prev7Sessions.reduce((sum, s) => sum + s.accuracy, 0) / prev7Sessions.length
        : 0;
      const ciChange = prev7Avg > 0 ? ((last7Avg - prev7Avg) / prev7Avg) * 100 : 0;
      
      const pillars = calculatePillarScores(allSessions);
      const stability = calculateStability(ciHistory.map(h => h.ci));
      const clusters = calculateGameClusters(allSessions);
      const insights = generateCoachInsights(allSessions, pillars, ciHistory.map(h => h.ci));
      const streaks = calculateStreakDays(allSessions);
      
      const activityMap = ciHistory.map(h => ({
        date: h.date,
        played: true,
      }));
      
      const sessionDurations = allSessions.map(s => s.timeMs / 1000 / 60);
      const avgSessionDuration = sessionDurations.length > 0
        ? sessionDurations.reduce((sum, d) => sum + d, 0) / sessionDurations.length
        : 0;
      
      const bestCI = ciHistory.length > 0 
        ? Math.max(...ciHistory.map(h => h.ci))
        : cognitiveIndex;
      
      const xpToNextLevel = calculateXPToNextLevel(level);
      
      setDashboardData({
        cognitiveIndex,
        ciChange,
        ciHistory,
        pillars,
        stability,
        clusters,
        insights,
        streaks,
        activityMap,
        avgSessionDuration,
        bestCI,
        allSessions,
        xpToNextLevel,
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateXPToNextLevel = (currentLevel: number): number => {
    return 100 * Math.pow(1.5, currentLevel - 1);
  };

  if (isLoading) {
    return (
      <div className="master-dashboard loading">
        <div className="loading-spinner">
          <div className="spinner-icon">🧠</div>
          <p>Loading your cognitive profile...</p>
        </div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="master-dashboard error">
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          <p>Failed to load dashboard data</p>
          <button className="retry-btn" onClick={loadDashboardData}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const totalDays = 30;

  return (
    <div className="master-dashboard">
      <div className="dashboard-header">
        <button className="back-btn" onClick={onBack}>
          ← Back
        </button>
        <h1 className="dashboard-title">Master Dashboard</h1>
      </div>

      <div className="dashboard-scroll-container">
        <section className="dashboard-section">
          <IdentityHeader
            username={username}
            cognitiveIndex={dashboardData.cognitiveIndex}
            ciChange={dashboardData.ciChange}
            level={level}
            xp={xp}
            xpToNextLevel={dashboardData.xpToNextLevel}
          />
        </section>

        <section className="dashboard-section">
          <ProgressChart
            ciHistory={dashboardData.ciHistory}
            bestCI={dashboardData.bestCI}
            currentCI={dashboardData.cognitiveIndex}
            stability={dashboardData.stability}
          />
        </section>

        <section className="dashboard-section">
          <SkillPillars pillars={dashboardData.pillars} />
        </section>

        <section className="dashboard-section">
          <GameClusters clusters={dashboardData.clusters} />
        </section>

        <section className="dashboard-section">
          <IndividualGames 
            gameStats={gameStats} 
            onGameSelect={onGameSelect}
          />
        </section>

        <section className="dashboard-section">
          <ConsistencyTracker
            currentStreak={dashboardData.streaks.current}
            longestStreak={dashboardData.streaks.longest}
            activeDays={dashboardData.streaks.activeDays}
            totalDays={totalDays}
            avgSessionDuration={dashboardData.avgSessionDuration}
            activityMap={dashboardData.activityMap}
          />
        </section>

        <section className="dashboard-section">
          <CoachInsights insights={dashboardData.insights} />
        </section>

        <section className="dashboard-section">
          <HistoricalView allSessions={dashboardData.allSessions} />
        </section>
      </div>
    </div>
  );
};

export default MasterDashboard;
