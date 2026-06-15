import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { displayPhone } from '@/lib/phone';
import { isSupportTicket } from '@/lib/conversation';
import { Card, PageContainer, PageHeader, Breadcrumb, Icon, SkeletonList, EmptyState } from '@/shared/ui';

interface Conv {
  id: string;
  phone: string;
  status: string;
  lastActivityAt?: string | null;
  customerStage?: string | null;
  ticketCategory?: string | null;
  ticketPriority?: string | null;
  contact?: { id?: string; name?: string | null } | null;
}

interface Client {
  key: string;
  name: string | null;
  phone: string;
  tickets: number;
  open: number;
  lastAt: number;
}

function fmt(ts: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * Clientes (sob Suporte) — lista de quem tem chamado de atendimento, agrupado por
 * contato. Leitura apenas; reaproveita GET /conversations e o helper isSupportTicket
 * (mesma regra do Inbox de Suporte).
 */
export function SupportClientsPage() {
  const { data: convs = [], isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get('/conversations').then((r) => r.data.items as Conv[]),
  });

  const clients = useMemo<Client[]>(() => {
    const tickets = convs.filter(isSupportTicket);
    const map = new Map<string, Client>();
    for (const c of tickets) {
      const key = c.contact?.id ?? c.phone;
      const at = c.lastActivityAt ? new Date(c.lastActivityAt).getTime() : 0;
      const isOpen = c.status !== 'closed' && c.status !== 'opt_out';
      const g = map.get(key);
      if (g) {
        g.tickets++;
        if (isOpen) g.open++;
        if (at > g.lastAt) g.lastAt = at;
      } else {
        map.set(key, { key, name: c.contact?.name ?? null, phone: c.phone, tickets: 1, open: isOpen ? 1 : 0, lastAt: at });
      }
    }
    return [...map.values()].sort((a, b) => b.lastAt - a.lastAt);
  }, [convs]);

  const totalOpen = clients.reduce((a, c) => a + c.open, 0);

  return (
    <PageContainer>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Início', to: '/dashboard' }, { label: 'Suporte' }, { label: 'Clientes' }]} />}
        title="Clientes"
        subtitle="Quem já abriu chamado de suporte, agrupado por contato. Abra o atendimento no Inbox de Suporte."
        actions={
          <Link
            to="/support"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-base-300 bg-base-100 px-4 text-sm font-medium text-base-content shadow-sm transition-colors hover:bg-base-200"
          >
            <Icon name="support" className="h-4 w-4" /> Inbox de Suporte
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-base-content/50">Clientes</div>
          <div className="mt-0.5 text-2xl font-bold text-base-content">{clients.length}</div>
          <div className="mt-0.5 text-xs text-base-content/40">com chamados de suporte</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-base-content/50">Chamados abertos</div>
          <div className="mt-0.5 text-2xl font-bold text-base-content">{totalOpen}</div>
          <div className="mt-0.5 text-xs text-base-content/40">não fechados</div>
        </Card>
      </div>

      {isLoading ? (
        <SkeletonList rows={5} />
      ) : clients.length === 0 ? (
        <EmptyState
          icon={<Icon name="support" className="h-9 w-9" />}
          title="Nenhum cliente com chamado"
          description="Quando um cliente abrir um chamado de suporte, ele aparece aqui."
        />
      ) : (
        <div className="space-y-2">
          {clients.map((c) => (
            <Card key={c.key} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-xs font-semibold text-brand-600">
                  {(c.name ? c.name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('') : displayPhone(c.phone).slice(0, 2)).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-medium text-base-content">{c.name || displayPhone(c.phone)}</div>
                  {c.name && <div className="truncate text-[11px] text-base-content/50">{displayPhone(c.phone)}</div>}
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="text-right">
                  <div className="font-medium text-base-content">{c.tickets} chamado(s)</div>
                  <div className="text-base-content/40">{c.open} aberto(s)</div>
                </div>
                <div className="hidden text-right text-base-content/50 sm:block">
                  <div className="text-[10px] uppercase tracking-wide text-base-content/40">Última atividade</div>
                  <div>{fmt(c.lastAt)}</div>
                </div>
                <Link to="/support" className="rounded-md border border-base-300 px-2.5 py-1 text-xs text-base-content/70 transition-colors hover:bg-base-100">
                  Abrir
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
