import { useEffect, useState } from 'react';
import { fetchSettings } from '../lib/api';
import { Icon } from '../components/Icon';
import { Layout } from '../components/Layout';
import type { SettingsResponse } from '../types';

export function ServerInfo() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [os, setOs] = useState('');
  const [hostname, setHostname] = useState('');
  const [sshPort, setSshPort] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    fetchSettings().then((data) => {
      setSettings(data);
      setOs(data.os?.[0]?.id || '');
    }).catch(() => setStatus({ type: 'error', msg: 'Failed to load settings.' }));
  }, []);

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Os: os, Hostname: hostname, SSHPort: sshPort }),
      });
      setStatus({ type: 'success', msg: 'Settings saved.' });
    } catch (err: unknown) {
      setStatus({ type: 'error', msg: (err as Error).message });
    } finally {
      setSaving(false);
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
            <Icon name="server" />
            <div style={{ fontSize: 18, fontWeight: 600 }}>Server Info</div>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#777', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>OS</div>
          <select value={os} onChange={(e) => setOs(e.target.value)} style={selectStyle}>
            {(settings.os || []).map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#777', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Hostname</div>
          <input type="text" value={hostname} onChange={(e) => setHostname(e.target.value)} style={selectStyle as React.CSSProperties} />
        </div>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, color: '#777', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>SSH Port</div>
          <input type="text" value={sshPort} onChange={(e) => setSshPort(e.target.value)} style={selectStyle as React.CSSProperties} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              background: saving ? '#334155' : '#2563eb', color: '#fff', border: 'none',
              padding: '12px 24px', borderRadius: 10, cursor: saving ? 'default' : 'pointer', fontSize: 14, fontWeight: 500,
            }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          {status && (
            <div style={{ fontSize: 14, color: status.type === 'success' ? '#22c55e' : '#f43f5e' }}>
              {status.msg}
            </div>
          )}
        </div>
      </div>
    </Layout>
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

const selectStyle: React.CSSProperties = {
  width: '100%',
  background: '#0d0d0d',
  border: '1px solid #222',
  color: '#fff',
  fontSize: 14,
  padding: '10px 12px',
  borderRadius: 8,
  outline: 'none',
};
