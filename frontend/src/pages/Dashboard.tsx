import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Badge } from '../components/Badge';
import { useVM } from '../context/VMContext';
import { changeVMState } from '../api';
import { useState, type MouseEvent } from 'react';

type StatusFilter = 'all' | 'running' | 'stopped';

const th: React.CSSProperties = {
  padding: '10px 16px', fontSize: 11, color: '#333', fontWeight: 500,
  textAlign: 'left', borderBottom: '1px solid #111',
  textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap',
};

const td: React.CSSProperties = {
  padding: '14px 16px', fontSize: 13, color: '#ccc',
  borderBottom: '1px solid #0d0d0d', whiteSpace: 'nowrap',
};

const ghostBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #1a1a1a',
  borderRadius: 4,
  color: '#444',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  padding: '6px 14px',
};

const filterChip: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #111',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 11,
  padding: '4px 10px',
  letterSpacing: '0.05em',
  userSelect: 'none',
};

function ActionBtn({ label, onClick }: { label: string; onClick: (e: MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button onClick={onClick} style={ghostBtn}>
      {label}
    </button>
  );
}

export function Dashboard() {
  const { vms, reload } = useVM();
  const navigate = useNavigate();
  const [hovered, setHovered] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const filtered = vms.filter((v) => {
    const s = search.toLowerCase();
    if (s && !String(v.VMID).includes(s) && !(v.Name || '').toLowerCase().includes(s)) return false;
    if (statusFilter !== 'all' && (v.Status || '').toLowerCase() !== statusFilter) return false;
    return true;
  });

  async function handleAction(vmid: number | undefined, action: 'start' | 'stop') {
    if (!vmid) return;
    try {
      await changeVMState(vmid, action);
      reload();
    } catch {}
  }

  const running = vms.filter((v) => (v.Status || '').toLowerCase() === 'running').length;
  const stopped = vms.filter((v) => (v.Status || '').toLowerCase() === 'stopped').length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 300, letterSpacing: '-0.02em', color: '#fff' }}>
          Virtual Machines
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => navigate('/vm/create')} style={ghostBtn}>
            <Icon name="plus" size={11} /> Create VM
          </button>
          <button onClick={reload} style={ghostBtn}>
            <Icon name="refresh" size={11} />
          </button>
        </div>
      </div>

      <div style={{ fontSize: 13, color: '#555', marginBottom: 20 }}>
        {running} running · {stopped} stopped · {vms.length} total
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 280 }}>
          <Icon name="search" size={12} color="#333" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text" placeholder="Filter VMs…" aria-label="Search VMs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%', background: '#000', border: '1px solid #111',
              borderRadius: 4, padding: '6px 10px 6px 28px',
              color: '#fff', fontSize: 12, outline: 'none',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'running', 'stopped'] as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              style={{
                ...filterChip,
                color: statusFilter === f ? '#ccc' : '#333',
                borderColor: statusFilter === f ? '#333' : '#111',
                fontWeight: statusFilter === f ? 500 : 400,
              }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Type</th>
            <th style={th}>ID</th>
            <th style={th}>Name</th>
            <th style={th}>Status</th>
            <th style={th}>IP</th>
            <th style={th}>CPU</th>
            <th style={th}>Memory</th>
            <th style={th}>Disk</th>
            <th style={th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={9} style={{ padding: '64px 16px', textAlign: 'center' }}>
                <div style={{ color: '#333', fontSize: 13, marginBottom: 8 }}>
                  {vms.length === 0
                    ? 'No virtual machines yet.'
                    : 'No VMs match your filter.'}
                </div>
                {vms.length === 0 && (
                  <button
                    onClick={() => navigate('/vm/create')}
                    style={{ ...ghostBtn, display: 'inline-flex', color: '#fff' }}
                  >
                    <Icon name="plus" size={11} /> Create your first VM
                  </button>
                )}
              </td>
            </tr>
          ) : (
            filtered.map((vm) => {
              const vmid = vm.VMID;
              const name = vm.Name || vm.Servername || 'Unnamed';
              const status = (vm.Status || vm.status || 'stopped').toLowerCase();
              const ip = vm.IP || '\u2014';
              const cores = vm.Cores || vm.CPU || 0;
              const mem = vm.Memory || 0;
              const hdd = vm.HDD || vm.Hdd || 0;
              const isHover = hovered === vmid;

              return (
                <tr
                  key={vmid}
                  style={{ background: isHover ? '#080808' : 'transparent', cursor: 'pointer' }}
                  onMouseEnter={() => setHovered(vmid!)}
                  onMouseLeave={() => setHovered(null)}
                  onDoubleClick={() => navigate(`/vm?id=${vmid}`)}
                >
                  <td style={{ ...td, color: '#444', width: 40 }}>
                    <Icon name="monitor" size={13} color="#444" />
                  </td>
                  <td style={{ ...td, color: '#2a2a2a', fontFamily: 'monospace' }}>
                    <a href={`/vm?id=${vmid}`} style={{ color: '#2a2a2a', textDecoration: 'none' }}>
                      {vmid}
                    </a>
                  </td>
                  <td style={{ ...td, color: '#fff' }}>
                    <a href={`/vm?id=${vmid}`} style={{ color: '#fff', textDecoration: 'none' }}>
                      {name}
                    </a>
                  </td>
                  <td style={td}>
                    <Badge status={status} />
                  </td>
                  <td style={{ ...td, color: '#555', fontFamily: 'monospace' }}>
                    {ip}
                  </td>
                  <td style={{ ...td, color: '#888' }}>{cores}</td>
                  <td style={{ ...td, color: '#888' }}>{mem} GB</td>
                  <td style={{ ...td, color: '#888' }}>{hdd} GB</td>
                  <td style={{ ...td, color: '#ccc' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {status !== 'running' && (
                        <ActionBtn label="Start" onClick={(e) => { e.stopPropagation(); handleAction(vmid, 'start'); }} />
                      )}
                      {status === 'running' && (
                        <ActionBtn label="Stop" onClick={(e) => { e.stopPropagation(); handleAction(vmid, 'stop'); }} />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
