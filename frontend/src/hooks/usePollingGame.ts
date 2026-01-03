import { useEffect, useRef, useState, useCallback } from 'react';
import { pollingService, MatchState, MatchmakingStatus } from '../services/pollingService';
import { useGameContext } from '../context/GameContext';

/**
 * Adaptive polling rates for different game phases
 * Optimized for ultra-smooth gameplay experience
 * 
 * NOTE: The 50ms polling rate during active gameplay is intentional and optimized:
 * - Only active during the brief reaction test window (~1-2 seconds)
 * - Polling stops immediately when match completes
 * - Rate is adaptive - slower during idle/waiting phases
 * - Critical for detecting opponent taps in real-time PvP
 * 
 * Server load is manageable because:
 * - Very short duration (1-2 seconds per match)
 * - Rate limiting applied via matchRateLimiter (500 req/min)
 * - Matches are sequential, not all players polling simultaneously
 */
const POLLING_RATES = {
  IDLE: 5000,           // 5s - not in game
  MATCHMAKING: 2000,    // 2s - searching for match
  MATCHED: 500,         // 500ms - waiting for ready
  COUNTDOWN: 100,       // 100ms - countdown active
  PLAYING: 50,          // 50ms - during reaction test (CRITICAL - brief duration)
  WAITING_RESULT: 200,  // 200ms - waiting for opponent
  RESULT: 2000          // 2s - showing results
};

/**
 * Heartbeat configuration
 * Must be coordinated with backend disconnect timeout (30s)
 */
const HEARTBEAT_INTERVAL_MS = 5000; // 5 seconds - send heartbeat every 5s

/**
 * Custom hook for HTTP polling-based gameplay
 * Replaces WebSocket connection with REST polling
 * Uses adaptive polling rates for ultra-smooth experience
 */
