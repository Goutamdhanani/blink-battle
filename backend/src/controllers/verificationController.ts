import { Request, Response } from 'express';
import axios from 'axios';

export class VerificationController {
  /**
   * Verify World ID proof
   */
  static async verifyWorldID(req: Request, res: Response) {
    try {
      const { payload, action } = req.body;

      if (!payload || payload.status !== 'success') {
        return res.status(400).json({ error: 'Invalid verification payload' });
      }

      const APP_ID = process.env.APP_ID;

      if (!APP_ID) {
        console.error('Missing APP_ID');
        return res.status(500).json({ error: 'Server configuration error' });
      }

      // Verify the proof with Worldcoin API
      const response = await axios.post(
        `https://developer.worldcoin.org/api/v1/verify/${APP_ID}`,
        {
          merkle_root: payload.merkle_root,
          nullifier_hash: payload.nullifier_hash,
          proof: payload.proof,
          verification_level: payload.verification_level,
          action: action,
        }
      );

      const verificationResult = response.data;

      if (verificationResult.success) {
        // Store verification status for user
        const userId = (req as any).userId;
        
        // In production, store this in the database
        console.log(`World ID verified for user ${userId}`);

        return res.json({
          success: true,
          verified: true,
          verification_level: payload.verification_level,
        });
      } else {
        return res.status(400).json({
          success: false,
          error: 'World ID verification failed',
          details: verificationResult,
        });
      }
    } catch (error: any) {
      console.error('World ID verification error:', error.response?.data || error);
      return res.status(500).json({
        error: 'Failed to verify World ID',
        details: error.response?.data || error.message,
      });
    }
  }
}
