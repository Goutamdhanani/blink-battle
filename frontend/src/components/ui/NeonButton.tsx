import React from 'react';
import './NeonButton.css';

interface NeonButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'success' | 'ghost';
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}

const NeonButton: React.FC<NeonButtonProps> = ({
  children,
  variant = 'primary',
  size = 'medium',
  fullWidth = false,
  disabled = false,
  onClick,
  className = '',
}) => {
  const classNames = [
    'neon-button',
    `neon-button-${variant}`,
    `neon-button-${size}`,
    fullWidth ? 'neon-button-full' : '',
    disabled ? 'neon-button-disabled' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      className={classNames}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="neon-button-content">{children}</span>
    </button>
  );
};

export default NeonButton;
