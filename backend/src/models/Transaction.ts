import pool from '../config/database';
import { Transaction, TransactionType, TransactionStatus } from './types';

export class TransactionModel {
  static async create(
    matchId: string,
    type: TransactionType,
    amount: number,
    fromWallet?: string,
    toWallet?: string,
    txHash?: string
  ): Promise<Transaction> {
    const result = await pool.query(
      `INSERT INTO transactions (match_id, type, amount, from_wallet, to_wallet, status, tx_hash) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [matchId, type, amount, fromWallet, toWallet, TransactionStatus.PENDING, txHash || null]
    );
    return result.rows[0];
  }

  static async updateStatus(
    transactionId: string,
    status: TransactionStatus
  ): Promise<void> {
    await pool.query(
      'UPDATE transactions SET status = $1 WHERE transaction_id = $2',
      [status, transactionId]
    );
  }

  static async getByMatchId(matchId: string): Promise<Transaction[]> {
    const result = await pool.query(
      'SELECT * FROM transactions WHERE match_id = $1 ORDER BY created_at DESC',
      [matchId]
    );
    return result.rows;
  }
}
