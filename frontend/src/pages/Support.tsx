import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { submitSupport } from '../api';
import { useVM } from '../context/VMContext';

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

export function Support() {
  const [searchParams] = useSearchParams();
  const defaultUuid = searchParams.get('id') || searchParams.get('vmid') || '';
  const { vms } = useVM();

  const [subject, setSubject] = useState('');
  const [uuid, setUuid] = useState(defaultUuid);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

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
      const res = await submitSupport({ subject: s, vmid: uuid, details: d });
      setStatus({ type: 'success', msg: res.message || 'Support request submitted.' });
      setSubject('');
      setUuid('');
      setDetails('');
    } catch (err: unknown) {
      setStatus({ type: 'error', msg: (err as Error).message || 'Submission failed.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 22, fontWeight: 300, letterSpacing: '-0.02em', marginBottom: 6, color: '#fff' }}>
        Contact Support
      </h1>
      <p style={{ fontSize: 12, color: '#333', marginBottom: 32 }}>
        Submit a request and our team will get back to you.
      </p>

      <div style={{ border: '1px solid #111', padding: 28 }}>
        <Field label="Subject">
          <input
            type="text" placeholder="Enter subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="VM">
          <select value={uuid} onChange={(e) => setUuid(e.target.value)} style={inputStyle}>
            <option value="">No VM selected</option>
            {vms.map((vm) => (
              <option key={vm.uuid} value={vm.uuid}>
                {vm.VMID} — {vm.servername || 'Unnamed'}
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
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, color: '#555', marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500 }}>
        {label}
      </div>
      {children}
    </div>
  );
}
