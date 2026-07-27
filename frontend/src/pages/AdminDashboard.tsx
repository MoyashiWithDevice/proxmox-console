import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAdminDashboard } from '../api';
import { Badge } from '../components/Badge';
import { Icon } from '../components/Icon';
import type { AdminDashboardData, AdminDashboardVM, AdminDashboardNode } from '../types';

const PAGE_SIZE = 10;

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

type StatusFilter = 'all' | 'running' | 'stopped';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

function UsageBar({ used, total }: { used: number; total: number }) {
  const pct = total === 0 ? 0 : Math.min(100, Math.round((used / total) * 100));
  const barColor = pct > 90 ? '#f43f5e' : pct > 70 ? '#f59e0b' : '#22c55e';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
      <div style={{ flex: 1, height: 4, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 2, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 11, color: '#555', minWidth: 32, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number | string; icon: string }) {
  return (
    <div style={{ flex: 1, minWidth: 140, padding: '20px 24px', border: '1px solid #111' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Icon name={icon} size={14} color="#444" />
        <span style={{ fontSize: 11, color: '#444', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 300, color: '#fff', lineHeight: 1 }}>
        {value}
      </div>
    </div>
  );
}

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);

  function load() {
    setLoading(true);
    setError('');
    fetchAdminDashboard()
      .then(setData)
      .catch((e) => setError(e.message || 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  if (loading && !data) {
    return <div style={{ padding: 40, color: '#555', fontSize: 13 }}>Loading dashboard...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: 40 }}>
        <div style={{ color: '#f43f5e', fontSize: 13, marginBottom: 12 }}>{error}</div>
        <button onClick={load} style={ghostBtn}>Retry</button>
      </div>
    );
  }

  if (!data) return null;

  const { summary, nodes, vms } = data;

  const filtered = vms.filter((v: AdminDashboardVM) => {
    const s = search.toLowerCase();
    if (s && !String(v.vmid).includes(s) && !(v.servername || '').toLowerCase().includes(s) && !(v.user_email || '').toLowerCase().includes(s)) return false;
    const st = (v.status || '').toLowerCase();
    if (statusFilter === 'running' && st !== 'running') return false;
    if (statusFilter === 'stopped' && st !== 'stopped') return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function goVM(uuid: string) {
    navigate(`/vm?id=${uuid}`);
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 300, color: '#fff' }}>Admin Dashboard</h1>
        <button onClick={load} style={ghostBtn}>
          <Icon name="refresh" size={11} /> Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <StatCard label="Total VMs" value={summary.total_vms} icon="monitor" />
        <StatCard label="Running" value={summary.running} icon="play" />
        <StatCard label="Stopped" value={summary.stopped} icon="pause" />
        <StatCard label="Users" value={summary.total_users} icon="users" />
      </div>

      {/* Node Resource Usage */}
      {nodes.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 14, fontWeight: 500, color: '#888', marginBottom: 12 }}>Node Resources</h2>
          <div style={{ display: 'flex', gap: 12 }}>
            {nodes.map((node: AdminDashboardNode) => (
              <div key={node.name} style={{ flex: 1, padding: '16px 20px', border: '1px solid #111' }}>
                <div style={{ fontSize: 13, color: '#fff', marginBottom: 12 }}>{node.name}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>CPU ({node.cpu_cores} cores)</div>
                    <UsageBar used={node.cpu_percent} total={100} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>Memory ({formatBytes(node.mem_used)} / {formatBytes(node.mem_total)})</div>
                    <UsageBar used={node.mem_used} total={node.mem_total} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>Disk ({formatBytes(node.disk_used)} / {formatBytes(node.disk_total)})</div>
                    <UsageBar used={node.disk_used} total={node.disk_total} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VM Table */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 280 }}>
            <Icon name="search" size={12} color="#333" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text" placeholder="Filter by name, ID, or email..." aria-label="Search VMs"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
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
                onClick={() => { setStatusFilter(f); setPage(1); }}
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
          <div style={{ fontSize: 12, color: '#444', marginLeft: 'auto' }}>
            {filtered.length} VM{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>User</th>
              <th style={th}>Name</th>
              <th style={th}>ID</th>
              <th style={th}>Status</th>
              <th style={th}>IP</th>
              <th style={th}>CPU</th>
              <th style={th}>Memory</th>
              <th style={th}>Disk</th>
              <th style={th}>Created</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: '64px 16px', textAlign: 'center' }}>
                  <div style={{ color: '#333', fontSize: 13 }}>
                    {vms.length === 0 ? 'No virtual machines found.' : 'No VMs match your filter.'}
                  </div>
                </td>
              </tr>
            ) : (
              paged.map((vm: AdminDashboardVM) => {
                const st = (vm.status || 'stopped').toLowerCase();
                return (
                  <tr
                    key={vm.uuid}
                    style={{ cursor: 'pointer' }}
                    onClick={() => goVM(vm.uuid)}
                  >
                    <td style={{ ...td, color: '#888' }}>{vm.user_email || '-'}</td>
                    <td style={{ ...td, color: '#fff' }}>{vm.servername || `VM ${vm.vmid}`}</td>
                    <td style={{ ...td, color: '#2a2a2a', fontFamily: 'monospace' }}>{vm.vmid}</td>
                    <td style={td}><Badge status={st} /></td>
                    <td style={{ ...td, color: '#555', fontFamily: 'monospace' }}>{vm.ip}</td>
                    <td style={{ ...td }}>
                      <div style={{ fontSize: 12, color: '#888' }}>{vm.cpu_cores} cores</div>
                      {st === 'running' && <UsageBar used={vm.cpu_usage_percent} total={100} />}
                    </td>
                    <td style={{ ...td }}>
                      <div style={{ fontSize: 11, color: '#555', marginBottom: 2 }}>{formatBytes(vm.mem_used)} / {formatBytes(vm.mem_total)}</div>
                      {st === 'running' && <UsageBar used={vm.mem_used} total={vm.mem_total} />}
                    </td>
                    <td style={{ ...td }}>
                      <div style={{ fontSize: 11, color: '#555', marginBottom: 2 }}>{formatBytes(vm.disk_used)} / {formatBytes(vm.disk_total)}</div>
                      {st === 'running' && <UsageBar used={vm.disk_used} total={vm.disk_total} />}
                    </td>
                    <td style={{ ...td, color: '#444', fontSize: 11 }}>
                      {new Date(vm.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 }}>
            <button
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
              style={{
                ...filterChip,
                opacity: safePage <= 1 ? 0.3 : 1,
                cursor: safePage <= 1 ? 'default' : 'pointer',
                color: '#888',
              }}
            >
              Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
              .reduce<(number | string)[]>((acc, p, i, arr) => {
                if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('...');
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                typeof p === 'string' ? (
                  <span key={`dot-${i}`} style={{ color: '#333', fontSize: 12 }}>...</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    style={{
                      ...filterChip,
                      color: p === safePage ? '#fff' : '#555',
                      borderColor: p === safePage ? '#555' : '#111',
                    }}
                  >
                    {p}
                  </button>
                )
              )}
            <button
              disabled={safePage >= totalPages}
              onClick={() => setPage(safePage + 1)}
              style={{
                ...filterChip,
                opacity: safePage >= totalPages ? 0.3 : 1,
                cursor: safePage >= totalPages ? 'default' : 'pointer',
                color: '#888',
              }}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
