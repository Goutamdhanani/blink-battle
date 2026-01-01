import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useGameContext } from '../context/GameContext';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const RECONNECT_DELAY_MS = 2000; // Start with 2 seconds (increased from 1s)
const MAX_RECONNECT_DELAY_MS = 15000; // Max 15 seconds (increased from 10s)
const MAX_RECONNECT_ATTEMPTS = 10;
const CONNECTION_WAIT_TIMEOUT_MS = 10000; // Wait up to 10 seconds for connection

export const useWebSocket = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const { state, setMatch, setGamePhase, setCountdown, setSignalTimestamp, setMatchResult } = useGameContext();
  
  // Track reconnection state
  const reconnectAttempts = useRef(0);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const isReconnecting = useRef(false);
  const connectionWaiters = useRef<Array<{ resolve: () => void; reject: (error: Error) => void }>>([]);

  // Clear reconnect timeout on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      // Reject any pending connection waiters on unmount
      connectionWaiters.current.forEach(waiter => {
        waiter.reject(new Error('Component unmounted'));
      });
      connectionWaiters.current = [];
    };
  }, []);

  // Helper to wait for connection with timeout
  const waitForConnection = useCallback((): Promise<void> => {
    if (connected) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        // Remove this waiter from the list
        const index = connectionWaiters.current.findIndex(w => w.resolve === resolve);
        if (index !== -1) {
          connectionWaiters.current.splice(index, 1);
        }
        reject(new Error('Connection timeout'));
      }, CONNECTION_WAIT_TIMEOUT_MS);

      const wrappedResolve = () => {
        clearTimeout(timeoutId);
        resolve();
      };

      const wrappedReject = (error: Error) => {
        clearTimeout(timeoutId);
        reject(error);
      };

      connectionWaiters.current.push({ resolve: wrappedResolve, reject: wrappedReject });
    });
  }, [connected]);

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
          reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
          reconnectionDelay: RECONNECT_DELAY_MS,
          reconnectionDelayMax: MAX_RECONNECT_DELAY_MS,
          timeout: 20000,
          transports: ['websocket', 'polling'],
          upgrade: true,
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
      setIsConnecting(false);
      reconnectAttempts.current = 0; // Reset on successful connection
      
      // Resolve all pending connection waiters
      connectionWaiters.current.forEach(waiter => waiter.resolve());
      connectionWaiters.current = [];
      
      // If user was in a match, attempt to rejoin
      if (state.matchId && state.user) {
        console.log('[WebSocket] Reconnected with active match, attempting to rejoin:', state.matchId);
        try {
          newSocket.emit('rejoin_match', { 
            userId: state.user.userId, 
            matchId: state.matchId 
          });
        } catch (error) {
          console.error('[WebSocket] Error emitting rejoin_match:', error);
          // If rejoin fails, user will see disconnected state
          // They can try to rejoin manually or return to dashboard
        }
      }
    });

    newSocket.on('disconnect', (reason) => {
      console.log('[WebSocket] Disconnected:', reason);
      setConnected(false);
      setIsConnecting(false);
      
      // Reject all pending connection waiters
      connectionWaiters.current.forEach(waiter => {
        waiter.reject(new Error('Socket disconnected'));
      });
      connectionWaiters.current = [];
      
      // Attempt to reconnect if not a manual disconnect
      if (reason !== 'io client disconnect' && state.token) {
        attemptReconnect();
      }
    });

    newSocket.on('connect_error', (error) => {
      console.error('[WebSocket] Connection error:', error);
      setConnected(false);
      setIsConnecting(false);
      
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
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: RECONNECT_DELAY_MS,
      reconnectionDelayMax: MAX_RECONNECT_DELAY_MS,
      timeout: 20000,
      transports: ['websocket', 'polling'],
      upgrade: true,
    });

    setupSocketListeners(newSocket);
    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [state.token, setupSocketListeners]);

  const joinMatchmaking = async (userId: string, stake: number, walletAddress: string) => {
    try {
      // If not connected, wait for connection with timeout
      if (!connected) {
        console.log('[WebSocket] Not connected, waiting for connection...');
        setIsConnecting(true);
        try {
          await waitForConnection();
          console.log('[WebSocket] Connection established, proceeding with matchmaking');
        } catch (error: any) {
          console.error('[WebSocket] Failed to establish connection:', error);
          setIsConnecting(false);
          throw new Error('Failed to connect to server. Please try again.');
        }
      }

      if (socket && connected) {
        console.log('[WebSocket] Joining matchmaking:', { userId, stake, walletAddress });
        socket.emit('join_matchmaking', { userId, stake, walletAddress });
      } else {
        console.warn('[WebSocket] Cannot join matchmaking - socket not connected after wait');
        throw new Error('Connection failed. Please try again.');
      }
    } catch (error) {
      setIsConnecting(false);
      throw error;
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
    isConnecting,
    joinMatchmaking,
    cancelMatchmaking,
    playerReady,
    playerTap,
  };
};
