import React, { useState } from 'react';
import { GlassCard, NeonButton } from './ui';
import { apiClient } from '../lib/api';
import { minikit } from '../lib/minikit';

interface PendingRefund {
  paymentReference: string;
  amount: number;
  refundAmount: number;
  protocolFeePercent: number;
  createdAt: string;
  type: string;
  canClaimDeposit: boolean;
}

interface PendingRefundsProps {
  refunds: PendingRefund[];
  onRefundClaimed: () => void;
}

/**
 * PendingRefunds component
 * Shows orphaned payments (paid but not matched) with manual claim button
 * Displays 3% protocol fee prominently
 */
const PendingRefunds: React.FC<PendingRefundsProps> = ({ refunds, onRefundClaimed }) => {
  const [claimingRef, setClaimingRef] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!refunds || refunds.length === 0) {
    return null;
  }

  const handleClaimClick = (paymentReference: string) => {
    setShowConfirm(paymentReference);
  };

  const handleConfirmClaim = async (refund: PendingRefund) => {
    setShowConfirm(null);
    setClaimingRef(refund.paymentReference);
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[refund.paymentReference];
      return newErrors;
    });

    try {
      const response = await apiClient.post('/api/refund/claim-deposit', {
        paymentReference: refund.paymentReference
      });

      if (response.data.success) {
        minikit.sendHaptic('success');
        console.log('[PendingRefunds] Refund claimed successfully:', response.data);
        // Refresh the parent to update the refund list
        onRefundClaimed();
      } else {
        setErrors(prev => ({ 
          ...prev, 
          [refund.paymentReference]: 'Failed to claim refund' 
        }));
        minikit.sendHaptic('error');
      }
    } catch (error: any) {
      console.error('[PendingRefunds] Error claiming refund:', error);
      // Check if already claimed
      const errorData = error.response?.data;
      if (errorData?.alreadyClaimed) {
        // Hide button and refresh list
        console.log('[PendingRefunds] Refund already claimed, refreshing list');
        onRefundClaimed();
      } else {
        const errorMsg = errorData?.error || 'Network error - please try again';
        setErrors(prev => ({ 
          ...prev, 
          [refund.paymentReference]: errorMsg 
        }));
        minikit.sendHaptic('error');
      }
    } finally {
      setClaimingRef(null);
    }
  };

  const handleCancelConfirm = () => {
    setShowConfirm(null);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  return (
    <div className="pending-refunds-section" style={{ marginBottom: '2rem' }}>
      <h2 style={{ 
        fontSize: '1.2rem', 
        marginBottom: '1rem', 
        color: '#ffaa00',
        textAlign: 'center' 
      }}>
        ⚠️ Pending Refunds
      </h2>
      <p style={{ 
        fontSize: '0.9rem', 
        marginBottom: '1.5rem', 
        opacity: 0.8,
        textAlign: 'center',
        color: '#ffaa00'
      }}>
        These payments were not matched. You can claim a refund with a {refunds[0]?.protocolFeePercent || 3}% protocol fee.
      </p>

      {refunds.map((refund) => (
        <GlassCard key={refund.paymentReference} className="pending-refund-card">
          <div style={{ padding: '1rem' }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              marginBottom: '0.75rem',
              alignItems: 'center'
            }}>
              <span style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                Deposit Amount
              </span>
              <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#00ff88' }}>
                {refund.amount} WLD
              </span>
            </div>

            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              marginBottom: '0.75rem',
              alignItems: 'center',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              paddingTop: '0.75rem'
            }}>
              <span style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                Protocol Fee ({refund.protocolFeePercent}%)
              </span>
              <span style={{ fontSize: '0.95rem', color: '#ff6b6b' }}>
                -{(refund.amount - refund.refundAmount).toFixed(2)} WLD
              </span>
            </div>

            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              marginBottom: '1rem',
              alignItems: 'center',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              paddingTop: '0.75rem'
            }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>
                You Receive
              </span>
              <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#00ffff' }}>
                {refund.refundAmount.toFixed(2)} WLD
              </span>
            </div>

            <div style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '1rem' }}>
              {formatDate(refund.createdAt)}
            </div>

            {showConfirm === refund.paymentReference ? (
              <div style={{ 
                background: 'rgba(255, 170, 0, 0.1)', 
                padding: '1rem', 
                borderRadius: '8px',
                marginBottom: '0.75rem'
              }}>
                <p style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
                  Confirm refund claim? You'll receive {refund.refundAmount.toFixed(2)} WLD 
                  (after {refund.protocolFeePercent}% protocol fee).
                </p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <NeonButton
                    variant="primary"
                    size="small"
                    fullWidth
                    onClick={() => handleConfirmClaim(refund)}
                  >
                    Confirm Claim
                  </NeonButton>
                  <NeonButton
                    variant="secondary"
                    size="small"
                    fullWidth
                    onClick={handleCancelConfirm}
                  >
                    Cancel
                  </NeonButton>
                </div>
              </div>
            ) : (
              <NeonButton
                variant="primary"
                size="small"
                fullWidth
                onClick={() => handleClaimClick(refund.paymentReference)}
                disabled={claimingRef === refund.paymentReference}
              >
                {claimingRef === refund.paymentReference 
                  ? '⏳ Processing...' 
                  : '💰 Claim Refund'}
              </NeonButton>
            )}

            {errors[refund.paymentReference] && (
              <div style={{ 
                marginTop: '0.5rem', 
                color: '#ff0088', 
                fontSize: '0.85rem' 
              }}>
                ⚠️ {errors[refund.paymentReference]}
              </div>
            )}
          </div>
        </GlassCard>
      ))}
    </div>
  );
};

export default PendingRefunds;
