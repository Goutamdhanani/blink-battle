import { GameScore, GameType } from '../games/types';

export interface PillarScores {
  processingSpeed: number;
  workingMemory: number;
  visualRecall: number;
  focusAttention: number;
  reasoningPattern: number;
}

export interface StabilityScore {
  value: number;
  label: 'Stable' | 'Volatile' | 'Inconsistent';
}

export interface TrendData {
  direction: 'up' | 'down' | 'stable';
  percentChange: number;
  isImproving: boolean;
}

export interface ClusterStats {
  name: string;
  games: GameType[];
  averageScore: number;
  trend: TrendData;
  bestGame: string;
  weakestGame: string;
  gamesPlayed: number;
}

export interface CoachInsight {
  id: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
  category: 'fatigue' | 'plateau' | 'improvement' | 'recommendation';
}

const PILLAR_GAME_MAPPING: Record<keyof PillarScores, GameType[]> = {
  processingSpeed: ['reflex', 'color_swap'],
  workingMemory: ['sequence_builder', 'reverse_recall', 'word_flash'],
  visualRecall: ['memory', 'path_memory', 'shape_shadow'],
  focusAttention: ['attention', 'focus_filter', 'blink_count'],
  reasoningPattern: ['missing_number', 'word_pair_match'],
};

export function calculateCognitiveIndex(sessions: GameScore[]): number {
  if (sessions.length === 0) return 0;

  const last30Sessions = sessions.slice(-30);
  
  const pillarScores = calculatePillarScores(last30Sessions);
  
  const ci = 
    0.25 * pillarScores.processingSpeed +
    0.25 * pillarScores.workingMemory +
    0.20 * pillarScores.focusAttention +
    0.15 * pillarScores.visualRecall +
    0.15 * pillarScores.reasoningPattern;
  
  return Math.round(Math.min(100, Math.max(0, ci)));
}

export function calculatePillarScores(sessions: GameScore[]): PillarScores {
  const scores: PillarScores = {
    processingSpeed: 0,
    workingMemory: 0,
    visualRecall: 0,
    focusAttention: 0,
    reasoningPattern: 0,
  };

  if (sessions.length === 0) return scores;

  for (const pillar in PILLAR_GAME_MAPPING) {
    const gameTypes = PILLAR_GAME_MAPPING[pillar as keyof PillarScores];
    const relevantSessions = sessions.filter(s => gameTypes.includes(s.gameType));
    
    if (relevantSessions.length > 0) {
      const last20 = relevantSessions.slice(-20);
      const avgAccuracy = last20.reduce((sum, s) => sum + s.accuracy, 0) / last20.length;
      scores[pillar as keyof PillarScores] = Math.round(avgAccuracy);
    }
  }

  return scores;
}

export function calculateStability(ciHistory: number[]): StabilityScore {
  if (ciHistory.length < 2) {
    return { value: 100, label: 'Stable' };
  }

  const last14 = ciHistory.slice(-14);
  const mean = last14.reduce((sum, val) => sum + val, 0) / last14.length;
  const variance = last14.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / last14.length;
  const stdDev = Math.sqrt(variance);

  const stabilityValue = stdDev === 0 ? 100 : Math.round(100 / (1 + stdDev / 10));

  let label: 'Stable' | 'Volatile' | 'Inconsistent';
  if (stabilityValue >= 80) {
    label = 'Stable';
  } else if (stabilityValue >= 50) {
    label = 'Volatile';
  } else {
    label = 'Inconsistent';
  }

  return { value: stabilityValue, label };
}

export function detectFatigue(sessions: GameScore[]): boolean {
  if (sessions.length < 5) return false;

  const sessionsByDate: { [date: string]: GameScore[] } = {};
  sessions.forEach(session => {
    const date = new Date(session.timestamp).toDateString();
    if (!sessionsByDate[date]) sessionsByDate[date] = [];
    sessionsByDate[date].push(session);
  });

  for (const date in sessionsByDate) {
    const daySessions = sessionsByDate[date].sort((a, b) => a.timestamp - b.timestamp);
    if (daySessions.length >= 5) {
      const firstHalf = daySessions.slice(0, Math.floor(daySessions.length / 2));
      const secondHalf = daySessions.slice(Math.floor(daySessions.length / 2));
      
      const firstHalfAvg = firstHalf.reduce((sum, s) => sum + s.accuracy, 0) / firstHalf.length;
      const secondHalfAvg = secondHalf.reduce((sum, s) => sum + s.accuracy, 0) / secondHalf.length;
      
      if (firstHalfAvg - secondHalfAvg > 15) {
        return true;
      }
    }
  }

  return false;
}

