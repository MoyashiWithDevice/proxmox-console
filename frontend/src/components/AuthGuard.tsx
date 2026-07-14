import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const location = useLocation();

  useEffect(() => {
    fetch('/api/vms', { credentials: 'include' })
      .then((r) => {
        setAuthed(r.ok);
      })
      .catch(() => {
        setAuthed(false);
      });
  }, []);

  if (authed === null) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#000', color: '#333', fontSize: 13,
      }}>
        Loading...
      </div>
    );
  }

  if (!authed) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
