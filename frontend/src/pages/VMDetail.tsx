import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { changeVMState, updateVM, deleteVM, downloadKey, fetchVM, fetchJob } from '../api';
import { Icon } from '../components/Icon';
import { Badge } from '../components/Badge';
import type { VM } from '../types';

const ghostBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #111',
  borderRadius: 4,
  color: '#444',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 500,
  padding: '8px 14px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};

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

export function VMDetail() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const id = searchParams.get('id');
  const isJobView = location.pathname === '/job';

  if (isJobView) {
    return <JobView jobId={id || ''} />;
  }

  return <VMDetailView uuid={id || ''} />;
}

function VMDetailView({ uuid }: { uuid: string }) {
  const navigate = useNavigate();
  const [vm, setVM] = useState<VM | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState('');
  const [cores, setCores] = useState(0);
  const [mem, setMem] = useState(0);
  const [hdd, setHdd] = useState(0);

  const loadVM = useCallback(() => {
    if (!uuid) return;
    fetchVM(uuid).then((data) => {
      setVM(data);
      if (!editing) {
        setName(data.servername || '');
        setCores(data.cpu || 0);
        setMem(data.memory || 0);
        setHdd(data.hdd || 0);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [uuid, editing]);

  useEffect(() => {
    loadVM();
    const interval = setInterval(loadVM, 10000);
    return () => clearInterval(interval);
  }, [loadVM]);

  async function handleToggleVM(uuid: string | undefined, action: 'start' | 'stop') {
    if (!uuid) return;
    if (action === 'stop' && !confirm('Stop this VM?')) return;
    try {
      await changeVMState(uuid, action);
      if (vm) {
        const updated = { ...vm, Status: action === 'start' ? 'running' : 'stopped', status: action === 'start' ? 'running' : 'stopped' };
        setVM(updated);
      }
    } catch (err: unknown) {
      alert('Failed: ' + (err as Error).message);
    }
  }

  async function handleSave() {
    if (!vm?.uuid) return;
    const newHdd = parseInt(String(hdd), 10);
    if (newHdd < (vm.hdd || 0)) {
      alert('Cannot decrease disk size');
      return;
    }

    const patch: Record<string, unknown> = {};
    if (name !== (vm.servername || '')) patch.name = name;
    if (parseInt(String(cores), 10) !== (vm.cpu || 0)) patch.cores = parseInt(String(cores), 10);
    if (parseInt(String(mem), 10) !== (vm.memory || 0)) patch.memory = parseInt(String(mem), 10);
    if (newHdd !== (vm.hdd || 0)) patch.hdd = newHdd;

    if (Object.keys(patch).length === 0) {
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      await updateVM(vm.uuid, patch as { name?: string; cores?: number; memory?: number; hdd?: number });
      setSaving(false);
      setEditing(false);
    } catch {
      setSaving(false);
      alert('Failed to send request');
    }
  }

  async function handleDelete() {
    if (!vm?.uuid || !confirm('Are you sure? This action cannot be undone.')) return;
    setDeleting(true);
    try {
      await deleteVM(vm.uuid);
      navigate('/');
    } catch (err: unknown) {
      alert('Deletion failed: ' + (err as Error).message);
      setDeleting(false);
    }
  }

  async function handleDownloadKey() {
    if (!vm?.uuid) { alert('VM not found'); return; }
    try {
      const blob = await downloadKey(vm.uuid);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vm-${vm.VMID}-id_rsa`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      alert('Failed to download key: ' + (err as Error).message);
    }
  }

  if (!uuid) {
    return <div style={{ color: '#555', fontSize: 13 }}>Select a VM from the sidebar to view details</div>;
  }

  if (loading || !vm) {
    return <div style={{ fontSize: 13, color: '#333' }}>Loading...</div>;
  }

  const status = (vm.status || 'stopped').toLowerCase();

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 28, alignItems: 'center' }}>
        <button
          onClick={() => { if (vm?.uuid) window.open(`/terminal?vmid=${vm.uuid}`, '_blank', 'noopener,noreferrer'); }}
          style={ghostBtn}
        >
          <Icon name="terminal" size={12} color="#444" /> Terminal
        </button>
        {!editing && (
          <button
            onClick={() => handleToggleVM(vm.uuid, status === 'running' ? 'stop' : 'start')}
            style={ghostBtn}
          >
            {status === 'running' ? 'Stop' : 'Start'}
          </button>
        )}
      </div>

      <div style={{ background: '#000', border: '1px solid #111', padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, paddingBottom: 20, borderBottom: '1px solid #111' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: 32 }}>
              <FieldLabel label="VMID" value={String(vm.VMID)} mono />
              <FieldLabel label="IP Address" value={vm.IP || '\u2014'} mono />
            </div>
          </div>
          {editing ? (
            <div>
              <button onClick={() => { setEditing(false); if (vm) { setName(vm.servername || ''); setCores(vm.cpu || 0); setMem(vm.memory || 0); setHdd(vm.hdd || 0); } }}
                style={{ marginRight: 8, ...ghostBtn }}>
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ ...ghostBtn, color: saving ? '#555' : '#fff' }}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          ) : (
            <div>
              <button onClick={() => setEditing(true)} style={ghostBtn}>
                Edit
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <EditField label="Name">
            {editing ? (
              <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
            ) : (
              <ViewValue value={name || '\u2014'} />
            )}
          </EditField>
          <EditField label="CPU Cores">
            {editing ? (
              <input type="number" value={cores} onChange={(e) => setCores(Number(e.target.value))} style={inputStyle} />
            ) : (
              <ViewValue value={String(cores)} />
            )}
          </EditField>
          <EditField label="Memory (MB)">
            {editing ? (
              <input type="number" value={mem} onChange={(e) => setMem(Number(e.target.value))} style={inputStyle} />
            ) : (
              <ViewValue value={String(mem)} />
            )}
          </EditField>
          <EditField label="Storage (GB)">
            {editing ? (
              <input type="number" value={hdd} onChange={(e) => setHdd(Number(e.target.value))} style={inputStyle} />
            ) : (
              <ViewValue value={String(hdd)} />
            )}
          </EditField>
        </div>

        {!editing && (
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #111' }}>
            <button onClick={handleDownloadKey} style={{ ...ghostBtn, padding: '8px 12px' }}>
              <Icon name="download" size={12} color="#444" /> Download Private Key
            </button>
          </div>
        )}
      </div>

      {!editing && (
        <div style={{ border: '1px solid #f43f5e', padding: 24 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: '#f43f5e', marginBottom: 8 }}>Danger Zone</h3>
          <p style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>This action cannot be undone. The virtual machine will be permanently deleted.</p>
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{ padding: '8px 14px', border: '1px solid #f43f5e', borderRadius: 4, background: 'transparent', color: '#f43f5e', cursor: deleting ? 'default' : 'pointer', fontSize: 12, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: deleting ? 0.5 : 1 }}>
            <Icon name="trash" size={12} color="#f43f5e" /> {deleting ? 'Deleting...' : 'Delete VM'}
          </button>
        </div>
      )}

      <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid #111' }}>
        <p style={{ fontSize: 12, color: '#555' }}>
          <a href={`/support?id=${vm.uuid}`} style={{ color: '#555', textDecoration: 'none' }}>
            Need help? Contact support →
          </a>
        </p>
      </div>
    </div>
  );
}

function JobView({ jobId }: { jobId: string }) {
  const navigate = useNavigate();
  const [job, setJob] = useState<VM | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(10);
  const logRef = useRef<HTMLDivElement>(null);

  const loadJob = useCallback(() => {
    if (!jobId) return;
    fetchJob(jobId).then((data) => {
      setJob(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [jobId]);

  useEffect(() => {
    loadJob();
    const interval = setInterval(loadJob, 2000);
    return () => clearInterval(interval);
  }, [loadJob]);

  useEffect(() => {
    if (!job || !job.uuid || job.Status !== 'done' && job.status !== 'done') return;
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          navigate(`/vm?id=${job.uuid}`);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [job, navigate]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [job?.log]);

  if (!jobId) {
    return <div style={{ color: '#555', fontSize: 13 }}>Select a job from the sidebar to view progress</div>;
  }

  if (loading) {
    return <div style={{ fontSize: 13, color: '#333' }}>Loading...</div>;
  }

  const js = job?.Status || job?.status || '\u2014';
  const jobLog = job?.log || '';

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 300, letterSpacing: '-0.02em', marginBottom: 6, color: '#fff' }}>VM Creation</h1>
      <p style={{ fontSize: 12, color: '#333', marginBottom: 32 }}>Track your VM creation progress</p>
      <div style={{ background: '#000', border: '1px solid #111', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Status</span>
          <Badge status={js} />
        </div>
        <div
          ref={logRef}
          style={{ background: '#000', border: '1px solid #111', padding: 16, height: 300, whiteSpace: 'pre-wrap', fontFamily: 'Monaco,monospace', fontSize: 11, color: '#888', overflow: 'auto', lineHeight: 1.5 }}
          dangerouslySetInnerHTML={{ __html: colorizeTerraformLog(jobLog) }}
        />
        {job?.uuid && (js === 'done') && (
          <div style={{ marginTop: 20 }}>
            <div style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>
              VM created successfully. Redirecting in {countdown} seconds...
            </div>
            <div style={{ width: '100%', height: 2, background: '#111' }}>
              <div style={{ height: '100%', background: '#22c55e', width: `${100 - (countdown / 10 * 100)}%` }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FieldLabel({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#555', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 500, color: '#fff', fontFamily: mono ? 'Monaco,monospace' : undefined }}>{value}</div>
    </div>
  );
}

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 10, color: '#555', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      {children}
    </div>
  );
}

function ViewValue({ value }: { value: string }) {
  return (
    <div style={{ color: '#ccc', fontSize: 14, padding: '10px 12px', background: '#000', border: '1px solid #111', fontWeight: 400 }}>
      {value}
    </div>
  );
}

function colorizeTerraformLog(text: string): string {
  if (typeof text !== 'string') return String(text);
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const lines = escaped.split('\n');
  const out: string[] = [];
  for (const L of lines) {
    let c: string | null = null;
    let line = L;

    if (/^Error:/.test(L)) c = '#ef4444';
    else if (/^\s*[+\-~] /.test(L) && !/^Error:/.test(L)) {
      c = L.trim().charAt(0) === '+' ? '#22c55e' : L.trim().charAt(0) === '-' ? '#ef4444' : '#f59e0b';
    } else if (/^Plan: /.test(L)) {
      line = L.replace(/(\d+) to add/g, '<span style="color:#22c55e">$1 to add</span>')
        .replace(/(\d+) to (change|modify)/g, '<span style="color:#f59e0b">$1 to $2</span>')
        .replace(/(\d+) to destroy/g, '<span style="color:#ef4444">$1 to destroy</span>');
      out.push(line);
      continue;
    } else if (/^- (Finding|Installing|Downloading)/.test(L)) c = '#888';
    else if (/^(Initializing|Terraform has been successfully initialized)/.test(L)) c = '#22c55e';
    else if (/Terraform (will perform|used the selected)/.test(L)) c = '#ccc';
    else if (/Creation complete after/.test(L)) c = '#22c55e';
    else if (/(Still creating|Still destroying)\.\.\./.test(L)) c = '#555';
    else if (/Creating\.\.\./.test(L)) c = '#f59e0b';
    else if (/^  # .+ (will be |must be)/.test(L)) c = '#bbb';
    else if (/^\s+(with|on)\s/.test(L)) c = '#888';
    else if (/^\s+\d+: /.test(L)) c = '#888';

    if (c) {
      out.push(`<span style="color:${c}">${line}</span>`);
    } else {
      out.push(line);
    }
  }
  return out.join('\n');
}
