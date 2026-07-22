import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthGuard } from './components/AuthGuard';
import { AppLayout } from './components/AppLayout';
import { Dashboard } from './pages/Dashboard';
import { VMDetail } from './pages/VMDetail';
import { VMCreate } from './pages/VMCreate';
import { TerminalPage } from './pages/Terminal';
import { Support } from './pages/Support';
import { AuthPage, ErrorAuthPage } from './pages/Auth';
import { ErrorPage } from './pages/ErrorPage';
import { AdminSettingsPage } from './pages/AdminSettings';
import { AdminSupportPage } from './pages/AdminSupport';
import { AdminUsersPage } from './pages/AdminUsers';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AuthPage isRegistration={false} />} />
        <Route path="/registration" element={<AuthPage isRegistration={true} />} />
        <Route path="/error" element={<ErrorAuthPage />} />
        <Route path="/error-page" element={<ErrorPage />} />
        <Route path="/terminal" element={<AuthGuard><TerminalPage /></AuthGuard>} />

        <Route element={<AuthGuard><AppLayout /></AuthGuard>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/vm" element={<VMDetail />} />
          <Route path="/job" element={<VMDetail />} />
          <Route path="/vm/create" element={<VMCreate />} />
          <Route path="/support" element={<Support />} />
          
          {/* Admin Routes */}
          <Route path="/admin" element={<Navigate to="/admin/settings" replace />} />
          <Route path="/admin/settings" element={<AdminSettingsPage />} />
          <Route path="/admin/support" element={<AdminSupportPage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
