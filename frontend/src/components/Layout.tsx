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
        gap: 16,
        padding: '0 24px',
        height: 52,
        borderBottom: '1px solid #111',
        flexShrink: 0,
        background: '#000',
      }}
    >
      <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 160, textDecoration: 'none' }}>
        <Icon name="server" size={16} color="#fff" />
        <span style={{ fontSize: 14, fontWeight: 600, color: '#fff', letterSpacing: '-0.01em' }}>
          Proxmox Console
        </span>
        <span style={{ fontSize: 11, color: '#333', marginLeft: 2 }}>v1.0</span>
      </a>
      <div style={{ flex: 1, maxWidth: 320, position: 'relative' }}>
        <Icon name="search" size={12} color="#333" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
        <input
          type="text" placeholder="Search…" aria-label="Search"
          style={{
            width: '100%', background: '#000', border: '1px solid #111',
            borderRadius: 4, padding: '6px 10px 6px 28px',
            color: '#fff', fontSize: 12, outline: 'none',
          }}
        />
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 20 }}>
        <button aria-label="Notifications" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <Icon name="bell" size={15} color="#333" />
        </button>
        {children}
        <span style={{ fontSize: 12, color: '#444' }}>admin</span>
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
          <Icon name="logOut" size={12} /> Logout
        </button>
      </div>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#000', display: 'flex', flexDirection: 'column' }}>
      <PageHeader />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '32px 36px' }}>
        {children}
      </div>
    </div>
  );
}