export function identifyWeakPillar(pillars: PillarScores): string {
  const entries = Object.entries(pillars) as [keyof PillarScores, number][];
  const sorted = entries.sort((a, b) => a[1] - b[1]);
  
  const weakest = sorted[0];
  const pillarNames: Record<keyof PillarScores, string> = {
    processingSpeed: 'Processing Speed',
    workingMemory: 'Working Memory',
    visualRecall: 'Visual Recall',
    focusAttention: 'Focus & Attention',
    reasoningPattern: 'Reasoning & Pattern Recognition',
  };
  
  return pillarNames[weakest[0]];
}

export function calculateClusterTrend(clusterSessions: GameScore[], timeRangeDays: number = 30): TrendData {
  if (clusterSessions.length < 2) {
    return { direction: 'stable', percentChange: 0, isImproving: false };
  }

  const cutoffDate = Date.now() - (timeRangeDays * 24 * 60 * 60 * 1000);
  const recentSessions = clusterSessions.filter(s => s.timestamp >= cutoffDate);

  if (recentSessions.length < 2) {
    return { direction: 'stable', percentChange: 0, isImproving: false };
  }

  const sorted = recentSessions.sort((a, b) => a.timestamp - b.timestamp);
  const midpoint = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, midpoint);
  const secondHalf = sorted.slice(midpoint);

  const firstAvg = firstHalf.reduce((sum, s) => sum + s.accuracy, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((sum, s) => sum + s.accuracy, 0) / secondHalf.length;

  const percentChange = firstAvg === 0 ? 0 : ((secondAvg - firstAvg) / firstAvg) * 100;

  let direction: 'up' | 'down' | 'stable';
  if (percentChange > 5) {
    direction = 'up';
  } else if (percentChange < -5) {
    direction = 'down';
  } else {
    direction = 'stable';
  }

  return {
    direction,
    percentChange: Math.round(percentChange),
    isImproving: percentChange > 0,
  };
}

export function normalizeScore(score: number, gameType: GameType): number {
  const maxScores: Partial<Record<GameType, number>> = {
    memory: 100,
    attention: 100,
    reflex: 100,
    word_flash: 100,
    shape_shadow: 100,
    sequence_builder: 100,
    focus_filter: 100,
    path_memory: 100,
    missing_number: 100,
    color_swap: 100,
    reverse_recall: 100,
    blink_count: 100,
    word_pair_match: 100,
  };

  const maxScore = maxScores[gameType] || 100;
  return Math.round((score / maxScore) * 100);
}

export function calculateGameClusters(sessions: GameScore[]): ClusterStats[] {
  const clusters: ClusterStats[] = [
    {
      name: 'Memory',
      games: ['memory', 'sequence_builder', 'reverse_recall', 'word_flash', 'path_memory'],
      averageScore: 0,
      trend: { direction: 'stable', percentChange: 0, isImproving: false },
      bestGame: '',
      weakestGame: '',
      gamesPlayed: 0,
    },
    {
      name: 'Focus',
      games: ['attention', 'focus_filter', 'blink_count', 'color_swap'],
      averageScore: 0,
      trend: { direction: 'stable', percentChange: 0, isImproving: false },
      bestGame: '',
      weakestGame: '',
      gamesPlayed: 0,
    },
    {
      name: 'Speed & Reaction',
      games: ['reflex', 'color_swap'],
      averageScore: 0,
      trend: { direction: 'stable', percentChange: 0, isImproving: false },
      bestGame: '',
      weakestGame: '',
      gamesPlayed: 0,
    },
    {
      name: 'Logic & Association',
      games: ['missing_number', 'word_pair_match'],
      averageScore: 0,
      trend: { direction: 'stable', percentChange: 0, isImproving: false },
      bestGame: '',
      weakestGame: '',
      gamesPlayed: 0,
    },
  ];

  clusters.forEach(cluster => {
    const clusterSessions = sessions.filter(s => cluster.games.includes(s.gameType));
    
    if (clusterSessions.length > 0) {
      cluster.gamesPlayed = clusterSessions.length;
      cluster.averageScore = Math.round(
        clusterSessions.reduce((sum, s) => sum + s.accuracy, 0) / clusterSessions.length
      );
      cluster.trend = calculateClusterTrend(clusterSessions, 30);

      const gameScores: Record<string, number> = {};
      cluster.games.forEach(game => {
        const gameSessions = clusterSessions.filter(s => s.gameType === game);
        if (gameSessions.length > 0) {
          gameScores[game] = gameSessions.reduce((sum, s) => sum + s.accuracy, 0) / gameSessions.length;
        }
      });

      const sortedGames = Object.entries(gameScores).sort((a, b) => b[1] - a[1]);
      if (sortedGames.length > 0) {
        cluster.bestGame = formatGameName(sortedGames[0][0]);
        cluster.weakestGame = formatGameName(sortedGames[sortedGames.length - 1][0]);
      }
    }
  });

  return clusters;
}

