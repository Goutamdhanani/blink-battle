/**
 * Mock implementations for testing escrow and contract services
 */

export const mockContractService = {
  createMatch: jest.fn(),
  completeMatch: jest.fn(),
  cancelMatch: jest.fn(),
  splitPot: jest.fn(),
  getMatch: jest.fn(),
  isMatchReady: jest.fn(),
  verifyOnChainStakeStatus: jest.fn(),
};

export const mockTransactionModel = {
  create: jest.fn(),
  updateStatus: jest.fn(),
  getByMatchId: jest.fn(),
};

/**
 * Reset all mocks
 */
export const resetAllMocks = () => {
  Object.values(mockContractService).forEach(mock => mock.mockReset());
  Object.values(mockTransactionModel).forEach(mock => mock.mockReset());
};

/**
 * Create successful contract response
 */
export const createSuccessResponse = (txHash: string = '0x123...') => ({
  success: true,
  txHash,
});

/**
 * Create failed contract response
 */
export const createFailureResponse = (error: string = 'Transaction failed') => ({
  success: false,
  error,
});

/**
 * Create mock match data from contract
 */
export const createMockMatchData = (params: {
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

/**
 * Create mock transaction
 */
export const createMockTransaction = (params: {
  matchId: string;
  type: string;
  amount: number;
  fromWallet?: string;
  toWallet?: string;
  txHash?: string;
  status?: string;
}) => ({
  transaction_id: `tx_${Math.random().toString(36).substr(2, 9)}`,
  match_id: params.matchId,
  type: params.type,
  amount: params.amount,
  from_wallet: params.fromWallet,
  to_wallet: params.toWallet,
  tx_hash: params.txHash || '0x123...',
  status: params.status || 'pending',
  created_at: new Date(),
});

/**
 * Setup mock for successful escrow creation
 */
export const setupSuccessfulEscrowCreation = (matchId: string, txHash: string = '0xabc123') => {
  mockContractService.createMatch.mockResolvedValue(createSuccessResponse(txHash));
  mockTransactionModel.create.mockResolvedValue(
    createMockTransaction({
      matchId,
      type: 'stake',
      amount: 1.0,
      txHash,
    })
  );
  mockTransactionModel.updateStatus.mockResolvedValue(undefined);
};

/**
 * Setup mock for failed escrow creation
 */
export const setupFailedEscrowCreation = (error: string = 'Insufficient funds') => {
  mockContractService.createMatch.mockResolvedValue(createFailureResponse(error));
};

/**
 * Setup mock for match verification
 */
export const setupMatchVerification = (params: {
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

/**
 * Setup mock for stake status verification
 */
export const setupStakeStatusVerification = (params: {
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
