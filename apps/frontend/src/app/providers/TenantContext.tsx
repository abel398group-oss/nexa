import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from '@/shared/lib/api';
import { useAuth } from '@/app/providers/AuthContext';
import { useConfirm } from '@/app/providers/ConfirmContext';
import { getActingTenantId, setActingTenantId } from '@/shared/lib/actingTenant';
import { setDestructiveConfirmHandler } from '@/shared/lib/destructiveConfirm';
import { Popover } from '@/components/ui/Popover';
import { Icon } from '@/components/ui/icons';
import { cn } from '@/shared/lib/cn';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: string;
}

interface TenantCtx {
  isPlatformAdmin: boolean;
  tenants: Tenant[];
  actingTenantId: string | null;
  actingTenant: Tenant | null;
  loading: boolean;
  needsSelection: boolean;
  selectTenant: (id: string) => Promise<void>;
}

const Ctx = createContext<TenantCtx>(null as any);
export const useTenant = () => useContext(Ctx);

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const isPlatformAdmin = !!user && (user.tenantId === null || user.tenantId === undefined);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [actingTenantId, setActingId] = useState<string | null>(getActingTenantId());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isPlatformAdmin) {
      setTenants([]);
      return;
    }
    setLoading(true);
    api
      .get('/admin/tenants')
      .then((r) => {
        setTenants(r.data);
        // auto-cura: se o cliente salvo não está mais na lista (id defasado/inativo), limpa
        const stored = getActingTenantId();
        if (stored && !r.data.some((t: Tenant) => t.id === stored)) {
          setActingTenantId(null);
          setActingId(null);
        }
      })
      .catch(() => setTenants([]))
      .finally(() => setLoading(false));
  }, [isPlatformAdmin]);

  // Liga o confirm "bonito" do app a quebra de vidro (usada pelo interceptor do axios).
  useEffect(() => {
    setDestructiveConfirmHandler((message) =>
      confirm({
        title: 'Acao irreversivel em modo cliente',
        message,
        variant: 'danger',
        confirmLabel: 'Executar mesmo assim',
      }),
    );
    return () => setDestructiveConfirmHandler(null);
  }, [confirm]);

  async function selectTenant(id: string) {
    try {
      await api.post(`/admin/tenants/${id}/enter`);
    } catch {
      /* ignore */
    }
    setActingTenantId(id);
    setActingId(id);
    window.location.reload();
  }

  const actingTenant = tenants.find((t) => t.id === actingTenantId) ?? null;
  const needsSelection = isPlatformAdmin && !actingTenantId;

  return (
    <Ctx.Provider
      value={{ isPlatformAdmin, tenants, actingTenantId, actingTenant, loading, needsSelection, selectTenant }}
    >
      {children}
      {isPlatformAdmin && actingTenantId && (
        <div
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-lg"
          title="Voce esta operando na conta de um cliente. Alteracoes afetam este cliente."
        >
          <Icon name="alert" className="h-3.5 w-3.5" />
          <span>Operando como {actingTenant?.name ?? actingTenantId}</span>
        </div>
      )}
    </Ctx.Provider>
  );
}

// Drop-in para a topbar: seletor de cliente no estilo do TMS (logo + nome + chevron).
// Reaproveita 100% do estado do TenantContext (tenants / actingTenantId / selectTenant).
// So aparece para o platform admin.
export function TenantSelector() {
  const { isPlatformAdmin, tenants, actingTenantId, actingTenant, selectTenant } = useTenant();
  if (!isPlatformAdmin) return null;

  const currentName = actingTenant?.name ?? null;
  const initial = (currentName ?? '?').charAt(0).toUpperCase();

  return (
    <Popover
      align="start"
      trigger={
        <button
          type="button"
          title="Cliente ativo"
          className="flex h-9 items-center gap-2 rounded-lg border border-base-300 bg-[var(--surface)] px-2.5 text-sm font-medium text-base-content transition-colors hover:bg-base-200"
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-brand-500 text-xs font-bold text-white">
            {initial}
          </span>
          <span className="max-w-[10rem] truncate">{currentName ?? 'Selecione um cliente'}</span>
          <svg viewBox="0 0 20 20" className="size-4 shrink-0 text-base-content/40" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      }
    >
      {(close) => (
        <div className="max-h-72 w-56 overflow-auto">
          <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-base-content/40">
            Clientes
          </p>
          {tenants.length === 0 && (
            <p className="px-2.5 py-2 text-xs text-base-content/40">Nenhum cliente.</p>
          )}
          {tenants.map((t) => {
            const active = t.id === actingTenantId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  close();
                  if (!active) selectTenant(t.id);
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-base-200',
                  active ? 'text-brand-600' : 'text-base-content',
                )}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-base-200 text-xs font-bold text-base-content/70">
                  {t.name.charAt(0).toUpperCase()}
                </span>
                <span className="flex-1 truncate">{t.name}</span>
                {active && (
                  <svg viewBox="0 0 20 20" className="size-4 shrink-0 text-brand-500" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 10l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </Popover>
  );
}

// Gate de tela cheia: platform admin sem cliente selecionado escolhe um para comecar.
export function TenantGate({ children }: { children: ReactNode }) {
  const { needsSelection, tenants, loading, selectTenant } = useTenant();
  if (!needsSelection) return <>{children}</>;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-base-100 p-8 text-center">
      <Icon name="building" className="h-8 w-8 text-base-content/40" />
      <h1 className="text-lg font-bold text-base-content">Selecione um cliente</h1>
      <p className="max-w-sm text-sm text-base-content/50">
        Voce e admin da plataforma. Escolha o cliente que deseja visualizar para comecar.
      </p>
      {loading ? (
        <p className="text-sm text-base-content/40">Carregando clientes...</p>
      ) : tenants.length === 0 ? (
        <p className="text-sm text-base-content/40">Nenhum cliente cadastrado.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {tenants.map((t) => (
            <button
              key={t.id}
              onClick={() => selectTenant(t.id)}
              className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white hover:bg-brand-600"
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
