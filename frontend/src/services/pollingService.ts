import axios, { AxiosInstance } from 'axios';

// Normalize API URL to ensure no trailing slash
const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');

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
  greenLightTime?: number | null;
  greenLightTimeISO?: string | null;
  greenLightActive: boolean;
  countdown?: number;
  playerTapped: boolean;
  opponentTapped: boolean;
  winnerId?: string;
  player1ReactionMs?: number;
  player2ReactionMs?: number;
  completedAt?: string;
  serverTime?: number; // Server timestamp for time sync
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
 * Includes exponential backoff for rate limiting
 */
export class PollingService {
  private api: AxiosInstance;
  private token: string | null = null;
  private pollInterval: number = 1000; // Start at 1000ms (was 250ms)
  private consecutiveErrors: number = 0;
  private readonly MAX_INTERVAL: number = 5000; // Max 5 seconds

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

    // Add response interceptor for rate limiting
    this.api.interceptors.response.use(
      (response) => {
        // Success - reset backoff
        this.consecutiveErrors = 0;
        this.pollInterval = 1000; // Reset to 1000ms (was 250ms)
        return response;
      },
      async (error) => {
        if (error.response?.status === 429) {
          // Rate limited - use Retry-After header if provided
          const retryAfter = error.response.headers['retry-after'];
          const retryAfterMs = retryAfter ? parseInt(retryAfter) * 1000 : this.pollInterval * 2;
          
          this.consecutiveErrors++;
          this.pollInterval = Math.min(retryAfterMs, this.MAX_INTERVAL);
          console.warn(`[PollingService] Rate limited (429). Backing off to ${this.pollInterval}ms`);
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, this.pollInterval));
        } else if (error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED') {
          // Network error - slower backoff
          this.consecutiveErrors++;
          this.pollInterval = Math.min(this.pollInterval * 1.5, this.MAX_INTERVAL);
        }
        throw error;
      }
    );
  }

  setToken(token: string | null) {
    this.token = token;
  }

  /**
   * Get current poll interval (for adaptive polling)
   */
  getPollInterval(): number {
    return this.pollInterval;
  }

  /**
   * Reset backoff state
   */
  resetBackoff(): void {
    this.pollInterval = 1000; // Reset to 1000ms (was 250ms)
    this.consecutiveErrors = 0;
  }

  /**
   * POST /api/matchmaking/join
   * Join matchmaking queue
   * For staked games, paymentReference is required
   */
  async joinMatchmaking(stake: number, paymentReference?: string): Promise<MatchmakingStatus> {
    const response = await this.api.post('/api/matchmaking/join', { 
      stake,
      paymentReference 
    });
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

  /**
   * GET /api/match/stake-status/:matchId
   * Get stake status for both players
   */
  async getStakeStatus(matchId: string): Promise<{ 
    player1Staked: boolean; 
    player2Staked: boolean; 
    canStart: boolean;
    stake: number;
  }> {
    const response = await this.api.get(`/api/match/stake-status/${matchId}`);
    return response.data;
  }

  /**
   * POST /api/match/heartbeat
   * Send heartbeat to server to indicate player is still connected
   */
  async sendHeartbeat(matchId: string): Promise<{ success: boolean }> {
    const response = await this.api.post('/api/match/heartbeat', { matchId });
    return response.data;
  }
}

// Export singleton instance
export const pollingService = new PollingService();
