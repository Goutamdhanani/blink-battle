import axios, { AxiosInstance } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface MatchmakingStatus {
  status: 'not_in_queue' | 'searching' | 'matched';
  queueId?: string;
  matchId?: string;
  stake?: number;
  opponent?: {
    userId: string;
    wallet: string;
  };
  expiresAt?: string;
}

export interface MatchState {
  matchId: string;
  state: 'matched' | 'ready_wait' | 'countdown' | 'waiting_for_go' | 'go' | 'resolved';
  status: string;
  stake: number;
  player1Ready: boolean;
  player2Ready: boolean;
  greenLightTime?: number;
  greenLightActive: boolean;
  countdown?: number;
  playerTapped: boolean;
  opponentTapped: boolean;
  winnerId?: string;
  player1ReactionMs?: number;
  player2ReactionMs?: number;
  completedAt?: string;
  opponent: {
    userId: string;
    wallet: string;
  };
}

export interface MatchResult {
  matchId: string;
  winnerId?: string;
  player1ReactionMs?: number;
  player2ReactionMs?: number;
  stake: number;
  fee?: number;
  completedAt?: string;
  taps: Array<{
    userId: string;
    reactionMs: number;
    isValid: boolean;
    disqualified: boolean;
  }>;
  isWinner: boolean;
}

export interface TapResponse {
  success: boolean;
  tap: {
    reactionMs: number;
    isValid: boolean;
    disqualified: boolean;
    disqualificationReason?: string;
  };
  waitingForOpponent: boolean;
}

/**
 * HTTP Polling Service for matchmaking and gameplay
 * Replaces WebSocket-based communication
 */
export class PollingService {
  private api: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.api = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add token to requests
    this.api.interceptors.request.use((config) => {
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      return config;
    });
  }

  setToken(token: string | null) {
    this.token = token;
  }

  /**
   * POST /api/matchmaking/join
   * Join matchmaking queue
   */
  async joinMatchmaking(stake: number): Promise<MatchmakingStatus> {
    const response = await this.api.post('/api/matchmaking/join', { stake });
    return response.data;
  }

  /**
   * GET /api/matchmaking/status/:userId
   * Poll matchmaking status
   */
  async getMatchmakingStatus(userId: string): Promise<MatchmakingStatus> {
    const response = await this.api.get(`/api/matchmaking/status/${userId}`);
    return response.data;
  }

  /**
   * DELETE /api/matchmaking/cancel/:userId
   * Cancel matchmaking
   */
  async cancelMatchmaking(userId: string): Promise<void> {
    await this.api.delete(`/api/matchmaking/cancel/${userId}`);
  }

  /**
   * POST /api/match/ready
   * Mark player as ready
   */
  async markReady(matchId: string): Promise<{ success: boolean; bothReady: boolean; greenLightTime?: number }> {
    const response = await this.api.post('/api/match/ready', { matchId });
    return response.data;
  }

  /**
   * GET /api/match/state/:matchId
   * Poll match state
   */
  async getMatchState(matchId: string): Promise<MatchState> {
    const response = await this.api.get(`/api/match/state/${matchId}`);
    return response.data;
  }

  /**
   * POST /api/match/tap
   * Record tap
   */
  async recordTap(matchId: string, clientTimestamp: number): Promise<TapResponse> {
    const response = await this.api.post('/api/match/tap', {
      matchId,
      clientTimestamp,
    });
    return response.data;
  }

  /**
   * GET /api/match/result/:matchId
   * Get match result
   */
  async getMatchResult(matchId: string): Promise<MatchResult> {
    const response = await this.api.get(`/api/match/result/${matchId}`);
    return response.data;
  }

  /**
   * POST /api/ping
   * Record latency sample
   */
  async recordPing(clientTimestamp: number): Promise<{ serverTimestamp: number; roundTripMs: number; avgLatency?: number }> {
    const response = await this.api.post('/api/ping', { clientTimestamp });
    return response.data;
  }
}

// Export singleton instance
export const pollingService = new PollingService();
