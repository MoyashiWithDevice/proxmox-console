import { Icon } from './Icon';

interface PageHeaderProps {
  children?: React.ReactNode;
}

export function PageHeader({ children }: PageHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 32px',
        height: 52,
        borderBottom: '1px solid #111',
        flexShrink: 0,
        background: '#000',
      }}
    >
      <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#fff', letterSpacing: '-0.01em' }}>
          Proxmox Console
        </span>
        <span style={{ fontSize: 11, color: '#333', marginLeft: 2 }}>v1.0</span>
      </a>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        {children}
        <button
          aria-label="Logout"
          onClick={() => { window.location.href = '/logout'; }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: '#444',
            fontSize: 12,
          }}
        >
          <Icon name="logOut" /> Logout
        </button>
      </div>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', flexDirection: 'column' }}>
      <PageHeader />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 20px' }}>
        <div style={{ marginTop: 64, width: '100%', maxWidth: 960 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
