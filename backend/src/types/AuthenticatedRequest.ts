import { Request } from 'express';

/**
 * Authenticated request interface
 * Extends Express Request with user authentication data added by auth middleware
 */
export interface AuthenticatedRequest extends Request {
  userId: string;
  walletAddress: string;
}
