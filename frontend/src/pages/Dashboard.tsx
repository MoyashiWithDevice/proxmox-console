import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchVMs } from '../lib/api';
import { Icon } from '../components/Icon';
import { StatusBadge } from '../components/StatusBadge';
import type { VMResponse } from '../types';

export function Dashboard() {
  const [items, setItems] = useState<VMResponse[]>([]);
  const navigate = useNavigate();

  const loadVMs = useCallback(() => {
    fetchVMs().then(setItems).catch(() => {});
  }, []);

  useEffect(() => {
    loadVMs();
    const interval = setInterval(loadVMs, 7000);
    return () => clearInterval(interval);
  }, [loadVMs]);

  const vmItems = items.filter((i) => i.type === 'vm');

  const totalCores = vmItems.reduce((sum, vm) => sum + (vm.Cores || vm.CPU || 0), 0);
  const totalMem = vmItems.reduce((sum, vm) => sum + (vm.Memory || 0), 0);
  const totalDisk = vmItems.reduce((sum, vm) => sum + (vm.HDD || vm.Hdd || 0), 0);

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

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, padding: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="server" width={28} height={28} color="#6366f1" />
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>Proxmox Console</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              onClick={() => { window.location.href = '/logout'; }}
              style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff', padding: '8px 16px', borderRadius: 6, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
              }}
            >
              <Icon name="logOut" /> Log Out
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 32 }}>
          <StatCard icon="server" label="VMs" value={vmItems.length} />
          <StatCard icon="cpu" label="Cores" value={totalCores} />
          <StatCard icon="memoryStick" label="Memory" value={`${totalMem} GB`} />
          <StatCard icon="hardDrive" label="Disk" value={`${totalDisk} GB`} />
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name="layers" />
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>Virtual Machines</h2>
            </div>
            <button
              onClick={loadVMs}
              style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff', padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
              }}
            >
              <Icon name="refresh" /> Refresh
            </button>
          </div>

          <table className="vm-table" style={{
            width: '100%', borderCollapse: 'collapse', background: '#111',
            border: '1px solid #1a1a1a', borderRadius: 12, overflow: 'hidden',
          }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                <Th>Type</Th>
                <Th>ID</Th>
                <Th>Name</Th>
                <Th>Status</Th>
                <Th>IP</Th>
                <Th>CPU</Th>
                <Th>Memory</Th>
                <Th>Disk</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {vmItems.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '48px 16px', textAlign: 'center', color: '#555', fontSize: 14 }}>
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

                  return (
                    <tr
                      key={vmid}
                      style={{ borderBottom: '1px solid #1a1a1a', cursor: 'pointer' }}
                      onDoubleClick={() => navigate(`/vm?vmid=${vmid}`)}
                    >
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#888' }}>
                        <Icon name="package" />
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#ddd' }}>
                        <a href={`/vm?vmid=${vmid}`} style={{ color: '#888', textDecoration: 'none', fontFamily: 'monospace' }}>
                          {vmid}
                        </a>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#ddd', fontWeight: 500 }}>
                        <a href={`/vm?vmid=${vmid}`} style={{ color: '#fff', textDecoration: 'none' }}>
                          {name}
                        </a>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13 }}>
                        <StatusBadge status={status} />
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#777', fontFamily: 'monospace' }}>
                        {ip}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#aaa' }}>{cores}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#aaa' }}>{mem} GB</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#aaa' }}>{hdd} GB</td>
                      <td style={{ padding: '12px 16px', fontSize: 13 }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {status !== 'running' && (
                            <ActionBtn label="Start" color="#22c55e" onClick={() => vmAction(vmid, 'put')} />
                          )}
                          {status === 'running' && (
                            <ActionBtn label="Stop" color="#f43f5e" onClick={() => vmAction(vmid, 'delete')} />
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

function StatCard({ icon, label, value }: { icon: 'server' | 'cpu' | 'memoryStick' | 'hardDrive'; label: string; value: string | number }) {
  return (
    <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, background: 'rgba(99,102,241,0.1)', borderRadius: 8 }}>
          <Icon name={icon} />
        </div>
        <span style={{ fontSize: 13, color: '#888' }}>{label}</span>
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em' }}>{value}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{
      padding: '12px 16px', textAlign: 'left', fontSize: 11, color: '#777',
      textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500,
    }}>
      {children}
    </th>
  );
}

function ActionBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
        color, padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
      }}
    >
      {label}
    </button>
  );
}
