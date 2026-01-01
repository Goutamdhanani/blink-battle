// Mock dependencies first before imports
const mockContractService = {
  createMatch: jest.fn(),
  completeMatch: jest.fn(),
  cancelMatch: jest.fn(),
  splitPot: jest.fn(),
  getMatch: jest.fn(),
  isMatchReady: jest.fn(),
  verifyOnChainStakeStatus: jest.fn(),
};

const mockTransactionModel = {
  create: jest.fn(),
  updateStatus: jest.fn(),
  getByMatchId: jest.fn(),
};

jest.mock('../contractService', () => ({
  getContractService: jest.fn(() => mockContractService),
}));

jest.mock('../../models/Transaction', () => ({
  TransactionModel: mockTransactionModel,
  TransactionType: {
    STAKE: 'stake',
    PAYOUT: 'payout',
    REFUND: 'refund',
    FEE: 'fee',
  },
  TransactionStatus: {
    PENDING: 'pending',
    COMPLETED: 'completed',
    FAILED: 'failed',
  },
}));

import { EscrowService } from '../escrow';

// Helper functions
const resetAllMocks = () => {
  Object.values(mockContractService).forEach(mock => mock.mockReset());
  Object.values(mockTransactionModel).forEach(mock => mock.mockReset());
};

const createSuccessResponse = (txHash: string = '0x123...') => ({
  success: true,
  txHash,
});

const createFailureResponse = (error: string = 'Transaction failed') => ({
  success: false,
  error,
});

const createMockMatchData = (params: {
  player1: string;
  player2: string;
  stakeAmount: string;
  player1Staked?: boolean;
  player2Staked?: boolean;
  completed?: boolean;
  cancelled?: boolean;
}) => ({
  player1: params.player1,
  player2: params.player2,
  stakeAmount: params.stakeAmount,
  player1Staked: params.player1Staked ?? false,
  player2Staked: params.player2Staked ?? false,
  completed: params.completed ?? false,
  cancelled: params.cancelled ?? false,
});

const createMockTransaction = (params: {
  matchId: string;
  type: string;
  amount: number;
  fromWallet?: string;
  toWallet?: string;
  txHash?: string;
  status?: string;
}) => {
  // Use counter for deterministic IDs in tests
  const counter = Math.floor(Date.now() + Math.random() * 1000);
  return {
    transaction_id: `tx_test_${counter}`,
    match_id: params.matchId,
    type: params.type,
    amount: params.amount,
    from_wallet: params.fromWallet,
    to_wallet: params.toWallet,
    tx_hash: params.txHash || '0x123...',
    status: params.status || 'pending',
    created_at: new Date(),
  };
};

const setupMatchVerification = (params: {
  exists: boolean;
  stakeAmount: string;
  player1Staked?: boolean;
  player2Staked?: boolean;
  completed?: boolean;
  cancelled?: boolean;
}) => {
  if (!params.exists) {
    mockContractService.getMatch.mockResolvedValue(null);
  } else {
    mockContractService.getMatch.mockResolvedValue(
      createMockMatchData({
        player1: '0xPlayer1',
        player2: '0xPlayer2',
        stakeAmount: params.stakeAmount,
        player1Staked: params.player1Staked,
        player2Staked: params.player2Staked,
        completed: params.completed,
        cancelled: params.cancelled,
      })
    );
  }
};

const setupStakeStatusVerification = (params: {
  hasStakes: boolean;
  player1Staked: boolean;
  player2Staked: boolean;
  error?: string;
}) => {
  mockContractService.verifyOnChainStakeStatus.mockResolvedValue({
    hasStakes: params.hasStakes,
    player1Staked: params.player1Staked,
    player2Staked: params.player2Staked,
    error: params.error,
  });
};

