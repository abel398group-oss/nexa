import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { TenantProvider, TenantGate } from '@/contexts/TenantContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { ConfirmProvider } from '@/contexts/ConfirmContext';
import { Layout } from '@/components/Layout';
import { LandingPage } from '@/pages/LandingPage';
import { LoginPage } from '@/pages/LoginPage';
import { InboxPage } from '@/pages/InboxPage';
import { SupportPage } from '@/pages/SupportPage';
import { ContactsPage } from '@/pages/ContactsPage';
import { KnowledgePage } from '@/pages/KnowledgePage';
import { DashboardPage } from '@/pages/DashboardPage';
import { SellersPage } from '@/pages/SellersPage';
import { CampaignsPage } from '@/pages/CampaignsPage';
import { UsersPage } from '@/pages/UsersPage';
import { PlaybookPage } from '@/pages/PlaybookPage';
import { DevTokensPage } from '@/pages/DevTokensPage';
import { EmailChannelSettingsPage } from '@/pages/EmailChannelSettingsPage';

function Protected({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-full items-center justify-center text-base-content/40">Carregando...</div>;
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <ToastProvider>
    <ConfirmProvider>
    <AuthProvider>
    <TenantProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <Protected>
                <TenantGate>
                  <Layout />
                </TenantGate>
              </Protected>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/inbox" element={<InboxPage />} />
            <Route path="/support" element={<SupportPage />} />
            <Route path="/contacts" element={<ContactsPage />} />
            <Route path="/knowledge" element={<KnowledgePage />} />
            <Route path="/sellers" element={<SellersPage />} />
            <Route path="/campaigns" element={<CampaignsPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/playbook" element={<PlaybookPage />} />
            <Route path="/settings/email-channel" element={<EmailChannelSettingsPage />} />
            {import.meta.env.DEV && (
              <Route path="/dev/tokens" element={<DevTokensPage />} />
            )}
          </Route>
          <Route path="*" element={<Navigate to="/inbox" replace />} />
        </Routes>
      </BrowserRouter>
    </TenantProvider>
    </AuthProvider>
    </ConfirmProvider>
    </ToastProvider>
  );
}
