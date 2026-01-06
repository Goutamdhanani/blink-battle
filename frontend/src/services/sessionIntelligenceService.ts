/**
 * Session Intelligence Service
 * 
 * Tracks session patterns including warm-up detection, fatigue tracking,
 * and time-of-day performance optimization.
 */

import { SessionMetrics, GameScore } from '../games/types';

const STORAGE_KEY = 'blink_battle_session_intelligence';
const WARMUP_THRESHOLD_GAMES = 2;
const FATIGUE_THRESHOLD_GAMES = 10;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

interface SessionData {
  currentSession: SessionMetrics | null;
  sessionHistory: SessionMetrics[];
  lastGameTime: number;
  sessionScores: number[]; // Track scores within current session for trend calculation
}

class SessionIntelligenceService {
  private data: SessionData = {
    currentSession: null,
    sessionHistory: [],
    lastGameTime: 0,
    sessionScores: [],
  };

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Record a game and update session metrics
   */
  recordGame(score: GameScore): SessionMetrics {
    const now = Date.now();
    
    // Check if we should start a new session
    if (this.shouldStartNewSession(now)) {
      this.startNewSession(now);
    }

    const session = this.data.currentSession!;
    session.gamesPlayed++;
    this.data.lastGameTime = now;

    // Update performance metrics
    this.updatePerformanceMetrics(session, score);

    // Detect warm-up phase
    if (session.gamesPlayed <= WARMUP_THRESHOLD_GAMES) {
      session.isWarmUp = true;
    } else {
      session.isWarmUp = false;
    }

    // Detect fatigue
    if (session.gamesPlayed >= FATIGUE_THRESHOLD_GAMES) {
      session.fatigueDetected = this.detectFatigue(session);
    }

    this.saveToStorage();
    return { ...session };
  }

  /**
   * Get current session metrics
   */
  getCurrentSession(): SessionMetrics | null {
    if (!this.data.currentSession) {
      return null;
    }
    return { ...this.data.currentSession };
  }

  /**
   * Check if a new session should start
   */
  private shouldStartNewSession(now: number): boolean {
    // No current session
    if (!this.data.currentSession) {
      return true;
    }

    // Session timeout
    const timeSinceLastGame = now - this.data.lastGameTime;
    if (timeSinceLastGame > SESSION_TIMEOUT_MS) {
      // Archive current session
      this.archiveCurrentSession();
      return true;
    }

    return false;
  }

  /**
   * Start a new session
   */
  private startNewSession(now: number): void {
    const timeOfDay = this.getTimeOfDay(now);

    this.data.currentSession = {
      sessionId: `session_${now}`,
      startTime: now,
      gamesPlayed: 0,
      isWarmUp: true,
      fatigueDetected: false,
      performanceTrend: 'stable',
      averagePerformance: 0,
      timeOfDay,
    };
    
    // Reset session scores
    this.data.sessionScores = [];
  }

  /**
   * Archive current session to history
   */
  private archiveCurrentSession(): void {
    if (this.data.currentSession) {
      this.data.currentSession.endTime = Date.now();
      this.data.sessionHistory.push(this.data.currentSession);

      // Keep only last 50 sessions
      if (this.data.sessionHistory.length > 50) {
        this.data.sessionHistory = this.data.sessionHistory.slice(-50);
      }
    }
  }

  /**
   * Update performance metrics for session
   */
  private updatePerformanceMetrics(session: SessionMetrics, score: GameScore): void {
    // Track individual scores for trend calculation
    this.data.sessionScores.push(score.accuracy);
    
    // Simple moving average
    const currentAvg = session.averagePerformance;
    const newScore = score.accuracy;
    
    session.averagePerformance = 
      session.gamesPlayed === 1 
        ? newScore 
        : (currentAvg * (session.gamesPlayed - 1) + newScore) / session.gamesPlayed;

    // Determine performance trend (needs at least 4 games)
    if (session.gamesPlayed >= 4) {
      session.performanceTrend = this.calculateTrend();
    }
  }

