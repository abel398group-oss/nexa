import { lazy, Suspense, type ReactElement } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { queryClient } from '@/shared/lib/queryClient';
import { AuthProvider } from '@/app/providers/AuthContext';
import { TenantProvider, TenantGate } from '@/app/providers/TenantContext';
import { ToastProvider } from '@/app/providers/ToastContext';
import { ConfirmProvider } from '@/app/providers/ConfirmContext';
import { Layout } from '@/components/Layout';
import { ProtectedRoute, PermissionRoute, RootRedirect } from '@/components/RouteGuards';
import { LandingPage } from '@/pages/LandingPage';
import { LoginPage } from '@/pages/LoginPage';

const ResetPasswordPage = lazy(() => import('@/pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })));

// Páginas da área autenticada carregadas sob demanda (named exports → interop).
const InboxPage = lazy(() => import('@/pages/InboxPage').then((m) => ({ default: m.InboxPage })));
const SupportPage = lazy(() => import('@/pages/SupportPage').then((m) => ({ default: m.SupportPage })));
const SupportConfigPage = lazy(() => import('@/pages/SupportConfigPage').then((m) => ({ default: m.SupportConfigPage })));
const SupportClientsPage = lazy(() => import('@/pages/SupportClientsPage').then((m) => ({ default: m.SupportClientsPage })));
const SupportDashboardPage = lazy(() => import('@/pages/SupportDashboardPage').then((m) => ({ default: m.SupportDashboardPage })));
const ContactsPage = lazy(() => import('@/pages/ContactsPage').then((m) => ({ default: m.ContactsPage })));
const KnowledgePage = lazy(() => import('@/pages/KnowledgePage').then((m) => ({ default: m.KnowledgePage })));
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const SellersPage = lazy(() => import('@/pages/SellersPage').then((m) => ({ default: m.SellersPage })));
const CampaignsPage = lazy(() => import('@/pages/CampaignsPage').then((m) => ({ default: m.CampaignsPage })));
const NumberHealthPage = lazy(() => import('@/pages/NumberHealthPage').then((m) => ({ default: m.NumberHealthPage })));
const CliquesPage = lazy(() => import('@/pages/CliquesPage').then((m) => ({ default: m.CliquesPage })));
const SiteAudiencePage = lazy(() => import('@/pages/SiteAudiencePage').then((m) => ({ default: m.SiteAudiencePage })));
const MarketsPage = lazy(() => import('@/pages/MarketsPage').then((m) => ({ default: m.MarketsPage })));
const MessageTemplatesPage = lazy(() => import('@/pages/MessageTemplatesPage').then((m) => ({ default: m.MessageTemplatesPage })));
const LeadBatchesPage = lazy(() => import('@/pages/LeadBatchesPage').then((m) => ({ default: m.LeadBatchesPage })));
const SdrWorkbenchPage = lazy(() => import('@/pages/SdrWorkbenchPage').then((m) => ({ default: m.SdrWorkbenchPage })));
const CloserTodayPage = lazy(() => import('@/pages/CloserTodayPage').then((m) => ({ default: m.CloserTodayPage })));
const SalesScriptPage = lazy(() => import('@/pages/SalesScriptPage').then((m) => ({ default: m.SalesScriptPage })));
const TelemarketingReportPage = lazy(() => import('@/pages/TelemarketingReportPage').then((m) => ({ default: m.TelemarketingReportPage })));
const AbuseGuardPage = lazy(() => import('@/pages/AbuseGuardPage').then((m) => ({ default: m.AbuseGuardPage })));
const UsersPage = lazy(() => import('@/pages/UsersPage').then((m) => ({ default: m.UsersPage })));
const PlaybookPage = lazy(() => import('@/pages/PlaybookPage').then((m) => ({ default: m.PlaybookPage })));
const EmailChannelSettingsPage = lazy(() => import('@/pages/EmailChannelSettingsPage').then((m) => ({ default: m.EmailChannelSettingsPage })));
const SupportEmailSettingsPage = lazy(() => import('@/pages/SupportEmailSettingsPage').then((m) => ({ default: m.SupportEmailSettingsPage })));
const MonitorConfigPage = lazy(() => import('@/pages/MonitorConfigPage').then((m) => ({ default: m.MonitorConfigPage })));
const OpportunitiesPage = lazy(() => import('@/pages/OpportunitiesPage').then((m) => ({ default: m.OpportunitiesPage })));
const PartnersPage = lazy(() => import('@/pages/PartnersPage').then((m) => ({ default: m.PartnersPage })));
const SalesQueuePage = lazy(() => import('@/pages/SalesQueuePage').then((m) => ({ default: m.SalesQueuePage })));
const DevTokensPage = lazy(() => import('@/pages/DevTokensPage').then((m) => ({ default: m.DevTokensPage })));
const AdminCockpitPage = lazy(() => import('@/pages/AdminCockpitPage').then((m) => ({ default: m.AdminCockpitPage })));
const SdrCockpitPage = lazy(() => import('@/pages/SdrCockpitPage').then((m) => ({ default: m.SdrCockpitPage })));
const CloserCockpitPage = lazy(() => import('@/pages/CloserCockpitPage').then((m) => ({ default: m.CloserCockpitPage })));
// Portal do cliente — área pública e independente (auth própria, fora do Layout interno).
const PortalPage = lazy(() => import('@/pages/portal/PortalPage').then((m) => ({ default: m.PortalPage })));

function PageFallback() {
  return <div className="flex h-full items-center justify-center text-base-content/40">Carregando...</div>;
}

// Atalho: rota protegida por permissão (admin passa sempre).
function Perm({ perm, children }: { perm: string | string[]; children: ReactElement }) {
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
                {/* Destino do link de "Esqueceu a senha?" — publica, sem auth */}
                <Route path="/redefinir-senha" element={<Suspense fallback={<PageFallback />}><ResetPasswordPage /></Suspense>} />
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
                    <Route path="/support/dashboard" element={<Perm perm="dashboard"><SupportDashboardPage /></Perm>} />
                    <Route path="/support/config" element={<Perm perm="ai_control"><SupportConfigPage /></Perm>} />
                    <Route path="/support/clients" element={<Perm perm="inbox"><SupportClientsPage /></Perm>} />
                    <Route path="/contacts" element={<Perm perm="contacts"><ContactsPage /></Perm>} />
                    <Route path="/contacts/abuse" element={<Perm perm="contacts"><AbuseGuardPage /></Perm>} />
                    <Route path="/knowledge" element={<Perm perm="knowledge"><KnowledgePage /></Perm>} />
                    <Route path="/opportunities" element={<Perm perm="opportunities"><OpportunitiesPage /></Perm>} />
                    <Route path="/partners" element={<Perm perm="partners"><PartnersPage /></Perm>} />
                    <Route path="/fila" element={<Perm perm="opportunities"><SalesQueuePage /></Perm>} />
                    <Route path="/sellers" element={<Perm perm="sellers"><SellersPage /></Perm>} />
                    <Route path="/campaigns" element={<Perm perm="campaigns"><CampaignsPage /></Perm>} />
                    <Route path="/sender/health" element={<Perm perm="campaigns"><NumberHealthPage /></Perm>} />
                    <Route path="/site/cliques" element={<Perm perm="campaigns"><CliquesPage /></Perm>} />
                    <Route path="/site/audiencia" element={<Perm perm="campaigns"><SiteAudiencePage /></Perm>} />
                    {/* Liberar mercado muda o que o vendedor enxerga — fica atrás de settings, não de campaigns. */}
                    <Route path="/markets" element={<Perm perm="settings"><MarketsPage /></Perm>} />
                    <Route path="/messages" element={<Perm perm="campaigns"><MessageTemplatesPage /></Perm>} />
                    {/* Importar lista cria contatos e oportunidades — perm própria, não `campaigns`. */}
                    <Route path="/lead-batches" element={<Perm perm="lead_batches"><LeadBatchesPage /></Perm>} />
                    <Route path="/sdr" element={<Perm perm="telemarketing"><SdrWorkbenchPage /></Perm>} />
                    <Route path="/closer" element={<Perm perm="telemarketing"><CloserTodayPage /></Perm>} />
                    {/* Escrever roteiro é `settings`: o SDR lê na mesa dele, não edita. */}
                    <Route path="/roteiro" element={<Perm perm="settings"><SalesScriptPage /></Perm>} />
                    {/* `metrics` e não uma perm nova: quem vê número da operação já tem essa. */}
                    <Route path="/vendas/relatorio" element={<Perm perm="metrics"><TelemarketingReportPage /></Perm>} />
                    <Route path="/users" element={<Perm perm="users"><UsersPage /></Perm>} />
                    <Route path="/playbook" element={<Perm perm="ai_control"><PlaybookPage /></Perm>} />
                    <Route path="/settings/email-channel" element={<Perm perm="admin"><EmailChannelSettingsPage /></Perm>} />
                    <Route path="/settings/support-email" element={<Perm perm="admin"><SupportEmailSettingsPage /></Perm>} />
                    <Route path="/settings/monitor" element={<Perm perm="admin"><MonitorConfigPage /></Perm>} />
                    {/* Cockpits: a rota exige QUALQUER uma das permissões das abas — quem
                        pode ver uma aba entra e vê só aquela. Exigir `admin` escondia o
                        painel de quem tinha acesso legítimo a parte dele. */}
                    <Route
                      path="/admin-cockpit"
                      element={
                        <Perm perm={['settings', 'lead_batches', 'campaigns', 'ai_control', 'sellers', 'contacts']}>
                          <AdminCockpitPage />
                        </Perm>
                      }
                    />
                    <Route path="/sdr-cockpit" element={<Perm perm={['sdr', 'opportunities']}><SdrCockpitPage /></Perm>} />
                    <Route path="/closer-cockpit" element={<Perm perm={['closer', 'opportunities', 'metrics']}><CloserCockpitPage /></Perm>} />
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
    <Toaster position="bottom-right" richColors closeButton />
    </QueryClientProvider>
  );
}
