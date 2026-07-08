import { Icon } from './Icon';
import { Bar } from './Bar';

interface StatCardProps {
  iconName: string;
  label: string;
  used: number;
  total: number;
  unit: string;
}

export function StatCard({ iconName, label, used, total, unit }: StatCardProps) {
  const pct = total === 0 ? 0 : Math.round((used / total) * 100);
  return (
    <div style={{ flex: 1, minWidth: 140, padding: '20px 24px', border: '1px solid #111' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Icon name={iconName} size={14} color="#444" />
        <span style={{ fontSize: 11, color: '#444', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 300, color: '#fff', marginBottom: 12, lineHeight: 1 }}>
        {pct}<span style={{ fontSize: 14, color: '#444' }}>%</span>
      </div>
      <Bar value={used} max={total} />
      <div style={{ marginTop: 8, fontSize: 11, color: '#333' }}>{used} / {total} {unit}</div>
    </div>
  );
}
