import { useEffect, useRef, useState, useCallback } from 'react';
import { pollingService, MatchState, MatchmakingStatus } from '../services/pollingService';
import { useGameContext } from '../context/GameContext';

/**
 * Custom hook for HTTP polling-based gameplay
 * Replaces WebSocket connection with REST polling
 */
export const usePollingGame = () => {
  const { state, setMatch, setGamePhase, setCountdown, setSignalTimestamp, setMatchResult, resetGame } = useGameContext();
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const matchStateRef = useRef<MatchState | null>(null);

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
   */
  const startMatchmakingPolling = useCallback((userId: string) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    setIsPolling(true);
    setError(null);

    const poll = async () => {
      try {
        const status: MatchmakingStatus = await pollingService.getMatchmakingStatus(userId);
        
        if (status.status === 'matched' && status.matchId && status.opponent) {
          // Match found!
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

    // Poll immediately, then every 1 second
    poll();
    pollIntervalRef.current = setInterval(poll, 1000);
  }, [setMatch]);

  /**
   * Start polling match state (for countdown, go, result)
   */
  const startMatchStatePolling = useCallback((matchId: string) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    setIsPolling(true);
    setError(null);

    const poll = async () => {
      try {
        const matchState: MatchState = await pollingService.getMatchState(matchId);
        matchStateRef.current = matchState;

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
          setGamePhase('countdown');
          setCountdown(null);
        } else if (matchState.state === 'go' && matchState.greenLightActive) {
          // Green light is active!
          setGamePhase('signal');
          setSignalTimestamp(matchState.greenLightTime || Date.now());
          setCountdown(null);
        } else if (matchState.state === 'resolved') {
          // Match is complete
          clearInterval(pollIntervalRef.current!);
          pollIntervalRef.current = null;
          setIsPolling(false);
          
          setMatchResult(matchState.winnerId || null, 'completed');
          setGamePhase('result');
        }

        // Adjust polling speed based on state
        if (matchState.state === 'countdown' || matchState.state === 'waiting_for_go' || matchState.state === 'go') {
          // Fast polling during countdown and signal
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = setInterval(poll, 100); // 100ms for smooth UI
          }
        }
      } catch (err: any) {
        console.error('[Polling] Error polling match state:', err);
        setError(err.message || 'Failed to poll match state');
      }
    };

    // Start polling every 500ms initially, will adjust to 100ms during countdown
    poll();
    pollIntervalRef.current = setInterval(poll, 500);
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
