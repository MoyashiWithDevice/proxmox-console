interface AuthLayoutProps {
  children: React.ReactNode;
}

const dotBg = `url("data:image/svg+xml,%3Csvg width='32' height='32' viewBox='0 0 32 32' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='1' cy='1' r='0.85' fill='%231a1a28'/%3E%3C/svg%3E")`;

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', background: '#04040a', position: 'relative' }}>
      <div className="scanlines" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9997, background: 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.06) 3px,rgba(0,0,0,0.06) 4px)' }} />
      <div className="vignette" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9996, background: 'radial-gradient(ellipse 120% 110% at 50% 50%,transparent 40%,rgba(0,0,1,0.65) 100%)' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: -1, opacity: 0.5, backgroundImage: dotBg }} />

      <svg style={{ position: 'fixed', width: 0, height: 0 }}>
        <filter id="noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </svg>

      <div style={{
        width: '50%',
        minWidth: 500,
        background: 'linear-gradient(170deg,#0a0a12 0%,#04040a 100%)',
        display: 'flex',
        flexDirection: 'column',
        padding: 48,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40, zIndex: 2 }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 4H4a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h1m6 0h2a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2M5 14H4a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h1m6 0h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-2" />
          </svg>
          <span style={{ fontSize: 18, fontWeight: 600, color: '#fff', letterSpacing: '-0.02em' }}>Proxmox Console</span>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', zIndex: 2, maxWidth: 460 }}>
          <h2 style={{ fontSize: 34, fontWeight: 300, letterSpacing: '-0.04em', lineHeight: 1.2, marginBottom: 20 }}>
            Server<br />
            <span style={{ fontWeight: 600 }}>infrastructure.</span><br />
            <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 300 }}>Simplified.</span>
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', lineHeight: 1.7, marginBottom: 32 }}>
            Deploy, manage, and monitor your virtual machines with our Proxmox-based platform.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <FeatureItem text="One-click OS deployments" />
            <FeatureItem text="Instant terminal access" />
            <FeatureItem text="Real-time resource monitoring" />
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '35%', background: 'linear-gradient(0deg,rgba(255,255,255,0.013) 0%,transparent 100%)', pointerEvents: 'none', zIndex: 1 }} />
        <div style={{ position: 'absolute', top: '15%', right: -80, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle,rgba(99,102,241,0.07) 0%,transparent 70%)', filter: 'blur(50px)', pointerEvents: 'none', zIndex: 0 }} />
      </div>

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 48,
        position: 'relative',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}>
        <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 2 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function FeatureItem({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m12 2-9 5 9 5 9-5-9-5Z" />
        <path d="M3 12.6 12 17.6 21 12.6" />
        <path d="M3 17.6 12 22.6 21 17.6" />
      </svg>
      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>{text}</span>
    </div>
  );
}
