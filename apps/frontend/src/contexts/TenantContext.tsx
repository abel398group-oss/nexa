import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { getActingTenantId, setActingTenantId } from '@/lib/actingTenant';
import { setDestructiveConfirmHandler } from '@/lib/destructiveConfirm';

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
      .then((r) => setTenants(r.data))
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
          <span>⚠ Operando como {actingTenant?.name ?? actingTenantId}</span>
        </div>
      )}
    </Ctx.Provider>
  );
}

// Drop-in para a topbar: dropdown de cliente (so aparece para o platform admin).
export function TenantSelector() {
  const { isPlatformAdmin, tenants, actingTenantId, selectTenant } = useTenant();
  if (!isPlatformAdmin) return null;
  return (
    <select
      value={actingTenantId ?? ''}
      onChange={(e) => e.target.value && selectTenant(e.target.value)}
      title="Cliente ativo"
      className="h-8 rounded-md border border-base-300 bg-white px-2 text-xs font-medium text-base-content"
    >
      <option value="" disabled>
        Selecione um cliente
      </option>
      {tenants.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}

// Gate de tela cheia: platform admin sem cliente selecionado escolhe um para comecar.
export function TenantGate({ children }: { children: ReactNode }) {
  const { needsSelection, tenants, loading, selectTenant } = useTenant();
  if (!needsSelection) return <>{children}</>;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-base-100 p-8 text-center">
      <div className="text-3xl">🏢</div>
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
