import React, { useEffect, useState } from 'react';
import './SmoothCountdown.css';

interface SmoothCountdownProps {
  countdown: number | null;
  onComplete?: () => void;
}

/**
 * SmoothCountdown component with CSS-only transitions
 * Uses GPU-accelerated animations for smooth, glitch-free countdown
 */
const SmoothCountdown: React.FC<SmoothCountdownProps> = ({ countdown, onComplete }) => {
  const [displayNumber, setDisplayNumber] = useState<number | null>(null);
  const [animationKey, setAnimationKey] = useState(0);

  useEffect(() => {
    if (countdown !== null && countdown !== displayNumber) {
      setDisplayNumber(countdown);
      setAnimationKey(prev => prev + 1);
      
      // Call onComplete if countdown reaches 0 (optional callback, not in dependency array to avoid unnecessary re-renders)
      if (countdown === 0 && onComplete) {
        onComplete();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown, displayNumber]); // Intentionally exclude onComplete from deps

  if (displayNumber === null || displayNumber <= 0) {
    return null;
  }

  return (
    <div className="smooth-countdown-container">
      <div 
        key={animationKey}
        className="smooth-countdown-number"
      >
        {displayNumber}
      </div>
    </div>
  );
};

export default React.memo(SmoothCountdown);
