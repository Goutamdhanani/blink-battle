/**
 * ParticleEffects Component
 * 
 * Displays confetti and particle effects for celebrations.
 */

import React, { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';

interface ParticleEffectsProps {
  trigger: boolean;
  type?: 'confetti' | 'stars' | 'fireworks';
  onComplete?: () => void;
}

export const ParticleEffects: React.FC<ParticleEffectsProps> = ({
  trigger,
  type = 'confetti',
  onComplete,
}) => {
  const triggeredRef = useRef(false);

  useEffect(() => {
    if (trigger && !triggeredRef.current) {
      triggeredRef.current = true;
      triggerEffect(type);
      
      setTimeout(() => {
        triggeredRef.current = false;
        onComplete?.();
      }, 3000);
    }
  }, [trigger, type, onComplete]);

  const triggerEffect = (effectType: string) => {
    switch (effectType) {
      case 'confetti':
        triggerConfetti();
        break;
      case 'stars':
        triggerStars();
        break;
      case 'fireworks':
        triggerFireworks();
        break;
      default:
        triggerConfetti();
    }
  };

  const triggerConfetti = () => {
    const count = 200;
    const defaults = {
      origin: { y: 0.7 },
      zIndex: 9999,
    };

    function fire(particleRatio: number, opts: confetti.Options) {
      confetti({
        ...defaults,
        ...opts,
        particleCount: Math.floor(count * particleRatio),
      });
    }

    fire(0.25, {
      spread: 26,
      startVelocity: 55,
    });

    fire(0.2, {
      spread: 60,
    });

    fire(0.35, {
      spread: 100,
      decay: 0.91,
      scalar: 0.8,
    });

    fire(0.1, {
      spread: 120,
      startVelocity: 25,
      decay: 0.92,
      scalar: 1.2,
    });

    fire(0.1, {
      spread: 120,
      startVelocity: 45,
    });
  };

  const triggerStars = () => {
    const defaults = {
      spread: 360,
      ticks: 50,
      gravity: 0,
      decay: 0.94,
      startVelocity: 30,
      shapes: ['star'] as confetti.Shape[],
      colors: ['FFE400', 'FFBD00', 'E89400', 'FFCA6C', 'FDFFB8'],
      zIndex: 9999,
    };

    confetti({
      ...defaults,
      particleCount: 40,
      scalar: 1.2,
      shapes: ['star'] as confetti.Shape[],
    });

    confetti({
      ...defaults,
      particleCount: 10,
      scalar: 0.75,
      shapes: ['circle'] as confetti.Shape[],
    });
  };

  const triggerFireworks = () => {
    const duration = 2000;
    const animationEnd = Date.now() + duration;
    const defaults = { 
      startVelocity: 30, 
      spread: 360, 
      ticks: 60, 
      zIndex: 9999 
    };

    function randomInRange(min: number, max: number) {
      return Math.random() * (max - min) + min;
    }

    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        clearInterval(interval);
        return;
      }

      const particleCount = 50 * (timeLeft / duration);

      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
      });

      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
      });
    }, 250);
  };

  return null; // This component doesn't render anything
};
