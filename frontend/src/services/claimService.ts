import axios from 'axios';

// Normalize API base URL to ensure no trailing slash
const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');

export interface ClaimResult {
  success: boolean;
  txHash?: string;
  amount?: string;
  amountFormatted?: string;
  error?: string;
  details?: string;
  claim?: {
    txHash?: string;
    amount?: string;
    amountFormatted?: string;
    status?: string;
  };
}

export interface ClaimStatus {
  matchId: string;
  claimable: boolean;
  isWinner?: boolean;
  winnerWallet?: string;
  amount?: string;
  amountFormatted?: string;
  deadline?: string;
  status?: string;
  txHash?: string;
  deadlineExpired?: boolean;
  reason?: string;
  matchStatus?: string;
}

/**
 * Claim winnings for a completed match
 */
export async function claimWinnings(matchId: string, token: string): Promise<ClaimResult> {
  try {
    const response = await axios.post<ClaimResult>(
      `${API_BASE_URL}/api/claim`, // Fixed: removed potential double-slash
      { matchId },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error: any) {
    console.error('[ClaimService] Error claiming winnings:', error);
    
    if (error.response?.data) {
      return {
        success: false,
        error: error.response.data.error || 'Failed to claim winnings',
        details: error.response.data.details
      };
    }
    
    return {
      success: false,
      error: 'Network error - failed to claim winnings'
    };
  }
}

/**
 * Get claim status for a match
 */
export async function getClaimStatus(matchId: string, token: string): Promise<ClaimStatus | null> {
  try {
    const response = await axios.get<ClaimStatus>(
      `${API_BASE_URL}/api/claim/status/${matchId}`, // Fixed: removed potential double-slash
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    return response.data;
  } catch (error: any) {
    console.error('[ClaimService] Error getting claim status:', error);
    return null;
  }
}
