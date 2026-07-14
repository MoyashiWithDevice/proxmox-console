import { statusColors, statusLabels } from '../types';

interface BadgeProps {
  status: string;
}

export function Badge({ status }: BadgeProps) {
  const c = statusColors[status] || statusColors.unknown;
  const label = statusLabels[status] || status;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: c.color }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
      {label}
    </span>
  );
}
