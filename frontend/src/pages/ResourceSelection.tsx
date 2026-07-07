import { useEffect, useState } from 'react';
import { fetchSettings } from '../lib/api';
import { Icon } from '../components/Icon';
import { Layout } from '../components/Layout';
import type { SettingsResponse } from '../types';

export function ResourceSelection() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [hdd, setHdd] = useState(50);
  const [cpu, setCpu] = useState(4);
  const [mem, setMem] = useState(8);

  useEffect(() => {
    fetchSettings().then((data) => {
      setSettings(data);
      if (data.hdd) setHdd(data.hdd.min || 20);
      if (data.cpu) setCpu(data.cpu.min || 4);
      if (data.memory) setMem(data.memory.min || 8);
    }).catch(() => {});
  }, []);

  if (!settings) {
    return <Layout><div style={{ color: '#888', fontSize: 14 }}>Loading...</div></Layout>;
  }

  return (
    <Layout>
      <DashHeader />
      <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 16, padding: 32 }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="hardDrive" />
            <div style={{ fontSize: 18, fontWeight: 600 }}>Resource Selection</div>
          </div>
        </div>

        <SliderRow
          icon="hardDrive"
          label="HDD"
          value={hdd}
          setValue={setHdd}
          min={settings.hdd?.min || 20}
          max={settings.hdd?.max || 200}
          step={settings.hdd?.step || 5}
          unit="GB"
        />
        <SliderRow
          icon="cpu"
          label="CPU"
          value={cpu}
          setValue={setCpu}
          min={settings.cpu?.min || 1}
          max={settings.cpu?.max || 32}
          step={settings.cpu?.step || 1}
          unit="Cores"
        />
        <SliderRow
          icon="memoryStick"
          label="Memory"
          value={mem}
          setValue={setMem}
          min={settings.memory?.min || 1}
          max={settings.memory?.max || 64}
          step={settings.memory?.step || 1}
          unit="GB"
        />
      </div>
    </Layout>
  );
}

function SliderRow({ icon, label, value, setValue, min, max, step, unit }: {
  icon: 'hardDrive' | 'cpu' | 'memoryStick';
  label: string;
  value: number;
  setValue: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
}) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name={icon} />
          <span style={{ fontSize: 14, color: '#ddd' }}>{label}</span>
        </div>
        <span style={{ fontSize: 14, color: '#aaa' }}>{value} {unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        style={{ width: '100%' }} />
    </div>
  );
}

function DashHeader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name="server" width={28} height={28} color="#6366f1" />
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>Proxmox Console</h1>
      </div>
    </div>
  );
}
