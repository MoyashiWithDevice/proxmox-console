import type { ReactNode, MouseEvent } from 'react';

interface GhostButtonProps {
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
  disabled?: boolean;
  style?: React.CSSProperties;
  ariaLabel?: string;
  type?: 'button' | 'submit';
}

const baseStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #111',
  borderRadius: 4,
  color: '#444',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  fontWeight: 500,
  padding: '8px 14px',
};

export function GhostButton({ onClick, children, disabled, style, ariaLabel, type = 'button' }: GhostButtonProps) {
  return (
    <button
      type={type}
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      style={{ ...baseStyle, opacity: disabled ? 0.5 : 1, ...style }}
    >
      {children}
    </button>
  );
}
