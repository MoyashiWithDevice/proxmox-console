interface BarProps {
  value: number;
  max: number;
}

export function Bar({ value, max }: BarProps) {
  const pct = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  const col = pct > 85 ? '#f43f5e' : pct > 65 ? '#f59e0b' : '#fff';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 3, background: '#1e1e1e' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: col }} />
      </div>
      <span style={{ fontSize: 11, color: '#555', minWidth: 28, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}