  /**
   * Calculate performance trend based on score progression
   */
  private calculateTrend(): 'improving' | 'stable' | 'declining' {
    const scores = this.data.sessionScores;
    if (scores.length < 4) {
      return 'stable';
    }
    
    // Compare first half vs second half of session
    const midPoint = Math.floor(scores.length / 2);
    const firstHalf = scores.slice(0, midPoint);
    const secondHalf = scores.slice(midPoint);
    
    const avgFirst = firstHalf.reduce((sum, s) => sum + s, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((sum, s) => sum + s, 0) / secondHalf.length;
    
    const difference = avgSecond - avgFirst;
    
    // Threshold of 5% change
    if (difference > 5) return 'improving';
    if (difference < -5) return 'declining';
    return 'stable';
  }

  /**
   * Detect fatigue based on performance decline
   */
  private detectFatigue(session: SessionMetrics): boolean {
    // Fatigue is detected if:
    // 1. Playing for extended period (>10 games)
    // 2. Performance is declining
    
    if (session.gamesPlayed < FATIGUE_THRESHOLD_GAMES) {
      return false;
    }

    // Check if performance trend is declining
    if (session.performanceTrend === 'declining') {
      return true;
    }

    // Check session duration (over 1 hour)
    const duration = Date.now() - session.startTime;
    if (duration > 60 * 60 * 1000 && session.gamesPlayed > 15) {
      return true;
    }

    return false;
  }

  /**
   * Get time of day category
   */
  private getTimeOfDay(timestamp: number): SessionMetrics['timeOfDay'] {
    const hour = new Date(timestamp).getHours();
    
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 24) return 'evening';
    return 'night';
  }

  /**
   * Check if user is in warm-up phase
   */
  isInWarmUp(): boolean {
    return this.data.currentSession?.isWarmUp || false;
  }

  /**
   * Check if fatigue is detected
   */
  isFatigued(): boolean {
    return this.data.currentSession?.fatigueDetected || false;
  }

  /**
   * Get session statistics
   */
  getSessionStats() {
    const sessions = this.data.sessionHistory;
    
    if (sessions.length === 0) {
      return null;
    }

    const totalGames = sessions.reduce((sum, s) => sum + s.gamesPlayed, 0);
    const avgGamesPerSession = totalGames / sessions.length;
    
    // Calculate average session duration
    const completedSessions = sessions.filter(s => s.endTime);
    const avgDuration = completedSessions.length > 0
      ? completedSessions.reduce((sum, s) => sum + (s.endTime! - s.startTime), 0) / completedSessions.length
      : 0;

    // Time of day statistics
    const timeOfDayStats = {
      morning: 0,
      afternoon: 0,
      evening: 0,
      night: 0,
    };

    sessions.forEach(s => {
      timeOfDayStats[s.timeOfDay]++;
    });

    return {
      totalSessions: sessions.length,
      totalGames,
      avgGamesPerSession: Math.round(avgGamesPerSession * 10) / 10,
      avgSessionDurationMinutes: Math.round(avgDuration / 60000),
      preferredTimeOfDay: Object.entries(timeOfDayStats)
        .sort(([, a], [, b]) => b - a)[0][0],
    };
  }

  /**
   * Get warm-up adjustment factor
   */
  getWarmUpAdjustment(): number {
    if (!this.isInWarmUp()) {
      return 1.0;
    }

    // Expect 10-15% slower performance during warm-up
    return 0.85;
  }

  /**
   * Get fatigue message
   */
  getFatigueMessage(): string | null {
    if (!this.isFatigued()) {
      return null;
    }

    const gamesPlayed = this.data.currentSession?.gamesPlayed || 0;
    
    return `You've played ${gamesPlayed} games this session. Consider taking a break to maintain peak performance.`;
  }

  /**
   * Save to localStorage
   */
  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (error) {
      console.error('Failed to save session intelligence data:', error);
    }
  }

  /**
   * Load from localStorage
   */
  private loadFromStorage(): void {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        this.data = JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load session intelligence data:', error);
    }
  }

  /**
   * Reset all data
   */
  reset(): void {
    this.data = {
      currentSession: null,
      sessionHistory: [],
      lastGameTime: 0,
      sessionScores: [],
    };
    this.saveToStorage();
  }
}

// Export singleton instance
export const sessionIntelligenceService = new SessionIntelligenceService();