export const usePollingGame = () => {
  const { state, setMatch, setGamePhase, setCountdown, setSignalTimestamp, setMatchResult, resetGame } = useGameContext();
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const matchStateRef = useRef<MatchState | null>(null);
  const pollCountRef = useRef<number>(0);
  const currentPollingRateRef = useRef<number>(POLLING_RATES.IDLE);

  // Update polling service token when it changes
  useEffect(() => {
    pollingService.setToken(state.token);
  }, [state.token]);

  // Clear polling and heartbeat on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
  }, []);

  /**
   * Start polling matchmaking status
   * Uses 2s interval for matchmaking search
   */
  const startMatchmakingPolling = useCallback((userId: string) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    setIsPolling(true);
    setError(null);
    pollCountRef.current = 0;
    currentPollingRateRef.current = POLLING_RATES.MATCHMAKING;

    const poll = async () => {
      try {
        pollCountRef.current++;
        const status: MatchmakingStatus = await pollingService.getMatchmakingStatus(userId);
        
        if (status.status === 'matched' && status.matchId && status.opponent) {
          // Match found!
          console.log(`[Polling] Match found after ${pollCountRef.current} polls`);
          clearInterval(pollIntervalRef.current!);
          pollIntervalRef.current = null;
          setIsPolling(false);
          
          setMatch(status.matchId, status.opponent.wallet, status.stake || 0);
          
          // Automatically mark as ready
          await pollingService.markReady(status.matchId);
          
          // Start polling match state
          startMatchStatePolling(status.matchId);
        }
      } catch (err: any) {
        console.error('[Polling] Error polling matchmaking status:', err);
        setError(err.message || 'Failed to poll matchmaking status');
      }
    };

    // Poll immediately, then every 2 seconds
    poll();
    pollIntervalRef.current = setInterval(poll, POLLING_RATES.MATCHMAKING);
    console.log(`[Polling] Matchmaking polling started at ${POLLING_RATES.MATCHMAKING}ms interval`);
  }, [setMatch]);

  /**
   * Start polling match state (for countdown, go, result)
   * Uses adaptive polling rates based on game phase
   */
  const startMatchStatePolling = useCallback((matchId: string) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }

    setIsPolling(true);
    setError(null);

    // Start heartbeat interval
    heartbeatIntervalRef.current = setInterval(() => {
      pollingService.sendHeartbeat(matchId).catch(err => {
        console.error('[Polling] Heartbeat error:', err);
      });
    }, HEARTBEAT_INTERVAL_MS);

    const poll = async () => {
      try {
        const matchState: MatchState = await pollingService.getMatchState(matchId);
        matchStateRef.current = matchState;

        // Log state for debugging
        console.log(`[Polling] Match state: ${matchState.state}, status: ${matchState.status}, countdown: ${matchState.countdown}`);

        // Determine polling rate based on game state
        let newRate = POLLING_RATES.MATCHED;

        // Update game phase based on state
        if (matchState.state === 'ready_wait') {
          setGamePhase('waiting');
          newRate = POLLING_RATES.MATCHED;
        } else if (matchState.state === 'countdown') {
          setGamePhase('countdown');
          if (matchState.countdown !== undefined) {
            setCountdown(matchState.countdown);
          }
          newRate = POLLING_RATES.COUNTDOWN; // 100ms during countdown
        } else if (matchState.state === 'waiting_for_go') {
          // In the random delay before green light
          setGamePhase('waiting');
          setCountdown(null);
          newRate = POLLING_RATES.COUNTDOWN; // 100ms during waiting for go
        } else if (matchState.state === 'go' && matchState.greenLightActive) {
          // Green light is active!
          setGamePhase('signal');
          setSignalTimestamp(matchState.greenLightTime || Date.now());
          setCountdown(null);
          newRate = POLLING_RATES.PLAYING; // 50ms during active gameplay
        } else if (matchState.state === 'resolved' || matchState.status === 'completed') {
          // CRITICAL: Match is complete - stop polling IMMEDIATELY
          if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = null;
          }
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setIsPolling(false);
          
          setMatchResult(matchState.winnerId || null, 'completed');
          setGamePhase('result');
          console.log('[Polling] Match resolved, polling stopped IMMEDIATELY');
          return; // Exit early to prevent ANY further polling
        }

        // Adjust polling rate if needed
        if (newRate !== currentPollingRateRef.current) {
          currentPollingRateRef.current = newRate;
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = setInterval(poll, newRate);
            console.log(`[Polling] Match state polling adjusted to ${newRate}ms`);
          }
        }
      } catch (err: any) {
        console.error('[Polling] Error polling match state:', err);
        console.error('[Polling] Error details:', {
          message: err.message,
          status: err.response?.status,
          data: err.response?.data,
          matchId
        });
        setError(err.message || 'Failed to poll match state');
        // Don't crash on error, just log it and keep trying
        // If it's a critical auth error, the user will be redirected by the API layer
        // Transient errors (network issues, server busy) will self-heal on next poll
        // User will see stale state until next successful poll
      }
    };

    // Start polling at initial rate
    const initialRate = POLLING_RATES.MATCHED;
    currentPollingRateRef.current = initialRate;
    poll();
    pollIntervalRef.current = setInterval(poll, initialRate);
    console.log(`[Polling] Match state polling started at ${initialRate}ms interval`);
  }, [setGamePhase, setCountdown, setSignalTimestamp, setMatchResult]);

  /**
   * Join matchmaking
   * For staked games, paymentReference is required
   */
  const joinMatchmaking = useCallback(async (userId: string, stake: number, paymentReference?: string) => {
    try {
      setError(null);
      const result: MatchmakingStatus = await pollingService.joinMatchmaking(stake, paymentReference);
      
      if (result.status === 'matched' && result.matchId && result.opponent) {
        // Instant match!
        setMatch(result.matchId, result.opponent.wallet, result.stake || stake);
        
        // Automatically mark as ready
        await pollingService.markReady(result.matchId);
        
        // Start polling match state
        startMatchStatePolling(result.matchId);
      } else {
        // Searching, start polling
        setGamePhase('matchmaking');
        startMatchmakingPolling(userId);
      }
    } catch (err: any) {
      console.error('[Polling] Error joining matchmaking:', err);
      setError(err.message || 'Failed to join matchmaking');
      throw err;
    }
  }, [setMatch, setGamePhase, startMatchmakingPolling, startMatchStatePolling]);

  /**
   * Cancel matchmaking
   */
  const cancelMatchmaking = useCallback(async (userId: string) => {
    try {
      await pollingService.cancelMatchmaking(userId);
      
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      
      setIsPolling(false);
      setGamePhase('idle');
    } catch (err: any) {
      console.error('[Polling] Error cancelling matchmaking:', err);
      setError(err.message || 'Failed to cancel matchmaking');
    }
  }, [setGamePhase]);

  /**
   * Record tap
   */
  const recordTap = useCallback(async (matchId: string) => {
    try {
      const clientTimestamp = Date.now();
      const result = await pollingService.recordTap(matchId, clientTimestamp);
      
      console.log('[Polling] Tap recorded:', result);
      
      // Continue polling to get opponent's tap and final result
      if (!pollIntervalRef.current) {
        startMatchStatePolling(matchId);
      }
      
      return result;
    } catch (err: any) {
      console.error('[Polling] Error recording tap:', err);
      setError(err.message || 'Failed to record tap');
      throw err;
    }
  }, [startMatchStatePolling]);

  /**
   * Stop polling
   */
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  /**
   * Reset game and stop polling
   */
  const resetGameAndStopPolling = useCallback(() => {
    stopPolling();
    resetGame();
    setError(null);
  }, [stopPolling, resetGame]);

  return {
    joinMatchmaking,
    cancelMatchmaking,
    recordTap,
    stopPolling,
    resetGameAndStopPolling,
    isPolling,
    error,
    currentMatchState: matchStateRef.current,
  };
};
