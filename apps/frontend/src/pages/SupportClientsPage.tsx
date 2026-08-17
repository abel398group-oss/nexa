import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { identidadeVisivel, isSupportTicket } from '@/shared/lib/conversation';
import { Icon } from '@/shared/ui';
import { listConversations, listSupportClients } from '@/entities/conversation';
import { StandardListPage } from '@/components/shared/StandardListPage';

interface Client {
  key: string;
  name: string | null;
  phone: string;
  /** Canal do chamado — o que aparece quando não existe telefone. */
  channel: string | null;
  tickets: number;
  open: number;
  lastAt: number;
}

/** Ver `identidadeVisivel`: só sai número quando existe número; senão, o canal. */
const subtitulo = (c: Client) => identidadeVisivel(c.phone, c.channel);

function fmt(ts: number): string {
  if (!ts) return '--';
  return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const PAGE_SIZE = 20;

/**
 * Clients (support) -- list of contacts that opened support tickets, grouped by
 * contact. Read-only; reuses GET /conversations and isSupportTicket helper.
 */
/**
 * Teto de chamados lidos para montar a lista. Ver o comentário do useQuery.
 */
const LIMITE_CHAMADOS = 500;

export function SupportClientsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  /**
   * `scope: 'support'` e o limite explícito são o conserto de 13/08/2026.
   *
   * A chamada era `listConversations()` pelada: o servidor devolvia as 50
   * conversas mais RECENTES do tenant — vendas e suporte misturadas — e a tela
   * peneirava os chamados de suporte aqui no cliente. Ou seja, o corte da página
   * decidia a resposta, não os dados.
   *
   * Medido no HiperTMS, que tem 3 clientes de suporte no banco: baixando 5
   * conversas a tela mostrava 1 cliente; baixando 3, mostrava ZERO. E seguia
   * anunciando "Mostrando 0 de 0 cliente(s)" e os dois cards como se fosse o
   * total. Bastava o tenant passar de 50 conversas com as mais recentes sendo de
   * vendas — o que acontece em dias — para um cliente com chamado ABERTO sumir
   * da tela sem deixar rastro.
   *
   * É o mesmo erro que a Etapa 2B já tinha corrigido no Inbox, e cuja nota diz:
   * número errado com cara de número certo é pior do que não mostrar nada. Esta
   * tela nasceu depois e repetiu.
   *
   * Agora o servidor filtra o canal (só chamado entra na página) e o `total` dele
   * é comparado com o que chegou — se ainda assim cortar, a tela AVISA em vez de
   * afirmar um número que não é o total.
   */
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['support-clients', LIMITE_CHAMADOS],
    queryFn: () => listConversations({ scope: 'support', limit: LIMITE_CHAMADOS }),
  });
  const convs = data?.items ?? [];
  const totalChamadosNoServidor = data?.total ?? convs.length;
  const listaCortada = totalChamadosNoServidor > convs.length;

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
        map.set(key, {
          key,
          name: c.contact?.name ?? null,
          phone: c.phone,
          channel: c.sourceChannel ?? null,
          tickets: 1,
          open: isOpen ? 1 : 0,
          lastAt: at,
        });
      }
    }
    return [...map.values()].sort((a, b) => b.lastAt - a.lastAt);
  }, [convs]);

  // Client-side search by name or phone.
  const filtered = useMemo<Client[]>(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    const digits = q.replace(/\D/g, '');
    return clients.filter(
      (c) =>
        (c.name ?? '').toLowerCase().includes(q) ||
        (digits.length > 0 && c.phone.replace(/\D/g, '').includes(digits)),
    );
  }, [clients, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const totalOpen = clients.reduce((a, c) => a + c.open, 0);

  /**
   * A base de clientes do TMS, para a tela parar de dizer que "Clientes" são os que
   * abriram chamado. Consulta separada de propósito: ela lê OUTRO banco (o do HiperTMS),
   * e falha dela não pode derrubar a lista de chamados que já funciona.
   *
   * Não é usada para montar a lista abaixo, e isso não é preguiça: a conversa de suporte
   * guarda o id da PESSOA que abriu o chamado, e esta base é de EMPRESAS. Cruzar as duas
   * exige confirmar que aquele id é de `tenant_core_user` e subir dele para a empresa —
   * e afirmar isso sem verificar poria dado errado numa tela de atendimento.
   */
  const { data: baseTms } = useQuery({
    queryKey: ['support-clients-tms'],
    queryFn: () => listSupportClients(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const totalNoTms = baseTms && !baseTms.falhou ? baseTms.clientes.length : null;
  const ativosNoTms =
    baseTms && !baseTms.falhou && baseTms.filtrouCancelados
      ? baseTms.clientes.filter((c) => c.ativo).length
      : null;

  return (
    <StandardListPage
      title="Clientes"
      breadcrumb={[{ label: 'Início', path: '/dashboard' }, { label: 'Suporte' }, { label: 'Clientes' }]}
      // A descrição diz o que a lista É. Chamar isto de "base de clientes" fazia quem
      // olhava achar que cliente que nunca reclamou não existe.
      description="Quem já abriu chamado de suporte, agrupado por contato — não é a base completa de clientes. Abra o atendimento no Inbox de Suporte."
      isLoading={isLoading}
      hasData={clients.length > 0}
      error={isError ? error : undefined}
      onRetry={() => refetch()}
      totalItems={filtered.length}
      totalShowing={pageItems.length}
      entityName="cliente(s)"
      searchValue={search}
      onSearchChange={(v) => {
        setSearch(v);
        setPage(1);
      }}
      searchPlaceholder="Buscar por nome ou telefone..."
      pagination={
        pageCount > 1
          ? { page: safePage, pageCount, onPageChange: setPage }
          : undefined
      }
      headerActions={
        <Link
          to="/support"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-base-300 bg-base-100 px-4 text-sm font-medium text-base-content shadow-sm transition-colors hover:bg-base-200"
        >
          <Icon name="support" className="h-4 w-4" /> Inbox de Suporte
        </Link>
      }
      topContent={
        <>
          {/* Se ainda assim a página cortar, o número dos cards deixa de ser o
              total — e dizer isso é obrigatório. Silenciar aqui seria repetir
              exatamente o bug que esta tela tinha. */}
          {listaCortada && (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              Lendo {convs.length} de {totalChamadosNoServidor} chamados — os números abaixo cobrem
              só os mais recentes. Use a busca para achar um cliente específico.
            </div>
          )}
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
            {/* Dois cartões, não um: "quantos clientes existem" e "quantos falaram com o
                suporte" são perguntas diferentes, e mostrar só a segunda com o rótulo
                "Clientes" era o que fazia a tela parecer a base inteira. */}
            {totalNoTms !== null && (
              <div className="card p-4">
                <div className="text-[11px] font-medium uppercase tracking-wide text-base-content/50">Clientes no TMS</div>
                <div className="mt-0.5 text-2xl font-bold text-base-content">
                  {ativosNoTms ?? totalNoTms}
                </div>
                <div className="mt-0.5 text-xs text-base-content/40">
                  {ativosNoTms !== null ? `ativos · ${totalNoTms} no total` : 'sem filtro de cancelados'}
                </div>
              </div>
            )}
            <div className="card p-4">
              <div className="text-[11px] font-medium uppercase tracking-wide text-base-content/50">Abriram chamado</div>
              <div className="mt-0.5 text-2xl font-bold text-base-content">{clients.length}</div>
              <div className="mt-0.5 text-xs text-base-content/40">
                {listaCortada ? 'nos chamados mais recentes' : 'com chamados de suporte'}
              </div>
            </div>
            <div className="card p-4">
              <div className="text-[11px] font-medium uppercase tracking-wide text-base-content/50">Chamados abertos</div>
              <div className="mt-0.5 text-2xl font-bold text-base-content">{totalOpen}</div>
              <div className="mt-0.5 text-xs text-base-content/40">
                {listaCortada ? 'nos chamados lidos' : 'não fechados'}
              </div>
            </div>
          </div>
        </>
      }
    >
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-base-content/40">
          <Icon name="support" className="h-9 w-9" />
          <p className="text-sm">
            {search.trim()
              ? 'Nenhum cliente encontrado para essa busca.'
              : 'Nenhum cliente com chamado de suporte.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2 p-4">
          {pageItems.map((c) => (
            <div key={c.key} className="flex items-center justify-between rounded-xl border border-base-200 bg-[var(--surface)] p-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-xs font-semibold text-brand-600">
                  {(c.name
                    ? c.name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('')
                    : subtitulo(c).slice(0, 2) || '?'
                  ).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-medium text-base-content">
                    {c.name || subtitulo(c) || 'Cliente sem nome'}
                  </div>
                  {c.name && subtitulo(c) && (
                    <div className="truncate text-[11px] text-base-content/50">{subtitulo(c)}</div>
                  )}
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
            </div>
          ))}
        </div>
      )}
    </StandardListPage>
  );
}
