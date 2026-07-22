import { useEffect, useState } from 'react';
import { fetchAdminUsers, type AdminUser } from '../api';

const th: React.CSSProperties = {
  padding: '10px 16px', fontSize: 11, color: '#333', fontWeight: 500,
  textAlign: 'left', borderBottom: '1px solid #111',
  textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap',
};

const td: React.CSSProperties = {
  padding: '14px 16px', fontSize: 13, color: '#ccc',
  borderBottom: '1px solid #0d0d0d', whiteSpace: 'nowrap',
};

export function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);

  useEffect(() => {
    fetchAdminUsers().then(setUsers).catch(console.error);
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 300, color: '#fff', marginBottom: 24 }}>User Management</h1>
      
      <div style={{ fontSize: 13, color: '#555', marginBottom: 16 }}>
        To promote a user to admin, run: <code style={{ color: '#aaa', background: '#111', padding: '2px 6px', borderRadius: 3 }}>./scripts/promote-admin.sh user@example.com</code>
      </div>
      
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>ID</th>
            <th style={th}>Email</th>
            <th style={th}>Role</th>
            <th style={th}>Joined</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td style={{ ...td, fontFamily: 'monospace' }}>{user.id}</td>
              <td style={{ ...td, color: '#fff' }}>{user.email || user.kratos_id}</td>
              <td style={td}>
                <span style={{ 
                  padding: '2px 6px', borderRadius: 4, 
                  background: user.role === 'admin' ? '#1e1e1e' : '#0a0a0a',
                  border: user.role === 'admin' ? '1px solid #333' : '1px solid #111',
                  color: user.role === 'admin' ? '#fff' : '#666',
                  fontSize: 11, textTransform: 'uppercase'
                }}>
                  {user.role}
                </span>
              </td>
              <td style={td}>{new Date(user.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