export function generateCoachInsights(
  sessions: GameScore[],
  pillars: PillarScores,
  ciHistory: number[]
): CoachInsight[] {
  const insights: CoachInsight[] = [];

  if (detectFatigue(sessions)) {
    insights.push({
      id: 'fatigue_detected',
      message: 'Performance drops after extended sessions. Try shorter, focused training periods.',
      priority: 'high',
      category: 'fatigue',
    });
  }

  const weakPillar = identifyWeakPillar(pillars);
  const weakPillarScore = Math.min(...Object.values(pillars));
  if (weakPillarScore < 60 && sessions.length >= 10) {
    insights.push({
      id: 'weak_pillar',
      message: `${weakPillar} could use improvement. Focus on related games this week.`,
      priority: 'medium',
      category: 'recommendation',
    });
  }

  if (ciHistory.length >= 10) {
    const last10 = ciHistory.slice(-10);
    const variance = calculateStability(last10);
    if (variance.label === 'Inconsistent') {
      insights.push({
        id: 'inconsistent_performance',
        message: 'Performance varies significantly. Establish a consistent training routine.',
        priority: 'medium',
        category: 'recommendation',
      });
    }
  }

  if (ciHistory.length >= 14) {
    const last7 = ciHistory.slice(-7);
    const prev7 = ciHistory.slice(-14, -7);
    const last7Avg = last7.reduce((sum, v) => sum + v, 0) / last7.length;
    const prev7Avg = prev7.reduce((sum, v) => sum + v, 0) / prev7.length;
    const diff = Math.abs(last7Avg - prev7Avg);
    
    if (diff < 2 && last7Avg < 85) {
      insights.push({
        id: 'plateau_detected',
        message: 'Progress has plateaued. Try switching game focus to challenge different skills.',
        priority: 'medium',
        category: 'plateau',
      });
    } else if (last7Avg - prev7Avg > 5) {
      insights.push({
        id: 'improving_trend',
        message: 'Great progress this week! Maintain your current training plan.',
        priority: 'low',
        category: 'improvement',
      });
    }
  }

  const sessionsByHour: Record<number, GameScore[]> = {};
  sessions.forEach(session => {
    const hour = new Date(session.timestamp).getHours();
    if (!sessionsByHour[hour]) sessionsByHour[hour] = [];
    sessionsByHour[hour].push(session);
  });

  const hourPerformance = Object.entries(sessionsByHour)
    .map(([hour, sessions]) => ({
      hour: parseInt(hour),
      avgAccuracy: sessions.reduce((sum, s) => sum + s.accuracy, 0) / sessions.length,
      count: sessions.length,
    }))
    .filter(h => h.count >= 3)
    .sort((a, b) => b.avgAccuracy - a.avgAccuracy);

  if (hourPerformance.length >= 2 && hourPerformance[0].avgAccuracy - hourPerformance[hourPerformance.length - 1].avgAccuracy > 15) {
    const bestHour = hourPerformance[0].hour;
    const timeRange = bestHour < 12 ? 'morning' : bestHour < 17 ? 'afternoon' : 'evening';
    insights.push({
      id: 'time_of_day',
      message: `Performance peaks in the ${timeRange}. Schedule important training during this time.`,
      priority: 'low',
      category: 'recommendation',
    });
  }

  return insights.slice(0, 2);
}

