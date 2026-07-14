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
      const username = sessionStorage.getItem('vmUsername') || '';
      const runcmd = sessionStorage.getItem('vmRuncmd') || '';
      const { job_id } = await createVM({
        servername: hostname,
        os,
        cpu,
        memory: mem,
        hdd,
        username: username || undefined,
        runcmd: runcmd || undefined,
      });
      sessionStorage.removeItem('vmOs');
      sessionStorage.removeItem('vmHostname');
      sessionStorage.removeItem('vmUsername');
      sessionStorage.removeItem('vmRuncmd');
      navigate(`/vm?job_id=${job_id}`);
    } catch {
      setCreating(false);
    }
  }

  if (!settings) {
    return <Layout><div style={{ color: '#555', fontSize: 13 }}>Loading...</div></Layout>;
  }

  return (
    <Layout>
      <div style={{ flex: 1, maxWidth: 800, margin: '0 auto', width: '100%' }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="hardDrive" size={18} color="#fff" />
            <div style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>Resource Selection</div>
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
            style={ghostBtn}
          >
            <Icon name="arrowLeft" size={12} /> Back
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            style={{ ...ghostBtn, color: creating ? '#555' : '#fff' }}
          >
            {creating ? 'Creating...' : <><Icon name="plus" size={12} /> Create VM</>}
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
          <Icon name={icon} size={14} color="#444" />
          <span style={{ fontSize: 13, color: '#ccc' }}>{label}</span>
        </div>
        <span style={{ fontSize: 13, color: '#888' }}>{value} {unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        style={{ width: '100%' }} />
    </div>
  );
}

const ghostBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #111',
  borderRadius: 4,
  color: '#444',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 500,
  padding: '10px 20px',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};
