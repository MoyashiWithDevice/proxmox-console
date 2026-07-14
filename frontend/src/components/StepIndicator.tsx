interface StepIndicatorProps {
  steps: string[];
  current: number;
}

export function StepIndicator({ steps, current }: StepIndicatorProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 32 }}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        const color = done ? '#22c55e' : active ? '#fff' : '#333';
        const bg = done ? '#22c55e' : active ? '#fff' : '#111';
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 20, height: 20, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 600, background: bg, color: done || active ? '#000' : '#555',
                flexShrink: 0,
              }}>
                {done ? '✓' : i + 1}
              </span>
              <span style={{ fontSize: 11, color, letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 1, background: done ? '#22c55e' : '#111', margin: '0 12px' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
