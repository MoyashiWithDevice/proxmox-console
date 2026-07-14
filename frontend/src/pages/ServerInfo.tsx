import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchSettings } from '../lib/api';
import { Icon } from '../components/Icon';
import { Layout } from '../components/Layout';
import type { SettingsResponse } from '../types';

const textareaStyle: React.CSSProperties = {
  width: '100%',
  background: '#000',
  border: '1px solid #111',
  color: '#fff',
  fontSize: 14,
  padding: '10px 12px',
  borderRadius: 4,
  outline: 'none',
  resize: 'vertical',
  minHeight: 80,
  fontFamily: 'inherit',
};

export function ServerInfo() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [os, setOs] = useState('');
  const [hostname, setHostname] = useState('');
  const [username, setUsername] = useState('');
  const [runcmd, setRuncmd] = useState('');

  const selectedOs = settings?.os?.find((o) => o.id === os);

  useEffect(() => {
    fetchSettings().then((data) => {
      setSettings(data);
      setOs(data.os?.[0]?.id || '');
    }).catch(() => {});
  }, []);

  function handleNext() {
    sessionStorage.setItem('vmOs', os);
    sessionStorage.setItem('vmHostname', hostname);
    sessionStorage.setItem('vmUsername', username);
    sessionStorage.setItem('vmRuncmd', runcmd);
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
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {selectedOs?.image && (
              <img src={selectedOs.image} alt="" style={{ width: 48, height: 48, borderRadius: 4, objectFit: 'contain' }} />
            )}
            <select value={os} onChange={(e) => setOs(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
              {(settings.os || []).map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Hostname</div>
          <input type="text" value={hostname} onChange={(e) => setHostname(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>OS User</div>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} style={inputStyle} placeholder="e.g. ubuntu" />
        </div>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            Initialization Command
          </div>
          <textarea
            value={runcmd}
            onChange={(e) => setRuncmd(e.target.value)}
            style={textareaStyle}
            placeholder="# e.g. apt update && apt install -y nginx"
          />
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
