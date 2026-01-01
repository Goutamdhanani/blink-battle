import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useGameContext } from '../context/GameContext';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const RECONNECT_DELAY_MS = 1000; // Start with 1 second
const MAX_RECONNECT_DELAY_MS = 10000; // Max 10 seconds
const MAX_RECONNECT_ATTEMPTS = 10;

export const useWebSocket = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const { state, setMatch, setGamePhase, setCountdown, setSignalTimestamp, setMatchResult } = useGameContext();
  
  // Track reconnection state
  const reconnectAttempts = useRef(0);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const isReconnecting = useRef(false);

  // Clear reconnect timeout on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
    };
  }, []);

  // Reconnect with exponential backoff
  const attemptReconnect = useCallback(() => {
    if (isReconnecting.current || !state.token) return;
    
    if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[WebSocket] Max reconnection attempts reached');
      return;
    }

    isReconnecting.current = true;
    const delay = Math.min(
      RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts.current),
      MAX_RECONNECT_DELAY_MS
    );

    console.log(`[WebSocket] Attempting reconnect in ${delay}ms (attempt ${reconnectAttempts.current + 1}/${MAX_RECONNECT_ATTEMPTS})`);
    
    reconnectTimeout.current = setTimeout(() => {
      reconnectAttempts.current++;
      isReconnecting.current = false;
      
      // Trigger reconnection by updating socket
      if (state.token) {
        const newSocket = io(SOCKET_URL, {
          auth: { token: state.token },
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
        });
        setupSocketListeners(newSocket);
        setSocket(newSocket);
      }
    }, delay);
  }, [state.token]);

  const setupSocketListeners = useCallback((newSocket: Socket) => {
    newSocket.on('connect', () => {
      console.log('[WebSocket] Connected, socket ID:', newSocket.id);
      setConnected(true);
      reconnectAttempts.current = 0; // Reset on successful connection
      
      // If user was in a match, attempt to rejoin
      if (state.matchId && state.user) {
        console.log('[WebSocket] Reconnected with active match, attempting to rejoin:', state.matchId);
        newSocket.emit('rejoin_match', { 
          userId: state.user.userId, 
          matchId: state.matchId 
        });
      }
    });

    newSocket.on('disconnect', (reason) => {
      console.log('[WebSocket] Disconnected:', reason);
      setConnected(false);
      
      // Attempt to reconnect if not a manual disconnect
      if (reason !== 'io client disconnect' && state.token) {
        attemptReconnect();
      }
    });

    newSocket.on('connect_error', (error) => {
      console.error('[WebSocket] Connection error:', error);
      setConnected(false);
      
      // Attempt to reconnect on connection error
      if (state.token) {
        attemptReconnect();
      }
    });

    newSocket.on('match_found', (data) => {
      console.log('[WebSocket] Match found:', data);
      setMatch(data.matchId, data.opponent.wallet, data.stake);
      
      // If this is a reconnection, handle appropriately
      if (data.reconnected) {
        console.log('[WebSocket] Successfully reconnected to match');
        if (data.hasStarted) {
          setGamePhase('countdown');
        }
      }
    });

    newSocket.on('rejoin_failed', (data) => {
      console.warn('[WebSocket] Rejoin failed:', data.reason);
      // Match may have ended or been cancelled
      if (data.reason === 'match_not_found') {
        setGamePhase('idle');
      }
    });

    newSocket.on('matchmaking_queued', () => {
      setGamePhase('matchmaking');
    });

    newSocket.on('matchmaking_timeout', (data) => {
      console.log('[WebSocket] Matchmaking timeout:', data);
      setGamePhase('idle');
      alert(`No opponent found. Try these stakes: ${data.suggestedStakes.join(', ')}`);
    });

    newSocket.on('matchmaking_cancelled', () => {
      setGamePhase('idle');
    });

    newSocket.on('game_start', (data) => {
      console.log('[WebSocket] Game starting', data.reconnected ? '(reconnected)' : '');
      setGamePhase('countdown');
    });

    newSocket.on('countdown', (data) => {
      console.log('[WebSocket] Countdown:', data.count);
      setCountdown(data.count);
    });

    newSocket.on('signal', (data) => {
      console.log('[WebSocket] Signal!', data.timestamp, data.reconnected ? '(reconnected)' : '');
      setSignalTimestamp(data.timestamp);
      setCountdown(null);
    });

    newSocket.on('match_result', (data) => {
      console.log('[WebSocket] Match result:', data);
      setMatchResult(data.winnerId, data.result);
    });

    newSocket.on('opponent_disconnected', (data) => {
      console.log('[WebSocket] Opponent disconnected:', data);
      
      if (data.temporary) {
        // Opponent might reconnect
        console.log(`[WebSocket] Opponent has ${data.gracePeriodMs}ms to reconnect`);
        // Could show a UI notification here
      } else if (data.win) {
        alert('You win! Opponent disconnected.');
        setGamePhase('idle');
      } else if (data.refund) {
        alert('Match cancelled. Opponent disconnected. Your stake has been refunded.');
        setGamePhase('idle');
      }
    });

    newSocket.on('error', (data) => {
      console.error('[WebSocket] Socket error:', data);
      alert(data.message);
    });
  }, [state.matchId, state.user, state.token, setMatch, setGamePhase, setCountdown, setSignalTimestamp, setMatchResult, attemptReconnect]);

  useEffect(() => {
    if (!state.token) {
      // Clean up socket if no token
      if (socket) {
        socket.close();
        setSocket(null);
      }
      return;
    }

    const newSocket = io(SOCKET_URL, {
      auth: { token: state.token },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    setupSocketListeners(newSocket);
    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [state.token, setupSocketListeners]);

  const joinMatchmaking = (userId: string, stake: number, walletAddress: string) => {
    if (socket && connected) {
      console.log('[WebSocket] Joining matchmaking:', { userId, stake, walletAddress });
      socket.emit('join_matchmaking', { userId, stake, walletAddress });
    } else {
      console.warn('[WebSocket] Cannot join matchmaking - socket not connected');
    }
  };

  const cancelMatchmaking = (userId: string, stake: number) => {
    if (socket && connected) {
      socket.emit('cancel_matchmaking', { userId, stake });
    }
  };

  const playerReady = (matchId: string) => {
    if (socket && connected) {
      console.log('[WebSocket] Sending player_ready for match:', matchId);
      socket.emit('player_ready', { matchId });
    } else {
      console.warn('[WebSocket] Cannot send player_ready - socket not connected');
    }
  };

  const playerTap = (matchId: string, clientTimestamp: number) => {
    if (socket && connected) {
      socket.emit('player_tap', { matchId, clientTimestamp });
    }
  };

  return {
    socket,
    connected,
    joinMatchmaking,
    cancelMatchmaking,
    playerReady,
    playerTap,
  };
};
