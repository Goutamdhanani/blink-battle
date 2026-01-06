/**
 * HapticFeedback Component
 * 
 * Wrapper component that triggers haptic feedback on interaction.
 */

import React from 'react';
import { useHapticFeedback, HapticPattern } from '../../hooks/useHapticFeedback';

interface HapticFeedbackProps {
  children: React.ReactElement;
  pattern?: HapticPattern;
  disabled?: boolean;
}

export const HapticFeedback: React.FC<HapticFeedbackProps> = ({
  children,
  pattern = 'selection',
  disabled = false,
}) => {
  const { trigger, isSupported } = useHapticFeedback();

  if (!isSupported || disabled) {
    return children;
  }

  const handleInteraction = (e: React.MouseEvent | React.TouchEvent) => {
    trigger(pattern);
    
    // Call original handler if it exists
    const originalHandler = children.props.onClick || children.props.onTouchStart;
    if (originalHandler) {
      originalHandler(e);
    }
  };

  return React.cloneElement(children, {
    onClick: handleInteraction,
    onTouchStart: handleInteraction,
  });
};
