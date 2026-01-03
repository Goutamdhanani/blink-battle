import React from 'react';
import ReactionLights from './ReactionLights';
import './ReactionTestUI.css';

export type ReactionPhase = 'idle' | 'countdown' | 'waiting' | 'go' | 'tapped';

interface ReactionTestUIProps {
  phase: ReactionPhase;
  countdown?: number | null;
  onTap?: () => void;
  disabled?: boolean;
  reactionTime?: number | null;
  opponentInfo?: string;
}

/**
 * Shared reaction test UI component for both Practice and Battle modes
 * Features F1-style lights, consistent layout, and polished design
 */
const ReactionTestUI: React.FC<ReactionTestUIProps> = ({
  phase,
  countdown,
  onTap,
  disabled = false,
  reactionTime,
  opponentInfo,
}) => {
  // CRITICAL: Clamp countdown to valid range (prevent negative/invalid display)
  const clampedCountdown = countdown !== null && countdown !== undefined
    ? Math.max(0, Math.min(10, countdown))  // Valid range: 0-10
    : null;

  const renderContent = () => {
    switch (phase) {
      case 'countdown':
        return (
          <div className="reaction-test-content fade-in">
            <div className="reaction-status">
              <h2 className="reaction-status-text">Get Ready!</h2>
              {opponentInfo && (
                <p className="reaction-opponent">{opponentInfo}</p>
              )}
            </div>
            
            <ReactionLights state="red" countdown={clampedCountdown} />
            
            {clampedCountdown !== null && (
              <div className="reaction-countdown-display">
                <div className="reaction-countdown-number glow-secondary pulse">
                  {clampedCountdown}
                </div>
              </div>
            )}
          </div>
        );

      case 'waiting':
        return (
          <div 
            className="reaction-test-content reaction-clickable fade-in" 
            onClick={!disabled ? onTap : undefined}
          >
            <div className="reaction-status">
              <h2 className="reaction-status-text">Wait for it...</h2>
            </div>
            
            <ReactionLights state="red" countdown={0} />
            
            <div className="reaction-warning">
              <p className="reaction-warning-text">Don't tap early!</p>
            </div>
          </div>
        );

      case 'go':
        return (
          <div 
            className="reaction-test-content reaction-go-phase fade-in" 
            onClick={!disabled ? onTap : undefined}
          >
            <div className="reaction-status">
              <h2 className="reaction-status-text reaction-status-go">GO!</h2>
            </div>
            
            <ReactionLights state="green" />
            
            <div className={`reaction-tap-button ${disabled ? 'reaction-tap-button-disabled' : 'glow-green pulse'}`}>
              <div className="reaction-tap-button-inner">
                <span className="reaction-tap-text">TAP NOW!</span>
              </div>
            </div>
          </div>
        );

      case 'tapped':
        return (
          <div className="reaction-test-content fade-in">
            <div className="reaction-status">
              <h2 className="reaction-status-text">Tapped!</h2>
            </div>
            
            <ReactionLights state="green" />
            
            <div className="reaction-tap-button reaction-tap-button-tapped">
              <div className="reaction-tap-button-inner">
                <span className="reaction-tapped-text">✓ Tapped!</span>
              </div>
            </div>
            
            {reactionTime !== null && reactionTime !== undefined && (
              <div className="reaction-time-display fade-in">
                <span className="reaction-time-value">{reactionTime}ms</span>
                <span className="reaction-time-label">Your reaction</span>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="reaction-test-ui">
      {renderContent()}
    </div>
  );
};

export default ReactionTestUI;
