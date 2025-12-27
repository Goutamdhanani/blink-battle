import { useState } from 'react';
import axios from 'axios';
import { useGameContext } from '../context/GameContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * LEGACY/DEMO AUTH HOOK
 * 
 * This hook provides a legacy authentication method using the /api/auth/login endpoint.
 * 
 * ⚠️ WARNING: This is for DEMO/TESTING purposes only and should NOT be used in production.
 * 
 * In production, authentication should ALWAYS use MiniKit Wallet Auth (SIWE) via AuthWrapper.tsx
 * which calls /api/auth/nonce and /api/auth/verify-siwe endpoints.
 * 
 * The /api/auth/login endpoint bypasses proper SIWE authentication and is only kept for:
 * - Development/testing outside World App
 * - Demo mode when MiniKit is not available
 * 
 * DO NOT USE THIS HOOK FOR PAID BATTLES OR REAL WLD TRANSACTIONS.
 */
export const useWorldcoin = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setUser, setToken } = useGameContext();

  const login = async (walletAddress: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await axios.post(`${API_URL}/api/auth/login`, {
        walletAddress,
        region: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      if (response.data.success) {
        setToken(response.data.token);
        setUser(response.data.user);
        return true;
      }

      return false;
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.response?.data?.error || 'Failed to login');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const verifyProof = async (proof: any) => {
    // In production, this would verify the Worldcoin proof
    // For now, we'll just use the wallet address from the proof
    if (proof && proof.merkle_root) {
      // Simulate wallet address from proof
      const mockWallet = `0x${proof.merkle_root.substring(0, 40)}`;
      return await login(mockWallet);
    }
    return false;
  };

  return {
    login,
    verifyProof,
    loading,
    error,
  };
};
