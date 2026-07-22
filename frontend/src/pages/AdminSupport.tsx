import { useEffect, useState } from 'react';
import { fetchAdminSupport, updateSupportStatus, type SupportRequest } from '../api';

const th: React.CSSProperties = {
  padding: '10px 16px', fontSize: 11, color: '#333', fontWeight: 500,
  textAlign: 'left', borderBottom: '1px solid #111',
  textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap',
};

const td: React.CSSProperties = {
  padding: '14px 16px', fontSize: 13, color: '#ccc',
  borderBottom: '1px solid #0d0d0d', verticalAlign: 'top',
};

const statusStyles: Record<string, { bg: string; color: string }> = {
  pending: { bg: '#2a2a2a', color: '#fff' },
  in_progress: { bg: '#1e293b', color: '#60a5fa' },
  resolved: { bg: '#0d2818', color: '#4ade80' },
};

const statusLabels: Record<string, string> = {
  pending: '未対応',
  in_progress: '対応中',
  resolved: '完了',
};

export function AdminSupportPage() {
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [selected, setSelected] = useState<SupportRequest | null>(null);

  useEffect(() => {
    fetchAdminSupport().then(setRequests).catch(console.error);
  }, []);

  const handleStatusChange = async (id: number, newStatus: string) => {
    await updateSupportStatus(id, newStatus);
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: newStatus } : r))
    );
    if (selected?.id === id) {
      setSelected((prev) => (prev ? { ...prev, status: newStatus } : null));
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 300, color: '#fff', marginBottom: 24 }}>Support Requests</h1>
      
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>ID</th>
            <th style={th}>Date</th>
            <th style={th}>From</th>
            <th style={th}>Subject</th>
            <th style={th}>VMID</th>
            <th style={th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((req) => {
            const st = statusStyles[req.status] || statusStyles.pending;
            return (
              <tr 
                key={req.id} 
                onClick={() => setSelected(req)}
                style={{ 
                  cursor: 'pointer', 
                  background: selected?.id === req.id ? '#111' : 'transparent',
                  borderLeft: selected?.id === req.id ? '2px solid #fff' : '2px solid transparent',
                }}
              >
                <td style={{ ...td, fontFamily: 'monospace' }}>#{req.id}</td>
                <td style={td}>{new Date(req.created_at).toLocaleDateString()}</td>
                <td style={{ ...td, color: '#fff' }}>{req.email || req.kratos_id.slice(0, 8)}</td>
                <td style={{ ...td, color: '#fff' }}>{req.subject}</td>
                <td style={td}>{req.vmid || '-'}</td>
                <td style={td}>
                  <select
                    value={req.status}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => handleStatusChange(req.id, e.target.value)}
                    style={{
                      padding: '4px 8px', borderRadius: 4,
                      background: st.bg, color: st.color,
                      border: '1px solid #333', fontSize: 11,
                      textTransform: 'uppercase', cursor: 'pointer',
                    }}
                  >
                    <option value="pending">未対応</option>
                    <option value="in_progress">対応中</option>
                    <option value="resolved">完了</option>
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {selected && (
        <div style={{ 
          marginTop: 32, padding: 24, background: '#0a0a0a', 
          border: '1px solid #111', borderRadius: 6 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ marginTop: 0, color: '#fff', fontSize: 18 }}>{selected.subject}</h2>
              <div style={{ color: '#555', fontSize: 12, marginBottom: 16 }}>
                From: {selected.email || selected.kratos_id} | VM: {selected.vmid || 'N/A'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['pending', 'in_progress', 'resolved'] as const).map((s) => {
                const st = statusStyles[s];
                const isActive = selected.status === s;
                return (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(selected.id, s)}
                    style={{
                      padding: '6px 12px', borderRadius: 4,
                      background: isActive ? st.bg : 'transparent',
                      color: isActive ? st.color : '#666',
                      border: `1px solid ${isActive ? st.color : '#333'}`,
                      fontSize: 11, textTransform: 'uppercase', cursor: 'pointer',
                    }}
                  >
                    {statusLabels[s]}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ 
            background: '#000', padding: 16, borderRadius: 4, 
            border: '1px solid #111', color: '#aaa', fontSize: 13,
            whiteSpace: 'pre-wrap' 
          }}>
            {selected.details}
          </div>
        </div>
      )}
    </div>
  );
}
