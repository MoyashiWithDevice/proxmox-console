import { useEffect, useState } from 'react';
import { fetchAdminSettings, updateAdminSettings, type AdminSettings } from '../api';

const card: React.CSSProperties = {
  background: '#0a0a0a',
  border: '1px solid #111',
  borderRadius: 6,
  padding: 24,
  marginBottom: 24,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: '#fff',
  marginTop: 0,
  marginBottom: 4,
};

const sectionDesc: React.CSSProperties = {
  fontSize: 12,
  color: '#555',
  marginTop: 0,
  marginBottom: 20,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#000',
  border: '1px solid #1a1a1a',
  borderRadius: 4,
  padding: '8px 10px',
  color: '#fff',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  color: '#666',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const btnPrimary: React.CSSProperties = {
  background: '#fff',
  border: 'none',
  borderRadius: 4,
  color: '#000',
  fontWeight: 600,
  cursor: 'pointer',
  padding: '10px 20px',
  fontSize: 13,
};

const btnSmall: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #333',
  borderRadius: 4,
  color: '#888',
  cursor: 'pointer',
  padding: '6px 12px',
  fontSize: 12,
};

const btnRemove: React.CSSProperties = {
  ...btnSmall,
  color: '#f87171',
  border: '1px solid #3a1a1a',
};

function ResourceRow({
  label,
  icon,
  min,
  max,
  step,
  unit,
  onChange,
  stepEditable,
}: {
  label: string;
  icon: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (field: string, value: string) => void;
  stepEditable?: boolean;
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '140px 1fr 1fr 1fr',
      alignItems: 'center',
      gap: 12,
      padding: '14px 0',
      borderBottom: '1px solid #0d0d0d',
    }}>
      <div>
        <div style={{ fontSize: 13, color: '#ccc', fontWeight: 500 }}>
          {icon} {label}
        </div>
        <div style={{ fontSize: 11, color: '#444' }}>{unit}</div>
      </div>
      <div>
        <label style={labelStyle}>Min</label>
        <input
          type="number"
          style={inputStyle}
          value={min}
          onChange={(e) => onChange('min', e.target.value)}
        />
      </div>
      <div>
        <label style={labelStyle}>Max</label>
        <input
          type="number"
          style={inputStyle}
          value={max}
          onChange={(e) => onChange('max', e.target.value)}
        />
      </div>
      <div>
        <label style={labelStyle}>Step</label>
        <input
          type="number"
          style={{
            ...inputStyle,
            opacity: stepEditable ? 1 : 0.3,
            cursor: stepEditable ? 'text' : 'not-allowed',
          }}
          value={step}
          onChange={(e) => stepEditable && onChange('step', e.target.value)}
          disabled={!stepEditable}
        />
      </div>
    </div>
  );
}

export function AdminSettingsPage() {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAdminSettings().then(setSettings).catch(console.error);
  }, []);

  if (!settings) {
    return (
      <div style={{ color: '#555', padding: 24 }}>Loading...</div>
    );
  }

  const handleResourceChange = (
    resource: 'cpu' | 'memory' | 'hdd',
    field: string,
    value: string,
  ) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const r = { ...prev.resources };
      (r as any)[resource] = { ...(r[resource] as Record<string, number>), [field]: Number(value) };
      return { ...prev, resources: r };
    });
  };

  const handleOSChange = (index: number, field: string, value: string) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const os = [...prev.os];
      os[index] = { ...os[index], [field]: field === 'template_id' ? Number(value) : value };
      return { ...prev, os };
    });
  };

  const handleRemoveOS = (index: number) => {
    setSettings((prev) => {
      if (!prev) return prev;
      return { ...prev, os: prev.os.filter((_, i) => i !== index) };
    });
  };

  const handleAddOS = () => {
    setSettings((prev) => {
      if (!prev) return prev;
      return { ...prev, os: [...prev.os, { id: '', label: '', template_id: 0 }] };
    });
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await updateAdminSettings(settings);
      setMessage('Settings saved successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch {
      setMessage('Failed to save settings');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 22, fontWeight: 300, color: '#fff', margin: 0 }}>
          System Settings
        </h1>
        <p style={{ fontSize: 13, color: '#444', margin: '6px 0 0 0' }}>
          Configure resource limits and OS templates for virtual machines.
        </p>
      </div>

      {/* Resource Limits */}
      <div style={card}>
        <h2 style={sectionTitle}>Resource Limits</h2>
        <p style={sectionDesc}>
          Define the minimum and maximum resource allocations that users can request when creating VMs.
        </p>

        <div style={{ borderTop: '1px solid #0d0d0d' }}>
          <ResourceRow
            label="CPU"
            icon="CPU"
            min={settings.resources.cpu.min}
            max={settings.resources.cpu.max}
            step={0}
            unit="Cores"
            onChange={(f, v) => handleResourceChange('cpu', f, v)}
            stepEditable={false}
          />
          <ResourceRow
            label="Memory"
            icon="RAM"
            min={settings.resources.memory.min}
            max={settings.resources.memory.max}
            step={settings.resources.memory.step}
            unit="MB"
            onChange={(f, v) => handleResourceChange('memory', f, v)}
            stepEditable
          />
          <ResourceRow
            label="Storage"
            icon="HDD"
            min={settings.resources.hdd.min}
            max={settings.resources.hdd.max}
            step={settings.resources.hdd.step}
            unit="GB"
            onChange={(f, v) => handleResourceChange('hdd', f, v)}
            stepEditable
          />
        </div>
      </div>

      {/* OS Templates */}
      <div style={card}>
        <h2 style={sectionTitle}>OS Templates</h2>
        <p style={sectionDesc}>
          Operating system images available for VM creation. Template IDs map to Proxmox template VMs.
        </p>

        <div style={{ borderTop: '1px solid #0d0d0d' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 120px 40px',
            gap: 12,
            padding: '10px 0',
            borderBottom: '1px solid #0d0d0d',
          }}>
            <div style={labelStyle}>Label</div>
            <div style={labelStyle}>ID</div>
            <div style={labelStyle}>Template ID</div>
            <div />
          </div>

          {settings.os.map((os, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 120px 40px',
                gap: 12,
                padding: '10px 0',
                borderBottom: '1px solid #0d0d0d',
                alignItems: 'center',
              }}
            >
              <input
                style={inputStyle}
                value={os.label}
                placeholder="e.g. Ubuntu 24.04 LTS"
                onChange={(e) => handleOSChange(i, 'label', e.target.value)}
              />
              <input
                style={inputStyle}
                value={os.id}
                placeholder="e.g. ubuntu-24.04"
                onChange={(e) => handleOSChange(i, 'id', e.target.value)}
              />
              <input
                style={inputStyle}
                type="number"
                value={os.template_id}
                onChange={(e) => handleOSChange(i, 'template_id', e.target.value)}
              />
              <button
                style={btnRemove}
                onClick={() => handleRemoveOS(i)}
                title="Remove"
              >
                &times;
              </button>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16 }}>
          <button style={btnSmall} onClick={handleAddOS}>
            + Add
          </button>
        </div>
      </div>

      {/* Save */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        paddingTop: 8,
      }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            ...btnPrimary,
            opacity: saving ? 0.5 : 1,
          }}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>

        {message && (
          <span style={{
            fontSize: 13,
            color: message.includes('Failed') ? '#f87171' : '#4ade80',
          }}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
