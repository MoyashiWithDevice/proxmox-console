import { Icon } from './Icon';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', background: '#000' }}>
      <div style={{
        width: '50%',
        minWidth: 500,
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
        padding: 48,
        borderRight: '1px solid #111',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 }}>
          <Icon name="server" size={32} color="#fff" />
          <span style={{ fontSize: 18, fontWeight: 600, color: '#fff', letterSpacing: '-0.02em' }}>Proxmox Console</span>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 460 }}>
          <h2 style={{ fontSize: 34, fontWeight: 300, letterSpacing: '-0.04em', lineHeight: 1.2, marginBottom: 20, color: '#fff' }}>
            Server<br />
            <span style={{ fontWeight: 600 }}>infrastructure.</span><br />
            <span style={{ color: '#555', fontWeight: 300 }}>Simplified.</span>
          </h2>
          <p style={{ fontSize: 14, color: '#444', lineHeight: 1.7, marginBottom: 32 }}>
            Deploy, manage, and monitor your virtual machines with our Proxmox-based platform.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <FeatureItem text="One-click OS deployments" />
            <FeatureItem text="Instant terminal access" />
            <FeatureItem text="Real-time resource monitoring" />
          </div>
        </div>
      </div>

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 48,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function FeatureItem({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m12 2-9 5 9 5 9-5-9-5Z" />
        <path d="M3 12.6 12 17.6 21 12.6" />
        <path d="M3 17.6 12 22.6 21 17.6" />
      </svg>
      <span style={{ fontSize: 13, color: '#555' }}>{text}</span>
    </div>
  );
}
