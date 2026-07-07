import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthGuard } from './components/AuthGuard';
import { Dashboard } from './pages/Dashboard';
import { VMDetail } from './pages/VMDetail';
import { TerminalPage } from './pages/Terminal';
import { Support } from './pages/Support';
import { ResourceSelection } from './pages/ResourceSelection';
import { ServerInfo } from './pages/ServerInfo';
import { AuthPage, ErrorAuthPage } from './pages/Auth';
import { ErrorPage } from './pages/ErrorPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AuthPage isRegistration={false} />} />
        <Route path="/registration" element={<AuthPage isRegistration={true} />} />
        <Route path="/error" element={<ErrorAuthPage />} />
        <Route path="/error-page" element={<ErrorPage />} />
        <Route path="/" element={<AuthGuard><Dashboard /></AuthGuard>} />
        <Route path="/vm" element={<AuthGuard><VMDetail /></AuthGuard>} />
        <Route path="/terminal" element={<AuthGuard><TerminalPage /></AuthGuard>} />
        <Route path="/support" element={<AuthGuard><Support /></AuthGuard>} />
        <Route path="/resource" element={<AuthGuard><ResourceSelection /></AuthGuard>} />
        <Route path="/info" element={<AuthGuard><ServerInfo /></AuthGuard>} />
      </Routes>
    </BrowserRouter>
  );
}
