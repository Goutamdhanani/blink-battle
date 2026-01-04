import { useEffect, useRef, useState, useCallback } from 'react';
import { pollingService, MatchState, MatchmakingStatus } from '../services/pollingService';
import { useGameContext } from '../context/GameContext';

/**
 * Adaptive polling rates for different game phases
 * Optimized for smooth gameplay with reduced server load
 * 
 * NOTE: Polling rates have been adjusted to reduce excessive polling:
 * - Most phases use 1500ms-3000ms to reduce server load
 * - Countdown phase uses LOCAL timers (no polling after greenLightTime received)
 * - Playing phase uses faster rate only for result updates
 * - Polling stops immediately when match completes
 * - Rate limiting applied via matchRateLimiter (500 req/min)
 * 
 * UPDATED: Countdown now uses local timers based on server time sync
 */
const POLLING_RATES = {
  IDLE: 5000,           // 5s - not in game
  MATCHMAKING: 2000,    // 2s - searching for match
  MATCHED: 3000,        // 3s - waiting for ready (reduced from 1000ms)
  COUNTDOWN: 0,         // 0ms - NO POLLING during countdown (use local timers)
  PLAYING: 1000,        // 1s - during reaction test (reduced from 250ms)
  WAITING_RESULT: 2000, // 2s - waiting for opponent (increased from 750ms)
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
  const unchangedStateCountRef = useRef<number>(0);
  const lastStateHashRef = useRef<string>('');
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const greenLightTimerRef = useRef<NodeJS.Timeout | null>(null);
  const serverTimeOffsetRef = useRef<number>(0);
  const greenLightTimeReceivedRef = useRef<boolean>(false);

  // Update polling service token when it changes
  useEffect(() => {
    pollingService.setToken(state.token);
  }, [state.token]);

  /**
   * Start local countdown based on greenLightTime and server time sync
   * This eliminates the need for polling during countdown
   */
  const startLocalCountdown = useCallback((greenLightTime: number, serverTime: number) => {
    // Clear any existing timers
    if (countdownTimerRef.current) {
      clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (greenLightTimerRef.current) {
      clearTimeout(greenLightTimerRef.current);
      greenLightTimerRef.current = null;
    }

    // Calculate server time offset for synchronization
    const clientTime = Date.now();
    serverTimeOffsetRef.current = serverTime - clientTime;
    
    console.log(`[LocalCountdown] Server time offset: ${serverTimeOffsetRef.current}ms`);
    console.log(`[LocalCountdown] Green light at: ${new Date(greenLightTime).toISOString()}`);

    const COUNTDOWN_DURATION_MS = 3000; // Last 3 seconds show countdown numbers

    const updateCountdown = () => {
      const now = Date.now() + serverTimeOffsetRef.current; // Sync with server time
      const timeUntilGo = greenLightTime - now;

      if (timeUntilGo <= 0) {
        // Green light!
        setGamePhase('signal');
        setSignalTimestamp(greenLightTime);
        setCountdown(null);
        console.log('[LocalCountdown] 🟢 GREEN LIGHT!');
        
        // Resume polling for result updates
        greenLightTimeReceivedRef.current = false; // Reset flag
      } else if (timeUntilGo <= COUNTDOWN_DURATION_MS) {
        // Countdown phase (3, 2, 1)
        const countdown = Math.ceil(timeUntilGo / 1000);
        setGamePhase('countdown');
        setCountdown(countdown);
        console.log(`[LocalCountdown] Countdown: ${countdown}`);
        
        // Schedule next update
        countdownTimerRef.current = setTimeout(updateCountdown, 100); // Update every 100ms for smooth countdown
      } else {
        // Waiting phase (before countdown)
        setGamePhase('waiting');
        setCountdown(null);
        console.log(`[LocalCountdown] Waiting... ${Math.round(timeUntilGo / 1000)}s until countdown`);
        
        // Schedule next check when countdown should start
        const delayUntilCountdown = timeUntilGo - COUNTDOWN_DURATION_MS;
        countdownTimerRef.current = setTimeout(updateCountdown, Math.max(100, delayUntilCountdown));
      }
    };

    // Start the countdown
    updateCountdown();
  }, [setGamePhase, setCountdown, setSignalTimestamp]);

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
      if (countdownTimerRef.current) {
        clearTimeout(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      if (greenLightTimerRef.current) {
        clearTimeout(greenLightTimerRef.current);
        greenLightTimerRef.current = null;
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
    
    // Reset backoff state
    unchangedStateCountRef.current = 0;
    lastStateHashRef.current = '';

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

        // Sync server time on every poll for accuracy
        if (matchState.serverTime) {
          const clientTime = Date.now();
          serverTimeOffsetRef.current = matchState.serverTime - clientTime;
        }

        // Check if greenLightTime was just received
        if (matchState.greenLightTime && 
            !greenLightTimeReceivedRef.current && 
            matchState.greenLightTime > 0) {
          greenLightTimeReceivedRef.current = true;
          
          console.log('[Polling] 🎯 Green light time received! Starting local countdown...');
          console.log(`[Polling] Server time: ${matchState.serverTime}, Client time: ${Date.now()}, Offset: ${serverTimeOffsetRef.current}ms`);
          
          // Start local countdown based on greenLightTime
          startLocalCountdown(matchState.greenLightTime, matchState.serverTime || Date.now());
          
          // STOP POLLING during countdown - use local timers instead
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
            console.log('[Polling] ⏸️  Polling STOPPED - using local countdown timers');
          }
          
          // Don't poll again until after green light
          return;
        }

        // Create state hash to detect changes
        const stateHash = `${matchState.state}-${matchState.status}-${matchState.countdown}-${matchState.playerTapped}-${matchState.opponentTapped}`;
        
        // Detect unchanged state for backoff
        if (stateHash === lastStateHashRef.current) {
          unchangedStateCountRef.current++;
          
          // After 5 consecutive unchanged states, slow down polling (except during countdown/playing)
          // Higher polling interval = slower/less frequent polling
          if (unchangedStateCountRef.current >= 5 && 
              matchState.state !== 'countdown' && 
              matchState.state !== 'go' &&
              matchState.state !== 'waiting_for_go') {
            // Gradually increase interval (slow down) by 1.5x, capped at IDLE rate (5000ms)
            const backoffRate = Math.min(currentPollingRateRef.current * 1.5, POLLING_RATES.IDLE);
            if (backoffRate !== currentPollingRateRef.current) {
              currentPollingRateRef.current = backoffRate;
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = setInterval(poll, backoffRate);
                console.log(`[Polling] State unchanged, backing off to ${Math.round(backoffRate)}ms`);
              }
            }
          }
        } else {
          // State changed, reset backoff
          unchangedStateCountRef.current = 0;
          lastStateHashRef.current = stateHash;
        }

        // Log state for debugging
        console.log(`[Polling] Match state: ${matchState.state}, status: ${matchState.status}, countdown: ${matchState.countdown}`);

        // Determine polling rate based on game state
        let newRate = POLLING_RATES.MATCHED;

        // Update game phase based on state (only if not using local countdown)
        if (!greenLightTimeReceivedRef.current) {
          if (matchState.state === 'ready_wait') {
            setGamePhase('waiting');
            newRate = POLLING_RATES.MATCHED;
          } else if (matchState.state === 'countdown' || matchState.state === 'waiting_for_go') {
            // These states should not happen if greenLightTime is set, but handle them anyway
            setGamePhase(matchState.state === 'countdown' ? 'countdown' : 'waiting');
            if (matchState.countdown !== undefined) {
              setCountdown(matchState.countdown);
            }
            newRate = POLLING_RATES.MATCHED; // Keep polling until greenLightTime is received
          } else if (matchState.state === 'go' && matchState.greenLightActive) {
            // Green light is active!
            setGamePhase('signal');
            setSignalTimestamp(matchState.greenLightTime || Date.now());
            setCountdown(null);
            newRate = POLLING_RATES.PLAYING; // Resume polling for result updates
          }
        } else if (matchState.state === 'go' && matchState.greenLightActive) {
          // Resume polling after green light for result updates
          newRate = POLLING_RATES.PLAYING;
        }

        if (matchState.state === 'resolved' || matchState.status === 'completed') {
          // CRITICAL: Match is complete - stop polling IMMEDIATELY
          if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = null;
          }
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          if (countdownTimerRef.current) {
            clearTimeout(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          if (greenLightTimerRef.current) {
            clearTimeout(greenLightTimerRef.current);
            greenLightTimerRef.current = null;
          }
          setIsPolling(false);
          greenLightTimeReceivedRef.current = false;
          
          setMatchResult(matchState.winnerId || null, 'completed');
          setGamePhase('result');
          console.log('[Polling] Match resolved, polling stopped IMMEDIATELY');
          return; // Exit early to prevent ANY further polling
        }

        // Adjust polling rate if needed (only if not backing off and not in countdown)
        if (unchangedStateCountRef.current < 5 && 
            newRate !== currentPollingRateRef.current &&
            !greenLightTimeReceivedRef.current) {
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
