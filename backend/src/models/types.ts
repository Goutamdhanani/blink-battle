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
  tx_hash?: string;
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

/**
 * Enhanced match lifecycle events for observability
 */
export interface MatchLifecycleEvent {
  matchId: string;
  correlationId: string;
  eventType: MatchEventType;
  timestamp: number;
  data?: any;
}

export enum MatchEventType {
  MATCH_CREATED = 'match_created',
  PLAYER_JOINED = 'player_joined',
  PAYMENT_RECEIVED = 'payment_received',
  ESCROW_CREATED = 'escrow_created',
  ESCROW_VERIFIED = 'escrow_verified',
  PLAYER_READY = 'player_ready',
  GAME_STARTED = 'game_started',
  SIGNAL_SENT = 'signal_sent',
  PLAYER_REACTED = 'player_reacted',
  GAME_COMPLETED = 'game_completed',
  MATCH_CANCELLED = 'match_cancelled',
  REFUND_INITIATED = 'refund_initiated',
  REFUND_COMPLETED = 'refund_completed',
  PLAYER_DISCONNECTED = 'player_disconnected',
  PLAYER_RECONNECTED = 'player_reconnected',
  TIMEOUT = 'timeout',
  ERROR = 'error',
}

/**
 * Socket event payloads for client communication
 */
export interface MatchFoundPayload {
  matchId: string;
  opponent: {
    userId: string;
    wallet: string;
  };
  stake: number;
  needsPayment: boolean;
  platformWallet?: string;
  reconnected?: boolean;
  state?: string;
  escrowStatus?: EscrowStatus;
}

export interface MatchStatusPayload {
  matchId: string;
  state: string;
  escrowStatus: EscrowStatus;
  player1Status: PlayerStatus;
  player2Status: PlayerStatus;
  canProceed: boolean;
  error?: string;
}

export interface PlayerStatus {
  userId: string;
  connected: boolean;
  staked: boolean;
  ready: boolean;
  reacted: boolean;
}

export enum EscrowStatus {
  NOT_REQUIRED = 'not_required',  // Free match
  PENDING = 'pending',            // Waiting for deposits
  PARTIAL = 'partial',            // One player deposited
  FUNDED = 'funded',              // Both players deposited
  VERIFIED = 'verified',          // On-chain verification passed
  LOCKED = 'locked',              // Game started, funds locked
  DISTRIBUTED = 'distributed',    // Winner paid
  REFUNDED = 'refunded',         // Players refunded
  FAILED = 'failed',             // Escrow creation failed
}
