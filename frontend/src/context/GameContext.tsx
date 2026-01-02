import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface User {
  userId: string;
  walletAddress: string;
  wins: number;
  losses: number;
  avgReactionTime?: number;
}

export interface GameState {
  user: User | null;
  token: string | null;
  matchId: string | null;
  opponentWallet: string | null;
  stake: number | null;
  gamePhase: 'idle' | 'matchmaking' | 'countdown' | 'waiting' | 'signal' | 'result';
  countdown: number | null;
  signalTimestamp: number | null;
  yourReaction: number | null;
  opponentReaction: number | null;
  winnerId: string | null;
  result: string | null;
}

interface GameContextType {
  state: GameState;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setMatch: (matchId: string, opponentWallet: string, stake: number) => void;
  setGamePhase: (phase: GameState['gamePhase']) => void;
  setCountdown: (count: number | null) => void;
  setSignalTimestamp: (timestamp: number | null) => void;
  setReactions: (yourReaction: number | null, opponentReaction: number | null) => void;
  setMatchResult: (winnerId: string | null, result: string) => void;
  resetGame: () => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

const initialState: GameState = {
  user: null,
  token: null,
  matchId: null,
  opponentWallet: null,
  stake: null,
  gamePhase: 'idle',
  countdown: null,
  signalTimestamp: null,
  yourReaction: null,
  opponentReaction: null,
  winnerId: null,
  result: null,
};

export const GameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<GameState>(() => {
    console.log('🎮 [GameProvider] Initializing state...');
    
    // Restore token + user
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    const storedMatchId = localStorage.getItem('activeMatchId');

    let initialUser = null;
    if (storedUser) {
      try {
        initialUser = JSON.parse(storedUser);
        console.log('✅ [GameProvider] Restored user from localStorage');
      } catch (e) {
        console.error('❌ [GameProvider] Failed to parse stored user:', e);
        localStorage.removeItem('user');
      }
    }

    if (storedToken) {
      console.log('✅ [GameProvider] Restored token from localStorage');
    }

    if (storedMatchId) {
      console.log('✅ [GameProvider] Restored active match ID from localStorage');
    }

    return {
      ...initialState,
      token: storedToken,
      user: initialUser,
      matchId: storedMatchId,
    };
  });

  const setUser = (user: User | null) => {
    setState((prev) => ({ ...prev, user }));
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('user');
    }
  };

  const setToken = (token: string | null) => {
    setState((prev) => ({ ...prev, token }));
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('activeMatchId');
    }
  };

  const setMatch = (matchId: string, opponentWallet: string, stake: number) => {
    localStorage.setItem('activeMatchId', matchId);

    setState((prev) => ({
      ...prev,
      matchId,
      opponentWallet,
      stake,
      gamePhase: 'countdown',
    }));
  };

  const setGamePhase = (phase: GameState['gamePhase']) => {
    setState((prev) => ({ ...prev, gamePhase: phase }));
  };

  const setCountdown = (count: number | null) => {
    setState((prev) => ({ ...prev, countdown: count }));
  };

  const setSignalTimestamp = (timestamp: number | null) => {
    setState((prev) => ({ ...prev, signalTimestamp: timestamp, gamePhase: 'signal' }));
  };

  const setReactions = (yourReaction: number | null, opponentReaction: number | null) => {
    setState((prev) => ({ ...prev, yourReaction, opponentReaction }));
  };

  const setMatchResult = (winnerId: string | null, result: string) => {
    setState((prev) => ({
      ...prev,
      winnerId,
      result,
      gamePhase: 'result',
    }));
  };

  const resetGame = () => {
    localStorage.removeItem('activeMatchId');

    setState((prev) => ({
      ...initialState,
      user: prev.user,
      token: prev.token,
    }));
  };

  return (
    <GameContext.Provider
      value={{
        state,
        setUser,
        setToken,
        setMatch,
        setGamePhase,
        setCountdown,
        setSignalTimestamp,
        setReactions,
        setMatchResult,
        resetGame,
      }}
    >
      {children}
    </GameContext.Provider>
  );
};

export const useGameContext = () => {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGameContext must be used within a GameProvider');
  }
  return context;
};
