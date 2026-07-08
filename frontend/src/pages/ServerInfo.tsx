import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchSettings } from '../lib/api';
import { Icon } from '../components/Icon';
import { Layout } from '../components/Layout';
import type { SettingsResponse } from '../types';

export function ServerInfo() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [os, setOs] = useState('');
  const [hostname, setHostname] = useState('');
  const [sshPort, setSshPort] = useState('');

  useEffect(() => {
    fetchSettings().then((data) => {
      setSettings(data);
      setOs(data.os?.[0]?.id || '');
    }).catch(() => {});
  }, []);

  function handleNext() {
    sessionStorage.setItem('vmOs', os);
    sessionStorage.setItem('vmHostname', hostname);
    sessionStorage.setItem('vmSshPort', sshPort);
    navigate('/resource');
  }

  if (!settings) {
    return <Layout><div style={{ color: '#555', fontSize: 13 }}>Loading...</div></Layout>;
  }

  return (
    <Layout>
      <div style={{ flex: 1, maxWidth: 800, margin: '0 auto', width: '100%' }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="server" size={18} color="#fff" />
            <div style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>Server Info</div>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>OS</div>
          <select value={os} onChange={(e) => setOs(e.target.value)} style={inputStyle}>
            {(settings.os || []).map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Hostname</div>
          <input type="text" value={hostname} onChange={(e) => setHostname(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>SSH Port</div>
          <input type="text" value={sshPort} onChange={(e) => setSshPort(e.target.value)} style={inputStyle} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={handleNext}
            style={ghostBtn}
          >
            Next <Icon name="arrowRight" size={12} />
          </button>
        </div>
      </div>
    </Layout>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#000',
  border: '1px solid #111',
  color: '#fff',
  fontSize: 14,
  padding: '10px 12px',
  borderRadius: 4,
  outline: 'none',
};

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