describe('EscrowService', () => {
  const TEST_MATCH_ID = 'match_123';
  const PLAYER1_WALLET = '0xPlayer1';
  const PLAYER2_WALLET = '0xPlayer2';
  const STAKE_AMOUNT = 1.0;

  beforeEach(() => {
    resetAllMocks();
  });

  describe('verifyEscrowOnChain', () => {
    it('should verify escrow exists with correct stake', async () => {
      setupMatchVerification({
        exists: true,
        stakeAmount: '1.0',
        player1Staked: true,
        player2Staked: true,
      });

      const result = await EscrowService.verifyEscrowOnChain(TEST_MATCH_ID, STAKE_AMOUNT);

      expect(result.verified).toBe(true);
      expect(result.error).toBeUndefined();
      expect(mockContractService.getMatch).toHaveBeenCalledWith(TEST_MATCH_ID);
    });

    it('should fail verification if match not found on-chain', async () => {
      setupMatchVerification({ exists: false, stakeAmount: '0' });

      const result = await EscrowService.verifyEscrowOnChain(TEST_MATCH_ID, STAKE_AMOUNT);

      expect(result.verified).toBe(false);
      expect(result.error).toBe('Match not found on-chain');
    });

    it('should fail verification if stake amount mismatches', async () => {
      setupMatchVerification({
        exists: true,
        stakeAmount: '0.5', // Different from expected 1.0
      });

      const result = await EscrowService.verifyEscrowOnChain(TEST_MATCH_ID, STAKE_AMOUNT);

      expect(result.verified).toBe(false);
      expect(result.error).toContain('Stake mismatch');
    });

    it('should allow small rounding differences in stake amount', async () => {
      setupMatchVerification({
        exists: true,
        stakeAmount: '1.0001', // Within tolerance
      });

      const result = await EscrowService.verifyEscrowOnChain(TEST_MATCH_ID, STAKE_AMOUNT);

      expect(result.verified).toBe(true);
    });

    it('should fail verification if match already completed', async () => {
      setupMatchVerification({
        exists: true,
        stakeAmount: '1.0',
        completed: true,
      });

      const result = await EscrowService.verifyEscrowOnChain(TEST_MATCH_ID, STAKE_AMOUNT);

      expect(result.verified).toBe(false);
      expect(result.error).toContain('completed');
    });

    it('should fail verification if match already cancelled', async () => {
      setupMatchVerification({
        exists: true,
        stakeAmount: '1.0',
        cancelled: true,
      });

      const result = await EscrowService.verifyEscrowOnChain(TEST_MATCH_ID, STAKE_AMOUNT);

      expect(result.verified).toBe(false);
      expect(result.error).toContain('cancelled');
    });
  });

  describe('lockFunds', () => {
    it('should create escrow on-chain and record transactions', async () => {
      mockContractService.createMatch.mockResolvedValue(createSuccessResponse('0xabc123'));
      mockTransactionModel.getByMatchId.mockResolvedValue([]);
      mockTransactionModel.create.mockResolvedValue(
        createMockTransaction({
          matchId: TEST_MATCH_ID,
          type: 'stake',
          amount: STAKE_AMOUNT,
          txHash: '0xabc123',
        })
      );
      mockTransactionModel.updateStatus.mockResolvedValue(undefined);

      const result = await EscrowService.lockFunds(
        TEST_MATCH_ID,
        PLAYER1_WALLET,
        PLAYER2_WALLET,
        STAKE_AMOUNT
      );

      expect(result.success).toBe(true);
      expect(result.txHash).toBeDefined();
      expect(mockContractService.createMatch).toHaveBeenCalledWith(
        TEST_MATCH_ID,
        PLAYER1_WALLET,
        PLAYER2_WALLET,
        STAKE_AMOUNT
      );
      expect(mockTransactionModel.create).toHaveBeenCalledTimes(2); // Two stake transactions
    });

    it('should skip creation if escrow already exists (idempotency)', async () => {
      // First call: Setup verification to show escrow exists
      setupMatchVerification({
        exists: true,
        stakeAmount: '1.0',
        player1Staked: true,
        player2Staked: true,
      });

      const existingTx = createMockTransaction({
        matchId: TEST_MATCH_ID,
        type: 'stake',
        amount: STAKE_AMOUNT,
        txHash: '0xold_hash',
      });
      mockTransactionModel.getByMatchId.mockResolvedValue([existingTx]);

      const result = await EscrowService.lockFunds(
        TEST_MATCH_ID,
        PLAYER1_WALLET,
        PLAYER2_WALLET,
        STAKE_AMOUNT
      );

      expect(result.success).toBe(true);
      expect(result.txHash).toBe('0xold_hash');
      expect(mockContractService.createMatch).not.toHaveBeenCalled();
    });

    it('should handle contract creation failure', async () => {
      mockContractService.getMatch.mockResolvedValue(null);
      mockTransactionModel.getByMatchId.mockResolvedValue([]);
      mockContractService.createMatch.mockResolvedValue(
        createFailureResponse('Insufficient gas')
      );

      const result = await EscrowService.lockFunds(
        TEST_MATCH_ID,
        PLAYER1_WALLET,
        PLAYER2_WALLET,
        STAKE_AMOUNT
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient gas');
      expect(mockTransactionModel.create).not.toHaveBeenCalled();
    });
  });

  describe('distributeWinnings', () => {
    it('should distribute winnings on-chain with fee calculation', async () => {
      mockContractService.completeMatch.mockResolvedValue(createSuccessResponse('0xtx_win'));
      mockTransactionModel.getByMatchId.mockResolvedValue([]); // No existing payouts
      mockTransactionModel.create.mockResolvedValue(
        createMockTransaction({
          matchId: TEST_MATCH_ID,
          type: 'payout',
          amount: 1.94,
        })
      );
      mockTransactionModel.updateStatus.mockResolvedValue(undefined);

      const result = await EscrowService.distributeWinnings(
        TEST_MATCH_ID,
        PLAYER1_WALLET,
        STAKE_AMOUNT
      );

      expect(result.success).toBe(true);
      expect(result.txHash).toBe('0xtx_win');
      expect(mockContractService.completeMatch).toHaveBeenCalledWith(TEST_MATCH_ID, PLAYER1_WALLET);
      // Should create payout + fee transactions
      expect(mockTransactionModel.create).toHaveBeenCalledTimes(2);
    });

    it('should be idempotent and return existing payout', async () => {
      const existingPayout = createMockTransaction({
        matchId: TEST_MATCH_ID,
        type: 'payout',
        amount: 1.94,
        txHash: '0xold_payout',
        status: 'completed',
      });
      mockTransactionModel.getByMatchId.mockResolvedValue([existingPayout]);

      const result = await EscrowService.distributeWinnings(
        TEST_MATCH_ID,
        PLAYER1_WALLET,
        STAKE_AMOUNT
      );

      expect(result.success).toBe(true);
      expect(result.txHash).toBe('0xold_payout');
      expect(mockContractService.completeMatch).not.toHaveBeenCalled();
    });

    it('should handle contract completion failure', async () => {
      mockTransactionModel.getByMatchId.mockResolvedValue([]);
      mockContractService.completeMatch.mockResolvedValue(
        createFailureResponse('Match already completed')
      );

      const result = await EscrowService.distributeWinnings(
        TEST_MATCH_ID,
        PLAYER1_WALLET,
        STAKE_AMOUNT
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Match already completed');
    });
  });

  describe('refundBothPlayers', () => {
    it('should refund players when escrow exists and stakes confirmed', async () => {
      mockTransactionModel.getByMatchId.mockResolvedValue([]);
      setupMatchVerification({
        exists: true,
        stakeAmount: '1.0',
        player1Staked: true,
        player2Staked: true,
      });
      setupStakeStatusVerification({
        hasStakes: true,
        player1Staked: true,
        player2Staked: true,
      });
      mockContractService.cancelMatch.mockResolvedValue(createSuccessResponse('0xtx_refund'));
      mockTransactionModel.create.mockResolvedValue(
        createMockTransaction({
          matchId: TEST_MATCH_ID,
          type: 'refund',
          amount: STAKE_AMOUNT,
        })
      );
      mockTransactionModel.updateStatus.mockResolvedValue(undefined);

      const result = await EscrowService.refundBothPlayers(
        TEST_MATCH_ID,
        PLAYER1_WALLET,
        PLAYER2_WALLET,
        STAKE_AMOUNT
      );

      expect(result.success).toBe(true);
      expect(result.txHash).toBe('0xtx_refund');
      expect(mockContractService.cancelMatch).toHaveBeenCalledWith(TEST_MATCH_ID);
      expect(mockTransactionModel.create).toHaveBeenCalledTimes(2); // Two refund transactions
    });

    it('should be idempotent and return existing refund', async () => {
      const existingRefunds = [
        createMockTransaction({
          matchId: TEST_MATCH_ID,
          type: 'refund',
          amount: STAKE_AMOUNT,
          txHash: '0xold_refund',
          status: 'completed',
        }),
        createMockTransaction({
          matchId: TEST_MATCH_ID,
          type: 'refund',
          amount: STAKE_AMOUNT,
          txHash: '0xold_refund',
          status: 'completed',
        }),
      ];
      mockTransactionModel.getByMatchId.mockResolvedValue(existingRefunds);

      const result = await EscrowService.refundBothPlayers(
        TEST_MATCH_ID,
        PLAYER1_WALLET,
        PLAYER2_WALLET,
        STAKE_AMOUNT
      );

      expect(result.success).toBe(true);
      expect(result.txHash).toBe('0xold_refund');
      expect(mockContractService.cancelMatch).not.toHaveBeenCalled();
    });

    it('should fail if no escrow exists on-chain', async () => {
      mockTransactionModel.getByMatchId.mockResolvedValue([]);
      setupMatchVerification({
        exists: true,
        stakeAmount: '0.0', // No escrow
      });

      const result = await EscrowService.refundBothPlayers(
        TEST_MATCH_ID,
        PLAYER1_WALLET,
        PLAYER2_WALLET,
        STAKE_AMOUNT
      );

      expect(result.success).toBe(false);
      expect(result.noEscrow).toBe(true);
      expect(result.error).toContain('No on-chain escrow found');
    });

    it('should fail if no stakes deposited', async () => {
      mockTransactionModel.getByMatchId.mockResolvedValue([]);
      setupMatchVerification({
        exists: true,
        stakeAmount: '1.0',
        player1Staked: false,
        player2Staked: false,
      });

      const result = await EscrowService.refundBothPlayers(
        TEST_MATCH_ID,
        PLAYER1_WALLET,
        PLAYER2_WALLET,
        STAKE_AMOUNT
      );

      expect(result.success).toBe(false);
      expect(result.noEscrow).toBe(true);
      expect(result.error).toContain('No stakes deposited on-chain');
    });
  });

  describe('splitPot', () => {
    it('should split pot 50/50 with fee deduction', async () => {
      mockTransactionModel.getByMatchId.mockResolvedValue([]);
      mockContractService.splitPot.mockResolvedValue(createSuccessResponse('0xtx_split'));
      mockTransactionModel.create.mockResolvedValue(
        createMockTransaction({
          matchId: TEST_MATCH_ID,
          type: 'payout',
          amount: 0.97,
        })
      );
      mockTransactionModel.updateStatus.mockResolvedValue(undefined);

      const result = await EscrowService.splitPot(
        TEST_MATCH_ID,
        PLAYER1_WALLET,
        PLAYER2_WALLET,
        STAKE_AMOUNT
      );

      expect(result.success).toBe(true);
      expect(result.txHash).toBe('0xtx_split');
      expect(mockContractService.splitPot).toHaveBeenCalledWith(TEST_MATCH_ID);
      // Should create 2 payout + 1 fee transactions
      expect(mockTransactionModel.create).toHaveBeenCalledTimes(3);
    });

    it('should be idempotent and return existing split', async () => {
      const existingPayouts = [
        createMockTransaction({
          matchId: TEST_MATCH_ID,
          type: 'payout',
          amount: 0.97,
          txHash: '0xold_split',
          status: 'completed',
        }),
        createMockTransaction({
          matchId: TEST_MATCH_ID,
          type: 'payout',
          amount: 0.97,
          txHash: '0xold_split',
          status: 'completed',
        }),
      ];
      mockTransactionModel.getByMatchId.mockResolvedValue(existingPayouts);

      const result = await EscrowService.splitPot(
        TEST_MATCH_ID,
        PLAYER1_WALLET,
        PLAYER2_WALLET,
        STAKE_AMOUNT
      );

      expect(result.success).toBe(true);
      expect(result.txHash).toBe('0xold_split');
      expect(mockContractService.splitPot).not.toHaveBeenCalled();
    });
  });
});
