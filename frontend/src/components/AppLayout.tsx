import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { VMProvider } from '../context/VMContext';
import { useEffect, useState } from 'react';

function MainContent() {
  const location = useLocation();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(false);
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, [location.pathname, location.search]);

  return (
    <div style={{
      flex: 1, overflowY: 'auto', padding: '32px 36px',
      background: '#000',
      opacity: visible ? 1 : 0,
      transition: 'opacity 150ms ease',
    }}>
      <Outlet />
    </div>
  );
}

export function AppLayout() {
  return (
    <VMProvider>
      <div style={{
        display: 'flex', flexDirection: 'column',
        height: '100vh', background: '#000', color: '#fff',
      }}>
        <Header />
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <Sidebar />
          <MainContent />
        </div>
      </div>
    </VMProvider>
  );
}
