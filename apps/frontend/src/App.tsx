import { lazy, Suspense, type ReactElement } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider } from '@/contexts/AuthContext';
import { TenantProvider, TenantGate } from '@/contexts/TenantContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { ConfirmProvider } from '@/contexts/ConfirmContext';
import { Layout } from '@/components/Layout';
import { ProtectedRoute, PermissionRoute, RootRedirect } from '@/components/RouteGuards';
import { LandingPage } from '@/pages/LandingPage';
import { LoginPage } from '@/pages/LoginPage';

// Páginas da área autenticada carregadas sob demanda (named exports → interop).
const InboxPage = lazy(() => import('@/pages/InboxPage').then((m) => ({ default: m.InboxPage })));
const SupportPage = lazy(() => import('@/pages/SupportPage').then((m) => ({ default: m.SupportPage })));
const SupportConfigPage = lazy(() => import('@/pages/SupportConfigPage').then((m) => ({ default: m.SupportConfigPage })));
const SupportClientsPage = lazy(() => import('@/pages/SupportClientsPage').then((m) => ({ default: m.SupportClientsPage })));
const ContactsPage = lazy(() => import('@/pages/ContactsPage').then((m) => ({ default: m.ContactsPage })));
const KnowledgePage = lazy(() => import('@/pages/KnowledgePage').then((m) => ({ default: m.KnowledgePage })));
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const SellersPage = lazy(() => import('@/pages/SellersPage').then((m) => ({ default: m.SellersPage })));
const CampaignsPage = lazy(() => import('@/pages/CampaignsPage').then((m) => ({ default: m.CampaignsPage })));
const NumberHealthPage = lazy(() => import('@/pages/NumberHealthPage').then((m) => ({ default: m.NumberHealthPage })));
const UsersPage = lazy(() => import('@/pages/UsersPage').then((m) => ({ default: m.UsersPage })));
const PlaybookPage = lazy(() => import('@/pages/PlaybookPage').then((m) => ({ default: m.PlaybookPage })));
const EmailChannelSettingsPage = lazy(() => import('@/pages/EmailChannelSettingsPage').then((m) => ({ default: m.EmailChannelSettingsPage })));
const DevTokensPage = lazy(() => import('@/pages/DevTokensPage').then((m) => ({ default: m.DevTokensPage })));
// Portal do cliente — área pública e independente (auth própria, fora do Layout interno).
const PortalPage = lazy(() => import('@/pages/portal/PortalPage').then((m) => ({ default: m.PortalPage })));

function PageFallback() {
  return <div className="flex h-full items-center justify-center text-base-content/40">Carregando...</div>;
}

// Atalho: rota protegida por permissão (admin passa sempre).
function Perm({ perm, children }: { perm: string; children: ReactElement }) {
  return <PermissionRoute perm={perm}>{children}</PermissionRoute>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
    <ToastProvider>
      <ConfirmProvider>
        <AuthProvider>
          <TenantProvider>
            <BrowserRouter>
              <Routes>
                {/* Modo interno: "/" leva ao login/app. A landing fica preservada em /landing
                    (reativar venda = trocar "/" de volta para <LandingPage />). */}
                <Route path="/" element={<RootRedirect />} />
                <Route path="/landing" element={<LandingPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/portal" element={<Suspense fallback={<PageFallback />}><PortalPage /></Suspense>} />
                <Route
                  element={
                    <ProtectedRoute>
                      <TenantGate>
                        <Layout />
                      </TenantGate>
                    </ProtectedRoute>
                  }
                >
                  <Route element={<Suspense fallback={<PageFallback />}><Outlet /></Suspense>}>
                    {/* /inbox fica sem gate de permissão: é o destino de fallback universal */}
                    <Route path="/inbox" element={<InboxPage />} />
                    <Route path="/dashboard" element={<Perm perm="dashboard"><DashboardPage /></Perm>} />
                    <Route path="/support" element={<Perm perm="inbox"><SupportPage /></Perm>} />
                    <Route path="/support/config" element={<Perm perm="ai_control"><SupportConfigPage /></Perm>} />
                    <Route path="/support/clients" element={<Perm perm="inbox"><SupportClientsPage /></Perm>} />
                    <Route path="/contacts" element={<Perm perm="contacts"><ContactsPage /></Perm>} />
                    <Route path="/knowledge" element={<Perm perm="knowledge"><KnowledgePage /></Perm>} />
                    <Route path="/sellers" element={<Perm perm="sellers"><SellersPage /></Perm>} />
                    <Route path="/campaigns" element={<Perm perm="campaigns"><CampaignsPage /></Perm>} />
                    <Route path="/sender/health" element={<Perm perm="campaigns"><NumberHealthPage /></Perm>} />
                    <Route path="/users" element={<Perm perm="users"><UsersPage /></Perm>} />
                    <Route path="/playbook" element={<Perm perm="ai_control"><PlaybookPage /></Perm>} />
                    <Route path="/settings/email-channel" element={<Perm perm="admin"><EmailChannelSettingsPage /></Perm>} />
                    {import.meta.env.DEV && <Route path="/dev/tokens" element={<DevTokensPage />} />}
                  </Route>
                </Route>
                <Route path="*" element={<Navigate to="/inbox" replace />} />
              </Routes>
            </BrowserRouter>
          </TenantProvider>
        </AuthProvider>
      </ConfirmProvider>
    </ToastProvider>
    </QueryClientProvider>
  );
}
