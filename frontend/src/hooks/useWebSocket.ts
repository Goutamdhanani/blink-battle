import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useGameContext } from '../context/GameContext';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const RECONNECT_DELAY_MS = 2000; // Start with 2 seconds (increased from 1s)
const MAX_RECONNECT_DELAY_MS = 15000; // Max 15 seconds (increased from 10s)
const MAX_RECONNECT_ATTEMPTS = 10;
const CONNECTION_WAIT_TIMEOUT_MS = 10000; // Wait up to 10 seconds for connection

// Socket.IO configuration for Heroku stability
const SOCKET_CONFIG = {
  transports: ['polling', 'websocket'], // START WITH POLLING, upgrade later
  upgrade: true,
  rememberUpgrade: false, // Don't cache failed upgrades
  reconnection: true,
  reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
  reconnectionDelay: RECONNECT_DELAY_MS,
  reconnectionDelayMax: MAX_RECONNECT_DELAY_MS,
  timeout: 20000,
  forceNew: false,
};

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
  
  // Connection stability tracking
  const connectionStableRef = useRef(false);
  const connectionStartTimeRef = useRef<number>(0);
  const MIN_STABLE_CONNECTION_MS = 1000; // Consider stable after 1 second

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
          ...SOCKET_CONFIG,
        });
        setupSocketListeners(newSocket);
        setSocket(newSocket);
      }
    }, delay);
  }, [state.token]);

  const setupSocketListeners = useCallback((newSocket: Socket) => {
    newSocket.on('connect', () => {
      console.log('[WebSocket] Connected, socket ID:', newSocket.id);
      connectionStartTimeRef.current = Date.now();
      connectionStableRef.current = false;
      setConnected(true);
      setIsConnecting(false);
      reconnectAttempts.current = 0; // Reset on successful connection
      
      // Mark connection as stable after MIN_STABLE_CONNECTION_MS
      setTimeout(() => {
        if (newSocket.connected) {
          connectionStableRef.current = true;
          console.log('[WebSocket] Connection stabilized');
        }
      }, MIN_STABLE_CONNECTION_MS);
      
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

    newSocket.on('match_found', async (data) => {
      try {
        console.log('[WebSocket] Match found:', data);
        setMatch(data.matchId, data.opponent.wallet, data.stake);
        
        // Wait for connection to be stable before sending player_ready
        const waitForStable = async () => {
          const maxWait = 3000;
          const checkInterval = 100;
          let waited = 0;
          
          while (!connectionStableRef.current && waited < maxWait) {
            await new Promise(r => setTimeout(r, checkInterval));
            waited += checkInterval;
          }
          
          return connectionStableRef.current;
        };
        
        // If this is a reconnection, handle appropriately
        if (data.reconnected) {
          console.log('[WebSocket] Successfully reconnected to match');
          if (data.hasStarted) {
            setGamePhase('countdown');
          }
          return;
        }
        
        const isStable = await waitForStable();
        
        if (isStable && newSocket.connected) {
          console.log('[WebSocket] Connection stable, sending player_ready');
          newSocket.emit('player_ready', { matchId: data.matchId });
        } else {
          console.warn('[WebSocket] Connection not stable, delaying player_ready');
        }
      } catch (error) {
        console.error('[WebSocket] Error handling match_found:', error);
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

    newSocket.on('match_cancelled', (data) => {
      console.log('[WebSocket] Match cancelled:', data);
      
      if (data.reason === 'timeout') {
        if (data.refunded) {
          alert('Match cancelled - game did not start in time. Your stake has been refunded.');
        } else if (data.noEscrow) {
          alert('Match cancelled - game did not start. Refund pending manual review.');
        } else {
          alert('Match cancelled - game did not start in time.');
        }
      } else {
        alert(`Match cancelled: ${data.reason || 'Unknown reason'}`);
      }
      
      setGamePhase('idle');
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
      ...SOCKET_CONFIG,
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

      // At this point, socket should be connected
      if (!socket) {
        throw new Error('Socket not initialized. Please try again.');
      }

      console.log('[WebSocket] Joining matchmaking:', { userId, stake, walletAddress });
      socket.emit('join_matchmaking', { userId, stake, walletAddress });
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