export function calculateStreakDays(sessions: GameScore[]): { current: number; longest: number; activeDays: number } {
  if (sessions.length === 0) {
    return { current: 0, longest: 0, activeDays: 0 };
  }

  const uniqueDates = new Set(
    sessions.map(s => new Date(s.timestamp).toDateString())
  );
  const sortedDates = Array.from(uniqueDates).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 1;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toDateString();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();

  if (sortedDates.includes(todayStr)) {
    currentStreak = 1;
  } else if (sortedDates.includes(yesterdayStr)) {
    currentStreak = 1;
  } else {
    currentStreak = 0;
  }

  if (currentStreak > 0) {
    let checkDate = new Date(sortedDates.includes(todayStr) ? today : yesterday);
    checkDate.setDate(checkDate.getDate() - 1);
    
    while (sortedDates.includes(checkDate.toDateString())) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }
  }

  for (let i = 1; i < sortedDates.length; i++) {
    const prevDate = new Date(sortedDates[i - 1]);
    const currDate = new Date(sortedDates[i]);
    const diffDays = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      tempStreak++;
    } else {
      longestStreak = Math.max(longestStreak, tempStreak);
      tempStreak = 1;
    }
  }
  longestStreak = Math.max(longestStreak, tempStreak);

  return {
    current: currentStreak,
    longest: longestStreak,
    activeDays: uniqueDates.size,
  };
}

export function smoothCIHistory(ciHistory: number[], windowSize: number = 3): number[] {
  if (ciHistory.length < windowSize) return ciHistory;

  const smoothed: number[] = [];
  for (let i = 0; i < ciHistory.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(ciHistory.length, i + Math.floor(windowSize / 2) + 1);
    const window = ciHistory.slice(start, end);
    const avg = window.reduce((sum, val) => sum + val, 0) / window.length;
    smoothed.push(Math.round(avg));
  }

  return smoothed;
}

export function calculateCIHistory(sessions: GameScore[], intervalDays: number = 1): { date: string; ci: number }[] {
  if (sessions.length === 0) return [];

  const sessionsByDate: Record<string, GameScore[]> = {};
  sessions.forEach(session => {
    const date = new Date(session.timestamp).toDateString();
    if (!sessionsByDate[date]) sessionsByDate[date] = [];
    sessionsByDate[date].push(session);
  });

  const dates = Object.keys(sessionsByDate).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  
  const history: { date: string; ci: number }[] = [];
  let cumulativeSessions: GameScore[] = [];

  dates.forEach(date => {
    cumulativeSessions = [...cumulativeSessions, ...sessionsByDate[date]];
    const ci = calculateCognitiveIndex(cumulativeSessions);
    history.push({ date, ci });
  });

  return history;
}

function formatGameName(gameType: string): string {
  const names: Record<string, string> = {
    memory: 'Memory Match',
    attention: 'Focus Test',
    reflex: 'Reflex Rush',
    word_flash: 'Word Flash',
    shape_shadow: 'Shape Shadow',
    sequence_builder: 'Sequence Builder',
    focus_filter: 'Focus Filter',
    path_memory: 'Path Memory',
    missing_number: 'Missing Number',
    color_swap: 'Color Swap',
    reverse_recall: 'Reverse Recall',
    blink_count: 'Blink Count',
    word_pair_match: 'Word Pair Match',
  };
  return names[gameType] || gameType;
}

export function getPillarTier(score: number): string {
  if (score >= 90) return 'Expert';
  if (score >= 75) return 'Advanced';
  if (score >= 60) return 'Competent';
  if (score >= 40) return 'Developing';
  return 'Beginner';
}

export function getCILabel(ci: number): string {
  if (ci >= 90) return 'Elite & Exceptional';
  if (ci >= 80) return 'Sharp & Stable';
  if (ci >= 70) return 'Above Average';
  if (ci >= 60) return 'Developing Well';
  if (ci >= 50) return 'Moderate Progress';
  return 'Building Foundation';
}
