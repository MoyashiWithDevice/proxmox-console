import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { fetchVMs, submitSupport } from '../lib/api';
import { Icon } from '../components/Icon';
import type { VMResponse } from '../types';

export function Support() {
  const [searchParams] = useSearchParams();
  const defaultVmid = searchParams.get('vmid') || '';
  const navigate = useNavigate();

  const [subject, setSubject] = useState('');
  const [vmid, setVmid] = useState(defaultVmid);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [vms, setVms] = useState<VMResponse[]>([]);

  useEffect(() => {
    fetchVMs().then((data) => {
      setVms((data || []).filter((i) => i.type === 'vm'));
    }).catch(() => {});
  }, []);

  async function handleSubmit() {
    const s = subject.trim();
    const d = details.trim();
    if (!s || !d) {
      setStatus({ type: 'error', msg: 'Subject and details are required.' });
      return;
    }
    setSubmitting(true);
    setStatus(null);
    try {
      const res = await submitSupport({ subject: s, vmid, details: d });
      setStatus({ type: 'success', msg: res.message || 'Support request submitted.' });
      setSubject('');
      setVmid('');
      setDetails('');
    } catch (err: unknown) {
      setStatus({ type: 'error', msg: (err as Error).message || 'Submission failed.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#000', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 32px', borderBottom: '1px solid #111' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="logOut" size={16} color="#fff" />
          <div style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>Contact Admin</div>
        </div>
        <button
          onClick={() => navigate('/')}
          style={ghostBtn}
        >
          <Icon name="arrowLeft" size={12} /> Back
        </button>
      </div>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 32 }}>
        <div style={{ width: '100%', maxWidth: 640, border: '1px solid #111', padding: 28 }}>
          <Field label="Subject">
            <input
              type="text"
              placeholder="Enter subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="VMID">
            <select value={vmid} onChange={(e) => setVmid(e.target.value)} style={inputStyle}>
              <option value="">No VM selected</option>
              {vms.map((vm) => (
                <option key={vm.VMID} value={vm.VMID}>
                  {vm.VMID} — {vm.Name || 'Unnamed'}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Details">
            <textarea
              placeholder="Please describe your issue in detail."
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              style={{ ...inputStyle, minHeight: 160, resize: 'vertical' }}
            />
          </Field>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{ ...ghostBtn, padding: '10px 18px', color: submitting ? '#555' : '#fff' }}
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
            {status && (
              <div style={{ fontSize: 13, color: status.type === 'success' ? '#22c55e' : '#f43f5e' }}>
                {status.msg}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, color: '#555', marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
      {children}
    </div>
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
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  padding: '8px 14px',
};
