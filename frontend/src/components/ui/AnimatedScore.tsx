/**
 * AnimatedScore Component
 * 
 * Displays scores with smooth count-up animations.
 */

import React, { useEffect, useState } from 'react';
import './AnimatedScore.css';

interface AnimatedScoreProps {
  value: number;
  duration?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
  decimals?: number;
}

export const AnimatedScore: React.FC<AnimatedScoreProps> = ({
  value,
  duration = 1000,
  suffix = '',
  prefix = '',
  className = '',
  decimals = 0,
}) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const startValue = displayValue;
    const difference = value - startValue;

    const animate = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (ease-out cubic)
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentValue = startValue + difference * easeOut;

      setDisplayValue(currentValue);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setDisplayValue(value);
      }
    };

    requestAnimationFrame(animate);
  }, [value, duration]);

  const formattedValue = displayValue.toFixed(decimals);

  return (
    <span className={`animated-score ${className}`}>
      {prefix}{formattedValue}{suffix}
    </span>
  );
};
