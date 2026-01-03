import { useEffect, useRef, useState, useCallback } from 'react';
import { pollingService, MatchState, MatchmakingStatus } from '../services/pollingService';
import { useGameContext } from '../context/GameContext';

/**
 * Custom hook for HTTP polling-based gameplay
 * Replaces WebSocket connection with REST polling
 * Uses reduced polling frequency to minimize server load
 */
export const usePollingGame = () => {
  const { state, setMatch, setGamePhase, setCountdown, setSignalTimestamp, setMatchResult, resetGame } = useGameContext();
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const matchStateRef = useRef<MatchState | null>(null);
  const pollCountRef = useRef<number>(0);

  // Update polling service token when it changes
  useEffect(() => {
    pollingService.setToken(state.token);
  }, [state.token]);

  // Clear polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  /**
   * Start polling matchmaking status
   * Uses fixed 5s interval to reduce server load
   */
  const startMatchmakingPolling = useCallback((userId: string) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    setIsPolling(true);
    setError(null);
    pollCountRef.current = 0;

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

    // Poll immediately, then every 5 seconds (reduced from 1s)
    poll();
    pollIntervalRef.current = setInterval(poll, 5000);
    console.log('[Polling] Matchmaking polling started at 5s interval');
  }, [setMatch]);

  /**
   * Start polling match state (for countdown, go, result)
   * Uses adaptive polling: 2s for waiting, 1s for countdown/game states
   */
  const startMatchStatePolling = useCallback((matchId: string) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    setIsPolling(true);
    setError(null);
    let currentInterval = 2000; // Start with 2s interval

    const poll = async () => {
      try {
        const matchState: MatchState = await pollingService.getMatchState(matchId);
        matchStateRef.current = matchState;

        // Log state for debugging
        console.log(`[Polling] Match state: ${matchState.state}, status: ${matchState.status}, countdown: ${matchState.countdown}`);

        // Update game phase based on state
        if (matchState.state === 'ready_wait') {
          setGamePhase('waiting');
        } else if (matchState.state === 'countdown') {
          setGamePhase('countdown');
          if (matchState.countdown !== undefined) {
            setCountdown(matchState.countdown);
          }
        } else if (matchState.state === 'waiting_for_go') {
          // In the random delay before green light
          setGamePhase('waiting');
          setCountdown(null);
        } else if (matchState.state === 'go' && matchState.greenLightActive) {
          // Green light is active!
          setGamePhase('signal');
          setSignalTimestamp(matchState.greenLightTime || Date.now());
          setCountdown(null);
        } else if (matchState.state === 'resolved' || matchState.status === 'completed') {
          // CRITICAL: Match is complete - stop polling IMMEDIATELY
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

        // Adjust polling speed based on state
        // Use 1s polling during countdown and active game, 2s during waiting
        const newInterval = (matchState.state === 'countdown' || matchState.state === 'waiting_for_go' || matchState.state === 'go')
          ? 1000  // 1s polling during active gameplay
          : 2000; // 2s polling during waiting

        if (newInterval !== currentInterval) {
          currentInterval = newInterval;
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = setInterval(poll, currentInterval);
            console.log(`[Polling] Match state polling adjusted to ${currentInterval}ms`);
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

    // Start polling at 2s initially
    poll();
    pollIntervalRef.current = setInterval(poll, currentInterval);
    console.log('[Polling] Match state polling started at 2s interval');
  }, [setGamePhase, setCountdown, setSignalTimestamp, setMatchResult]);

  /**
   * Join matchmaking
   */
  const joinMatchmaking = useCallback(async (userId: string, stake: number) => {
    try {
      setError(null);
      const result: MatchmakingStatus = await pollingService.joinMatchmaking(stake);
      
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
