import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/Layout';
import { Icon } from '../components/Icon';

export function ErrorPage() {
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code');

  let codeStr = code || '404';
  let title = 'Not Found';
  let desc = 'The requested page was not found.';

  if (code === '500') { title = 'Internal Server Error'; desc = 'An internal server error occurred.'; }
  else if (code === '503') { title = 'Service Unavailable'; desc = 'The authentication service is currently unavailable.'; }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#000', color: '#fff' }}>
      <PageHeader />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '0 64px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <Icon name="alertTriangle" color="#f43f5e" />
          <span style={{ fontSize: 11, color: '#f43f5e', fontFamily: 'monospace', letterSpacing: '0.08em' }}>HTTP {codeStr}</span>
        </div>
        <div style={{ fontSize: 48, fontWeight: 200, color: '#fff', letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 16, textAlign: 'center' }}>
          {codeStr}
        </div>
        <div style={{ fontSize: 14, color: '#555', letterSpacing: '0.02em', marginBottom: 8, textAlign: 'center' }}>{title}</div>
        <div style={{ fontSize: 13, color: '#444', lineHeight: 1.7, maxWidth: 380, textAlign: 'center', marginBottom: 40 }}>{desc}</div>
        <button
          onClick={() => { window.location.href = '/'; }}
          style={{ background: '#fff', color: '#000', border: 'none', padding: '10px 24px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, letterSpacing: '0.04em' }}
        >
          <Icon name="arrowLeft" /> Return to dashboard
        </button>
      </div>
    </div>
  );
}
