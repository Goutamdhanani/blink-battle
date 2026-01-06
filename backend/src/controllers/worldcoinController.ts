import { Request, Response } from 'express';
import { IVerifyResponse, verifyCloudProof } from '@worldcoin/minikit-js';
import pool from '../config/database';

// Debug logging flag
const DEBUG = process.env.DEBUG_WORLDCOIN === 'true';

// Interface for error response from World ID verification
interface IWorldIdErrorResponse {
  success: false;
  detail?: string;
  code?: string;
  attribute?: string | null;
}

// Extended Request interface with authenticated user
interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    walletAddress?: string;
  };
}

/**
 * Verify World ID proof from MiniKit
 * This endpoint receives the proof from the frontend and verifies it with Worldcoin
 */
export class WorldcoinController {
  /**
   * Verify World ID proof
   * POST /api/verify-worldcoin
   */
  static async verifyWorldId(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { proof, merkle_root, nullifier_hash, verification_level, signal } = req.body;

      if (DEBUG) {
        console.log('[WorldID] Verification request received:', {
          hasProof: !!proof,
          hasMerkleRoot: !!merkle_root,
          hasNullifier: !!nullifier_hash,
          verificationLevel: verification_level,
        });
      }

      // Validate required fields
      if (!proof || !merkle_root || !nullifier_hash) {
        res.status(400).json({ 
          success: false, 
          error: 'Missing required fields: proof, merkle_root, nullifier_hash' 
        });
        return;
      }

      const appId = process.env.APP_ID;
      const action = process.env.WORLD_ID_ACTION || 'verify-unique-human';

      if (!appId || !appId.startsWith('app_')) {
        console.error('[WorldID] APP_ID not configured properly in environment');
        res.status(500).json({ 
          success: false, 
          error: 'Server configuration error: APP_ID not set or invalid format' 
        });
        return;
      }

      if (DEBUG) {
        console.log('[WorldID] Verifying with:', { appId, action });
      }

      // Verify the proof with Worldcoin's cloud service
      const verifyRes: IVerifyResponse = await verifyCloudProof(
        proof,
        appId as `app_${string}`,
        action,
        nullifier_hash
      );

      if (DEBUG) {
        console.log('[WorldID] Verification response:', {
          success: verifyRes.success,
        });
      }

      if (!verifyRes.success) {
        const errorResponse = verifyRes as unknown as IWorldIdErrorResponse;
        console.warn('[WorldID] Verification failed:', errorResponse);
        res.status(400).json({ 
          success: false, 
          error: 'World ID verification failed',
          detail: errorResponse.detail || 'Invalid proof',
          code: errorResponse.code,
        });
        return;
      }

      // Check if this nullifier has been used before (prevent duplicate accounts)
      const existingUser = await pool.query(
        'SELECT id, wallet_address FROM users WHERE world_id_nullifier = $1',
        [nullifier_hash]
      );

      if (existingUser.rows.length > 0) {
        console.warn('[WorldID] Nullifier already used:', nullifier_hash.substring(0, 10) + '...');
        res.status(409).json({ 
          success: false, 
          error: 'This World ID has already been used',
          code: 'DUPLICATE_NULLIFIER',
        });
        return;
      }

      // Store the verified World ID data
      // Note: This assumes user is already authenticated via wallet
      // You might need to adjust this based on your auth flow
      const userId = req.user?.userId;

      if (userId) {
        // Update existing user with World ID verification
        await pool.query(
          `UPDATE users 
           SET world_id_nullifier = $1, 
               world_id_verified = true, 
               world_id_verification_level = $2,
               updated_at = NOW()
           WHERE id = $3`,
          [nullifier_hash, verification_level, userId]
        );

        if (DEBUG) {
          console.log('[WorldID] Updated user:', userId);
        }
      } else {
        // Store nullifier for future linking
        // This can be used when user logs in with wallet later
        await pool.query(
          `INSERT INTO world_id_verifications (nullifier_hash, verification_level, verified_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (nullifier_hash) DO NOTHING`,
          [nullifier_hash, verification_level]
        );

        if (DEBUG) {
          console.log('[WorldID] Stored verification for later linking');
        }
      }

      res.json({ 
        success: true, 
        nullifier_hash,
        verification_level,
        message: 'World ID verified successfully',
      });
    } catch (error) {
      console.error('[WorldID] Verification error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error during verification',
        detail: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Check if a nullifier has been used
   * GET /api/verify-worldcoin/check/:nullifier
   */
  static async checkNullifier(req: Request, res: Response): Promise<void> {
    try {
      const { nullifier } = req.params;

      const result = await pool.query(
        `SELECT EXISTS(
          SELECT 1 FROM users WHERE world_id_nullifier = $1
          UNION
          SELECT 1 FROM world_id_verifications WHERE nullifier_hash = $1
        ) as exists`,
        [nullifier]
      );

      res.json({ 
        exists: result.rows[0]?.exists || false,
      });
    } catch (error) {
      console.error('[WorldID] Check nullifier error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to check nullifier',
      });
    }
  }
}
