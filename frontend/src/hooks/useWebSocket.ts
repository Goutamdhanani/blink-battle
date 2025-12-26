import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useGameContext } from '../context/GameContext';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const useWebSocket = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const { state, setMatch, setGamePhase, setCountdown, setSignalTimestamp, setMatchResult } = useGameContext();

  useEffect(() => {
    if (!state.token) return;

    const newSocket = io(SOCKET_URL, {
      auth: { token: state.token },
    });

    newSocket.on('connect', () => {
      console.log('WebSocket connected');
      setConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setConnected(false);
    });

    newSocket.on('match_found', (data) => {
      console.log('Match found:', data);
      setMatch(data.matchId, data.opponent.wallet, data.stake);
    });

    newSocket.on('matchmaking_queued', () => {
      setGamePhase('matchmaking');
    });

    newSocket.on('matchmaking_timeout', (data) => {
      console.log('Matchmaking timeout:', data);
      setGamePhase('idle');
      alert(`No opponent found. Try these stakes: ${data.suggestedStakes.join(', ')}`);
    });

    newSocket.on('matchmaking_cancelled', () => {
      setGamePhase('idle');
    });

    newSocket.on('game_start', () => {
      console.log('Game starting');
      setGamePhase('countdown');
    });

    newSocket.on('countdown', (data) => {
      console.log('Countdown:', data.count);
      setCountdown(data.count);
    });

    newSocket.on('signal', (data) => {
      console.log('Signal!', data.timestamp);
      setSignalTimestamp(data.timestamp);
      setCountdown(null);
    });

    newSocket.on('match_result', (data) => {
      console.log('Match result:', data);
      setMatchResult(data.winnerId, data.result);
    });

    newSocket.on('opponent_disconnected', (data) => {
      console.log('Opponent disconnected:', data);
      alert(data.win ? 'You win! Opponent disconnected.' : 'Match cancelled. Opponent disconnected.');
      setGamePhase('idle');
    });

    newSocket.on('error', (data) => {
      console.error('Socket error:', data);
      alert(data.message);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [state.token]);

  const joinMatchmaking = (userId: string, stake: number, walletAddress: string) => {
    if (socket && connected) {
      socket.emit('join_matchmaking', { userId, stake, walletAddress });
    }
  };

  const cancelMatchmaking = (userId: string, stake: number) => {
    if (socket && connected) {
      socket.emit('cancel_matchmaking', { userId, stake });
    }
  };

  const playerReady = (matchId: string) => {
    if (socket && connected) {
      socket.emit('player_ready', { matchId });
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
