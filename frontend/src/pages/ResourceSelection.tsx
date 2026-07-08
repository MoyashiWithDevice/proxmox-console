import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchSettings, createVM } from '../lib/api';
import { Icon } from '../components/Icon';
import { Layout } from '../components/Layout';
import type { SettingsResponse } from '../types';

export function ResourceSelection() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [hdd, setHdd] = useState(50);
  const [cpu, setCpu] = useState(4);
  const [mem, setMem] = useState(8);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchSettings().then((data) => {
      setSettings(data);
      if (data.hdd) setHdd(data.hdd.min || 20);
      if (data.cpu) setCpu(data.cpu.min || 4);
      if (data.memory) setMem(data.memory.min || 8);
    }).catch(() => {});
  }, []);

  async function handleCreate() {
    setCreating(true);
    try {
      const os = sessionStorage.getItem('vmOs') || '';
      const hostname = sessionStorage.getItem('vmHostname') || '';
      const { job_id } = await createVM({
        servername: hostname,
        os,
        cpu,
        memory: mem,
        hdd,
      });
      sessionStorage.removeItem('vmOs');
      sessionStorage.removeItem('vmHostname');
      sessionStorage.removeItem('vmSshPort');
      navigate(`/vm?job_id=${job_id}`);
    } catch {
      setCreating(false);
    }
  }

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

        <div style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => navigate('/info')}
            style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#fff', padding: '12px 24px', borderRadius: 10, cursor: 'pointer',
              fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Icon name="arrowLeft" /> Back
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            style={{
              background: creating ? '#334155' : '#22c55e',
              color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 10,
              cursor: creating ? 'default' : 'pointer', fontSize: 14, fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {creating ? 'Creating...' : <><Icon name="plus" /> Create VM</>}
          </button>
        </div>
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
