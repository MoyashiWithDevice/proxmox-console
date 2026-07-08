import { STATUS_COLORS, STATUS_LABELS } from '../lib/api';

interface BadgeProps {
  status: string;
}

export function Badge({ status }: BadgeProps) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.unknown;
  const label = STATUS_LABELS[status] || status;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {label}
    </span>
  );
}
