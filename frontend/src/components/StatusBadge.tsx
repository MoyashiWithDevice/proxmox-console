import { STATUS_COLORS, STATUS_LABELS } from '../lib/api';

interface StatusBadgeProps {
  status: string;
  style?: React.CSSProperties;
}

export function StatusBadge({ status, style }: StatusBadgeProps) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.unknown;
  const label = STATUS_LABELS[status] || status;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 13,
        fontWeight: 500,
        color,
        padding: '4px 10px',
        borderRadius: 6,
        background: `rgba(${r},${g},${b},0.1)`,
        ...style,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {label}
    </span>
  );
}

interface StatusDotProps {
  status: string;
}

export function StatusDot({ status }: StatusDotProps) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.unknown;
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }}
    />
  );
}
