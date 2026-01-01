import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useGameContext } from './GameContext';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const RECONNECT_DELAY_MS = 2000; // Start with 2 seconds
const MAX_RECONNECT_DELAY_MS = 15000; // Max 15 seconds
const MAX_RECONNECT_ATTEMPTS = 10;
const CONNECTION_WAIT_TIMEOUT_MS = 10000; // Wait up to 10 seconds for connection
const MIN_STABLE_CONNECTION_MS = 5000; // Consider stable after 5 seconds (guard against early disconnects)

// Socket.IO configuration for Heroku stability
// USE WEBSOCKET ONLY to prevent polling->websocket upgrade disconnect loops
const SOCKET_CONFIG = {
  transports: ['websocket'], // WebSocket only - no polling/upgrade
  reconnection: true,
  reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
  reconnectionDelay: RECONNECT_DELAY_MS,
  reconnectionDelayMax: MAX_RECONNECT_DELAY_MS,
  timeout: 20000,
  forceNew: false,
};

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
  isConnecting: boolean;
  joinMatchmaking: (userId: string, stake: number, walletAddress: string) => Promise<void>;
  cancelMatchmaking: (userId: string, stake: number) => void;
  paymentConfirmed: (matchId: string, userId: string, paymentReference: string) => void;
  playerReady: (matchId: string) => void;
  playerTap: (matchId: string, clientTimestamp: number) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const { state, setMatch, setGamePhase, setCountdown, setSignalTimestamp, setMatchResult } = useGameContext();
  
  // Track reconnection state
  const reconnectAttempts = useRef(0);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const isReconnecting = useRef(false);
  const connectionWaiters = useRef<Array<{ resolve: () => void; reject: (error: Error) => void }>>([]);
  
  // Connection stability tracking (guard against early disconnects)
  const connectionStableRef = useRef(false);
  const connectionStartTimeRef = useRef<number>(0);

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
      console.error('[SocketProvider] Max reconnection attempts reached');
      return;
    }

    isReconnecting.current = true;
    const delay = Math.min(
      RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts.current),
      MAX_RECONNECT_DELAY_MS
    );

    console.log(`[SocketProvider] Attempting reconnect in ${delay}ms (attempt ${reconnectAttempts.current + 1}/${MAX_RECONNECT_ATTEMPTS})`);
    
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
      console.log('[SocketProvider] Connected, socket ID:', newSocket.id);
      connectionStartTimeRef.current = Date.now();
      connectionStableRef.current = false;
      setConnected(true);
      setIsConnecting(false);
      reconnectAttempts.current = 0; // Reset on successful connection
      
      // Mark connection as stable after MIN_STABLE_CONNECTION_MS
      // This guards against counting very early disconnects (e.g., React remounts) toward reconnect penalties
      setTimeout(() => {
        if (newSocket.connected) {
          connectionStableRef.current = true;
          console.log('[SocketProvider] Connection stabilized');
        }
      }, MIN_STABLE_CONNECTION_MS);
      
      // Resolve all pending connection waiters
      connectionWaiters.current.forEach(waiter => waiter.resolve());
      connectionWaiters.current = [];
      
      // If user was in a match, attempt to rejoin
      if (state.matchId && state.user) {
        console.log('[SocketProvider] Reconnected with active match, attempting to rejoin:', state.matchId);
        try {
          newSocket.emit('rejoin_match', { 
            userId: state.user.userId, 
            matchId: state.matchId 
          });
        } catch (error) {
          console.error('[SocketProvider] Error emitting rejoin_match:', error);
          // If rejoin fails, user will see disconnected state
          // They can try to rejoin manually or return to dashboard
        }
      }
    });

    newSocket.on('disconnect', (reason) => {
      const disconnectTime = Date.now();
      const connectionDuration = disconnectTime - connectionStartTimeRef.current;
      
      console.log('[SocketProvider] Disconnected:', reason, `(connection duration: ${connectionDuration}ms)`);
      
      // Early disconnect guard: ignore disconnects that happen very soon after connect
      // This prevents React remounts from burning reconnect attempts
      if (connectionDuration < MIN_STABLE_CONNECTION_MS) {
        console.log('[SocketProvider] Early disconnect ignored (connection not yet stable)');
        setConnected(false);
        setIsConnecting(false);
        return;
      }
      
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
      console.error('[SocketProvider] Connection error:', error);
      setConnected(false);
      setIsConnecting(false);
      
      // Attempt to reconnect on connection error
      if (state.token) {
        attemptReconnect();
      }
    });

    newSocket.on('match_found', async (data) => {
      try {
        console.log('[SocketProvider] Match found:', data);
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
          console.log('[SocketProvider] Successfully reconnected to match');
          if (data.hasStarted) {
            setGamePhase('countdown');
          }
          return;
        }
        
        const isStable = await waitForStable();
        
        if (isStable && newSocket.connected) {
          console.log('[SocketProvider] Connection stable, sending player_ready');
          newSocket.emit('player_ready', { matchId: data.matchId });
        } else {
          console.warn('[SocketProvider] Connection not stable, delaying player_ready');
        }
      } catch (error) {
        console.error('[SocketProvider] Error handling match_found:', error);
      }
    });

    newSocket.on('rejoin_failed', (data) => {
      console.warn('[SocketProvider] Rejoin failed:', data.reason);
      // Match may have ended or been cancelled
      if (data.reason === 'match_not_found') {
        setGamePhase('idle');
      }
    });

    newSocket.on('matchmaking_queued', () => {
      setGamePhase('matchmaking');
    });

    newSocket.on('matchmaking_timeout', (data) => {
      console.log('[SocketProvider] Matchmaking timeout:', data);
      setGamePhase('idle');
      alert(`No opponent found. Try these stakes: ${data.suggestedStakes.join(', ')}`);
    });

    newSocket.on('matchmaking_cancelled', () => {
      setGamePhase('idle');
    });

    // Payment flow events
    newSocket.on('opponent_paid', (data) => {
      console.log('[SocketProvider] Opponent paid:', data);
      // TODO: Update UI to show opponent paid status
    });

    newSocket.on('payment_confirmed_waiting', (data) => {
      console.log('[SocketProvider] Payment confirmed, waiting for opponent:', data);
      // TODO: Update UI to show waiting for opponent payment
    });

    newSocket.on('both_players_paid', (data) => {
      console.log('[SocketProvider] Both players paid, can proceed:', data);
      // Game phase will transition to waiting for players to be ready
      setGamePhase('waiting');
    });

    newSocket.on('player_ready_restored', (data) => {
      console.log('[SocketProvider] Player ready state restored after reconnect:', data);
      // Client should automatically resend player_ready
      if (data.matchId && state.user) {
        console.log('[SocketProvider] Auto-resending player_ready after reconnect');
        newSocket.emit('player_ready', { matchId: data.matchId });
      }
    });

    newSocket.on('game_start', (data) => {
      console.log('[SocketProvider] Game starting', data.reconnected ? '(reconnected)' : '');
      setGamePhase('countdown');
    });

    newSocket.on('countdown', (data) => {
      console.log('[SocketProvider] Countdown:', data.count);
      setCountdown(data.count);
    });

    newSocket.on('signal', (data) => {
      console.log('[SocketProvider] Signal!', data.timestamp, data.reconnected ? '(reconnected)' : '');
      setSignalTimestamp(data.timestamp);
      setCountdown(null);
    });

    newSocket.on('match_result', (data) => {
      console.log('[SocketProvider] Match result:', data);
      setMatchResult(data.winnerId, data.result);
    });

    newSocket.on('opponent_disconnected', (data) => {
      console.log('[SocketProvider] Opponent disconnected:', data);
      
      if (data.temporary) {
        // Opponent might reconnect
        console.log(`[SocketProvider] Opponent has ${data.gracePeriodMs}ms to reconnect`);
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
      console.log('[SocketProvider] Match cancelled:', data);
      
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
      console.error('[SocketProvider] Socket error:', data);
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
        console.log('[SocketProvider] Not connected, waiting for connection...');
        setIsConnecting(true);
        try {
          await waitForConnection();
          console.log('[SocketProvider] Connection established, proceeding with matchmaking');
        } catch (error: any) {
          console.error('[SocketProvider] Failed to establish connection:', error);
          setIsConnecting(false);
          throw new Error('Failed to connect to server. Please try again.');
        }
      }

      // At this point, socket should be connected
      if (!socket) {
        throw new Error('Socket not initialized. Please try again.');
      }

      console.log('[SocketProvider] Joining matchmaking:', { userId, stake, walletAddress });
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

  const paymentConfirmed = (matchId: string, userId: string, paymentReference: string) => {
    if (socket && connected) {
      console.log('[SocketProvider] Sending payment_confirmed for match:', matchId, 'ref:', paymentReference);
      socket.emit('payment_confirmed', { matchId, userId, paymentReference });
    } else {
      console.warn('[SocketProvider] Cannot send payment_confirmed - socket not connected');
    }
  };

  const playerReady = (matchId: string) => {
    if (socket && connected) {
      console.log('[SocketProvider] Sending player_ready for match:', matchId);
      socket.emit('player_ready', { matchId });
    } else {
      console.warn('[SocketProvider] Cannot send player_ready - socket not connected');
    }
  };

  const playerTap = (matchId: string, clientTimestamp: number) => {
    if (socket && connected) {
      socket.emit('player_tap', { matchId, clientTimestamp });
    }
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        connected,
        isConnecting,
        joinMatchmaking,
        cancelMatchmaking,
        paymentConfirmed,
        playerReady,
        playerTap,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
