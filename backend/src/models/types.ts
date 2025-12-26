export interface User {
  user_id: string;
  wallet_address: string;
  region?: string;
  wins: number;
  losses: number;
  avg_reaction_time?: number;
  created_at: Date;
  updated_at: Date;
}

export interface Match {
  match_id: string;
  player1_id: string;
  player2_id: string;
  stake: number;
  player1_reaction_ms?: number;
  player2_reaction_ms?: number;
  winner_id?: string;
  status: MatchStatus;
  fee?: number;
  signal_timestamp?: number;
  false_start_count: number;
  created_at: Date;
  completed_at?: Date;
}

export enum MatchStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

export interface Transaction {
  transaction_id: string;
  match_id: string;
  type: TransactionType;
  amount: number;
  from_wallet?: string;
  to_wallet?: string;
  status: TransactionStatus;
  created_at: Date;
}

export enum TransactionType {
  STAKE = 'stake',
  PAYOUT = 'payout',
  REFUND = 'refund',
  FEE = 'fee',
}

export enum TransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface MatchmakingRequest {
  userId: string;
  stake: number;
  region?: string;
  socketId: string;
}

export interface GameResult {
  matchId: string;
  winnerId?: string;
  player1ReactionMs?: number;
  player2ReactionMs?: number;
  reason: string;
}
