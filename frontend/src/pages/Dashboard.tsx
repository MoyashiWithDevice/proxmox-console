import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchVMs, fetchSettings } from '../lib/api';
import { Icon } from '../components/Icon';
import { Badge } from '../components/Badge';
import { StatCard } from '../components/StatCard';
import type { VMResponse, SettingsResponse } from '../types';

export function Dashboard() {
  const [items, setItems] = useState<VMResponse[]>([]);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const navigate = useNavigate();

  const loadVMs = useCallback(() => {
    fetchVMs().then((data) => setItems(data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    fetchSettings().then(setSettings).catch(() => {});
  }, []);

  useEffect(() => {
    loadVMs();
    const interval = setInterval(loadVMs, 7000);
    return () => clearInterval(interval);
  }, [loadVMs]);

  const vmItems = items.filter((i) => i.type === 'vm');
  const totalVMs = vmItems.length;
  const totalCores = vmItems.reduce((sum, vm) => sum + (vm.Cores || vm.CPU || 0), 0);
  const totalMem = vmItems.reduce((sum, vm) => sum + (vm.Memory || 0), 0);
  const totalDisk = vmItems.reduce((sum, vm) => sum + (vm.HDD || vm.Hdd || 0), 0);

  const maxCores = settings?.cpu?.max || 1;
  const maxMem = settings?.memory?.max || 1;
  const maxDisk = settings?.hdd?.max || 1;

  async function vmAction(vmid: number | undefined, action: string) {
    if (!vmid) return;
    try {
      await fetch('/api/vm', {
        method: action.toUpperCase(),
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vmid }),
      });
      loadVMs();
    } catch {}
  }

  const th: React.CSSProperties = {
    padding: '10px 16px', fontSize: 11, color: '#333', fontWeight: 500,
    textAlign: 'left', borderBottom: '1px solid #111',
    textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap',
  };

  const td: React.CSSProperties = {
    padding: '14px 16px', fontSize: 13, color: '#ccc',
    borderBottom: '1px solid #0d0d0d', whiteSpace: 'nowrap',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#000', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, padding: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="server" size={22} color="#fff" />
            <h1 style={{ fontSize: 22, fontWeight: 300, letterSpacing: '-0.02em', color: '#fff' }}>Proxmox Console</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              onClick={() => { window.location.href = '/logout'; }}
              style={ghostBtn}
            >
              <Icon name="logOut" size={12} /> Log Out
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 0, border: '1px solid #111', marginBottom: 32, flexWrap: 'wrap' }}>
          <StatCard iconName="server" label="VMs" used={totalVMs} total={Math.max(1, totalVMs)} unit="" />
          <StatCard iconName="cpu" label="CPU" used={totalCores} total={maxCores} unit="Cores" />
          <StatCard iconName="memoryStick" label="Memory" used={totalMem} total={maxMem} unit="GB" />
          <StatCard iconName="hardDrive" label="Disk" used={totalDisk} total={maxDisk} unit="GB" />
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name="layers" size={14} color="#333" />
              <h2 style={{ fontSize: 13, color: '#555' }}>
                {vmItems.filter(v => v.Status === 'running').length} running ·{' '}
                {vmItems.filter(v => v.Status === 'stopped').length} stopped ·{' '}
                {vmItems.length} total
              </h2>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => navigate('/info')}
                style={{ ...ghostBtn, padding: '6px 14px', fontSize: 12 }}
              >
                <Icon name="plus" size={11} /> Create VM
              </button>
              <button
                onClick={loadVMs}
                style={{ ...ghostBtn, padding: '6px 14px', fontSize: 12 }}
              >
                <Icon name="refresh" size={11} /> Refresh
              </button>
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
              {vmItems.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '48px 16px', textAlign: 'center', color: '#555', fontSize: 13 }}>
                    No virtual machines found.
                  </td>
                </tr>
              ) : (
                vmItems.map((vm) => {
                  const vmid = vm.VMID;
                  const name = vm.Name || vm.Servername || 'Unnamed';
                  const status = vm.Status || 'stopped';
                  const ip = vm.IP || '-';
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
                      onDoubleClick={() => navigate(`/vm?vmid=${vmid}`)}
                    >
                      <td style={{ ...td, color: '#444', width: 40 }}>
                        <Icon name="package" size={13} color="#444" />
                      </td>
                      <td style={{ ...td, color: '#2a2a2a', fontFamily: 'monospace' }}>
                        <a href={`/vm?vmid=${vmid}`} style={{ color: '#2a2a2a', textDecoration: 'none' }}>
                          {vmid}
                        </a>
                      </td>
                      <td style={{ ...td, color: '#fff' }}>
                        <a href={`/vm?vmid=${vmid}`} style={{ color: '#fff', textDecoration: 'none' }}>
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
                            <ActionBtn label="Start" onClick={() => vmAction(vmid, 'put')} />
                          )}
                          {status === 'running' && (
                            <ActionBtn label="Stop" onClick={() => vmAction(vmid, 'delete')} />
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
      </div>
    </div>
  );
}

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
  padding: '8px 16px',
};

function ActionBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={ghostBtn}
    >
      {label}
    </button>
  );
}
