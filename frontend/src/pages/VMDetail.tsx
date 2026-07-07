import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { changeVMState, updateVM, downloadKey, fetchVMs, STATUS_COLORS } from '../lib/api';
import { Icon } from '../components/Icon';
import { StatusBadge, StatusDot } from '../components/StatusBadge';
import type { VMResponse } from '../types';

export function VMDetail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const id = searchParams.get('vmid');
  const jobId = searchParams.get('job_id');
  const isJobView = Boolean(jobId);

  const [items, setItems] = useState<VMResponse[]>([]);
  const [vm, setVM] = useState<VMResponse | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState('');
  const [cores, setCores] = useState(0);
  const [mem, setMem] = useState(0);
  const [hdd, setHdd] = useState(0);
  const [jobStatus, setJobStatus] = useState('\u2014');
  const [jobLog, setJobLog] = useState('');
  const [jobVMID, setJobVMID] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(10);
  const logRef = useRef<HTMLDivElement>(null);

  const loadItems = useCallback(() => {
    fetchVMs().then((data) => {
      setItems(data || []);
      if (id) {
        const match = (data || []).find((v) => String(v.VMID || v.vmid) === id);
        if (match) {
          setVM(match);
          if (!editing) {
            setName(match.Name || '');
            setCores(match.Cores || match.CPU || 0);
            setMem(match.Memory || 0);
            setHdd(match.HDD || match.Hdd || 0);
          }
        }
      }
      if (jobId) {
        const jobMatch = (data || []).find((v) => v.JOBID === jobId || v.job_id === jobId);
        if (jobMatch) {
          setJobStatus(jobMatch.Status || jobMatch.status || '\u2014');
          setJobLog(jobMatch.log || '');
          if (jobMatch.VMID || jobMatch.vmid) {
            setJobVMID(jobMatch.VMID || jobMatch.vmid || null);
            if (!id) setVM(jobMatch);
          }
        }
      }
    }).catch(() => {});
  }, [id, jobId, editing]);

  useEffect(() => {
    loadItems();
    const interval = setInterval(loadItems, 10000);
    return () => clearInterval(interval);
  }, [loadItems]);

  useEffect(() => {
    if (!jobId || !jobVMID || jobStatus !== 'done') return;
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          navigate(`/vm?vmid=${jobVMID}`);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [jobId, jobVMID, jobStatus, navigate]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [jobLog]);

  async function handleToggleVM(vmid: number, action: 'start' | 'stop') {
    if (action === 'stop' && !confirm('Stop this VM?')) return;
    try {
      await changeVMState(vmid, action);
      if (vm) {
        const updated = { ...vm, Status: action === 'start' ? 'running' : 'stopped', status: action === 'start' ? 'running' : 'stopped' };
        setVM(updated);
      }
    } catch (err: unknown) {
      alert('Failed: ' + (err as Error).message);
    }
  }

  async function handleSave() {
    if (!vm?.VMID) return;
    const newHdd = parseInt(String(hdd), 10);
    if (newHdd < (vm.HDD || vm.Hdd || 0)) {
      alert('Cannot decrease disk size');
      return;
    }

    const patch: Record<string, unknown> = { vmid: vm.VMID };
    if (name !== (vm.Name || '')) patch.name = name;
    if (parseInt(String(cores), 10) !== (vm.Cores || vm.CPU || 0)) patch.cores = parseInt(String(cores), 10);
    if (parseInt(String(mem), 10) !== (vm.Memory || 0)) patch.memory = parseInt(String(mem), 10);
    if (newHdd !== (vm.HDD || vm.Hdd || 0)) patch.hdd = newHdd;

    if (Object.keys(patch).length <= 1) {
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      const data = await updateVM(patch as { vmid: number; name?: string; cores?: number; memory?: number; hdd?: number });
      if (data.job_id) {
        setJobStatus('running(modify)');
      } else {
        setSaving(false);
        setEditing(false);
      }
    } catch {
      setSaving(false);
      alert('Failed to send request');
    }
  }

  async function handleDelete() {
    if (!vm?.VMID || !confirm('Are you sure? This action cannot be undone.')) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/vm', {
        method: 'DELETE', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vmid: vm.VMID }),
      });
      if (res.ok) { navigate('/'); return; }
      const body = await res.text();
      alert('Deletion failed: ' + body);
      setDeleting(false);
    } catch (err: unknown) {
      alert('Deletion failed: ' + (err as Error).message);
      setDeleting(false);
    }
  }

  async function handleDownloadKey() {
    if (!vm?.VMID) { alert('VM ID not found'); return; }
    try {
      const blob = await downloadKey(vm.VMID);
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

  const vmItems = items.filter((i) => i.type === 'vm');
  const jobItems = items.filter((i) => i.type === 'job');
  const target = id || (jobVMID ? String(jobVMID) : '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#000', color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 32px', height: 52, borderBottom: '1px solid #111', flexShrink: 0, background: '#000' }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#fff', letterSpacing: '-0.01em' }}>Proxmox Console</span>
          <span style={{ fontSize: 11, color: '#333', marginLeft: 2 }}>v1.0</span>
        </a>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => navigate(`/support${target ? `?vmid=${target}` : ''}`)}
            style={{ background: 'none', border: '1px solid #222', cursor: 'pointer', padding: '8px 12px', borderRadius: 4, color: '#ddd', fontSize: 12 }}
          >
            Support
          </button>
          <button
            onClick={() => { window.location.href = '/logout'; }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 6, color: '#444', fontSize: 12 }}
          >
            <Icon name="logOut" /> Logout
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', background: '#000' }}>
        {/* Sidebar */}
        <div style={{ width: 210, minWidth: 210, borderRight: '1px solid #111', overflowY: 'auto', flexShrink: 0, paddingTop: 8, paddingBottom: 8, background: '#000' }}>
          <div
            onClick={() => navigate('/')}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px 10px', cursor: 'pointer', fontSize: 12, color: '#333', borderBottom: '1px solid #0d0d0d', marginBottom: 8, fontWeight: 500 }}
          >
            <Icon name="arrowLeft" /> Dashboard
          </div>
          <div style={{ padding: '4px 18px', fontSize: 10, color: '#2a2a2a', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
            Virtual Machines
          </div>
          <div>
            {vmItems.length === 0 ? (
              <div style={{ padding: '6px 16px', fontSize: 12, color: '#333' }}>None</div>
            ) : (
              vmItems.map((v) => {
                const isActive = String(v.VMID) === String(id);
                const isHover = hovered === `vm-${v.VMID}`;
                const vmStatus = v.Status || v.status || 'unknown';
                const color = isActive ? '#fff' : isHover ? '#aaa' : '#555';
                const bg = isActive ? '#111' : 'transparent';
                const borderL = isActive ? '2px solid #fff' : '2px solid transparent';
                return (
                  <div
                    key={v.VMID}
                    onMouseEnter={() => setHovered(`vm-${v.VMID}`)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => navigate(`/vm?vmid=${v.VMID}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', cursor: 'pointer', fontSize: 13, color, background: bg, borderLeft: borderL, userSelect: 'none', transition: 'all 0.15s', marginBottom: 2, borderRadius: '0 6px 6px 0' }}
                  >
                    <StatusDot status={vmStatus} />
                    <Icon name="monitor" width={13} height={13} color={color} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {v.Name || 'Unnamed'}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {jobItems.length > 0 && (
            <>
              <div style={{ padding: '8px 18px 4px', fontSize: 10, color: '#2a2a2a', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, marginTop: 14 }}>
                Creating
              </div>
              {jobItems.map((j) => {
                const jid = j.JOBID || j.job_id || j.id || '';
                const isActiveJob = String(jid) === String(id);
                const isHoverJob = hovered === `job-${jid}`;
                const js = STATUS_COLORS[j.Status || j.status || ''] || STATUS_COLORS.unknown;
                const jcolor = isActiveJob ? '#fff' : isHoverJob ? '#aaa' : '#888';
                return (
                  <div
                    key={jid}
                    onMouseEnter={() => setHovered(`job-${jid}`)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => navigate(`/vm?job_id=${jid}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', cursor: 'pointer', fontSize: 13, color: jcolor, background: isActiveJob ? '#111' : 'transparent', borderLeft: isActiveJob ? '2px solid #fff' : '2px solid transparent', userSelect: 'none', transition: 'all 0.15s', marginBottom: 2, borderRadius: '0 6px 6px 0' }}
                  >
                    <StatusDot status={j.Status || j.status || ''} />
                    <Icon name="monitor" width={13} height={13} color={js} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {j.Servername || j.servername || ''} (creating)
                    </span>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Main Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px', background: '#000' }}>
          {isJobView ? (
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 300, letterSpacing: '-0.02em', marginBottom: 6, color: '#fff' }}>VM Creation</h1>
              <p style={{ fontSize: 12, color: '#333', marginBottom: 32 }}>Track your VM creation progress</p>
              <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 4, padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                  <span style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Status</span>
                  <StatusBadge status={jobStatus} />
                </div>
                <div
                  ref={logRef}
                  style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 4, padding: 16, height: 300, whiteSpace: 'pre-wrap', fontFamily: 'Monaco,monospace', fontSize: 11, color: '#888', overflow: 'auto', lineHeight: 1.5 }}
                  dangerouslySetInnerHTML={{ __html: colorizeTerraformLog(jobLog) }}
                />
                {jobVMID && jobStatus === 'done' && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ color: '#aaa', fontSize: 12, marginBottom: 8 }}>
                      VM created successfully. Redirecting in {countdown} seconds...
                    </div>
                    <div style={{ width: '100%', height: 2, background: '#1a1a1a', borderRadius: 1, overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: '#22c55e', width: `${100 - (countdown / 10 * 100)}%`, transition: 'width 0.3s' }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : !id ? (
            <div style={{ color: '#666', fontSize: 13 }}>Select a VM from the list to view details</div>
          ) : !vm ? (
            <div style={{ fontSize: 13, color: '#333' }}>Loading...</div>
          ) : (
            <div style={{ maxWidth: 800 }}>
              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 28, alignItems: 'center' }}>
                <button
                  onClick={() => window.open(`/terminal?vmid=${vm.VMID}`, '_blank', 'noopener,noreferrer')}
                  style={{ padding: '8px 16px', borderRadius: 4, border: '1px solid #2563eb', background: 'rgba(37,99,235,0.1)', color: '#60a5fa', cursor: 'pointer', fontSize: 12, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Icon name="terminal" width={13} height={13} color="#60a5fa" /> Terminal
                </button>
                {!editing && (
                  <button
                    onClick={() => handleToggleVM(vm.VMID!, (vm.Status || 'stopped') === 'running' ? 'stop' : 'start')}
                    style={{ padding: '8px 16px', borderRadius: 4, border: '1px solid #1a1a1a', background: '#111', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}
                  >
                    {(vm.Status || 'stopped') === 'running' ? 'Stop' : 'Start'}
                  </button>
                )}
              </div>

              {/* VM Info Card */}
              <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 4, padding: 24, marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, paddingBottom: 20, borderBottom: '1px solid #1a1a1a' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 32 }}>
                      <FieldLabel label="VMID" value={String(vm.VMID)} mono />
                      <FieldLabel label="IP Address" value={vm.IP || '\u2014'} mono />
                    </div>
                  </div>
                  {editing ? (
                    <div>
                      <button onClick={() => { setEditing(false); if (vm) { setName(vm.Name || ''); setCores(vm.Cores || vm.CPU || 0); setMem(vm.Memory || 0); setHdd(vm.HDD || vm.Hdd || 0); } }}
                        style={{ marginRight: 8, padding: '8px 14px', background: 'transparent', border: '1px solid #1a1a1a', borderRadius: 4, color: '#aaa', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        style={{ padding: '8px 14px', background: '#fff', color: '#000', border: 'none', borderRadius: 4, cursor: saving ? 'default' : 'pointer', fontSize: 12, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  ) : (
                    <div>
                      <button
                        onClick={() => setEditing(true)}
                        style={{ padding: '8px 14px', background: '#fff', color: '#000', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
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
                  <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #1a1a1a' }}>
                    <button
                      onClick={handleDownloadKey}
                      style={{ padding: '8px 12px', background: 'transparent', border: '1px solid #1a1a1a', borderRadius: 4, color: '#666', cursor: 'pointer', fontSize: 12, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Icon name="download" width={12} height={12} color="#666" /> Download Private Key
                    </button>
                  </div>
                )}
              </div>

              {/* Danger Zone */}
              {!editing && (
                <div style={{ background: 'rgba(244,63,94,0.05)', border: '1px solid #f43f5e', borderRadius: 4, padding: 24 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: '#f43f5e', marginBottom: 8 }}>Danger Zone</h3>
                  <p style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>This action cannot be undone. The virtual machine will be permanently deleted.</p>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    style={{ padding: '10px 16px', background: '#dc2626', border: 'none', borderRadius: 4, color: '#fff', cursor: deleting ? 'default' : 'pointer', fontSize: 12, fontWeight: 600, opacity: deleting ? 0.7 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="trash" width={13} height={13} color="#fff" /> {deleting ? 'Deleting...' : 'Delete VM'}
                  </button>
                </div>
              )}

              {/* Support link */}
              <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid #111' }}>
                <p style={{ fontSize: 12, color: '#555' }}>
                  <a href={`/support?vmid=${target}`} style={{ color: '#666', textDecoration: 'none' }}>
                    Need help? Contact support →
                  </a>
                </p>
              </div>
            </div>
          )}
        </div>
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
    <div style={{ color: '#bbb', fontSize: 14, padding: '10px 12px', background: '#0a0a0a', borderRadius: 4, border: '1px solid #1a1a1a', fontWeight: 400 }}>
      {value}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#0a0a0a',
  border: '1px solid #1a1a1a',
  color: '#fff',
  fontSize: 14,
  padding: '10px 12px',
  borderRadius: 4,
  outline: 'none',
};

/* ===== Terraform log colorizer ===== */
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
    } else if (/^- (Finding|Installing|Downloading)/.test(L)) c = '#60a5fa';
    else if (/^(Initializing|Terraform has been successfully initialized)/.test(L)) c = '#22c55e';
    else if (/Terraform (will perform|used the selected)/.test(L)) c = '#ccc';
    else if (/Creation complete after/.test(L)) c = '#22c55e';
    else if (/(Still creating|Still destroying)\.\.\./.test(L)) c = '#666';
    else if (/Creating\.\.\./.test(L)) c = '#f59e0b';
    else if (/^  # .+ (will be |must be)/.test(L)) c = '#bbb';
    else if (/^\s+(with|on)\s/.test(L)) c = '#b91c1c';
    else if (/^\s+\d+: /.test(L)) c = '#b91c1c';

    if (c) {
      out.push(`<span style="color:${c}">${line}</span>`);
    } else {
      out.push(line);
    }
  }
  return out.join('\n');
}
