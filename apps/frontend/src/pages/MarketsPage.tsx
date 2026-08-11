import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, PageContainer, PageHeader, Breadcrumb, Icon, StatusBadge } from '@/shared/ui';
import { useToast } from '@/app/providers/ToastContext';
import { useConfirm } from '@/app/providers/ConfirmContext';
import {
  listMarkets,
  releaseMarket,
  pauseMarket,
  getMarketSellers,
  linkMarketSeller,
  unlinkMarketSeller,
  type Market,
  type MarketPendencia,
  type MarketSellers,
} from '@/entities/market';

/**
 * Mercados (ADR 037).
 *
 * Um mercado é a caixa com tudo necessário para vender uma coisa, de um cliente:
 * marca do e-mail, o que a Lia pode afirmar, como ela fala, as mensagens e quem
 * atende. HiperTMS é uma caixa; um parceiro é outra.
 *
 * A tela existe para uma pergunta só: **este mercado pode ir para a rua?** Por isso
 * o que ela mostra em primeiro lugar não é o cadastro, é o que está FALTANDO.
 */

const ROTULO_STATUS: Record<string, { texto: string; tom: 'success' | 'warning' | 'neutral' }> = {
  active: { texto: 'Liberado', tom: 'success' },
  draft: { texto: 'Rascunho', tom: 'warning' },
  paused: { texto: 'Suspenso', tom: 'neutral' },
};

/** Iniciais para o quadradinho — dá identidade sem exigir upload de logo. */
function iniciais(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

const ICONE_PENDENCIA: Record<MarketPendencia['campo'], string> = {
  identidade: 'building',
  conhecimento: 'knowledge',
  modelos: 'mail',
  vendedores: 'sellers',
};

function LinhaPendencia({ p }: { p: MarketPendencia }) {
  // Bloqueio em vermelho, aviso em âmbar. A diferença importa: número sem fonte
  // não impede o mercado de existir, mas quem libera precisa saber que está lá.
  const cor = p.bloqueia ? 'text-red-500' : 'text-amber-500';
  return (
    <div className="flex items-start gap-2 py-1">
      <Icon name={(ICONE_PENDENCIA[p.campo] ?? 'alert') as any} className={`mt-0.5 h-4 w-4 shrink-0 ${cor}`} />
      <span className={`text-xs ${p.bloqueia ? 'text-base-content/70' : 'text-base-content/50'}`}>{p.motivo}</span>
    </div>
  );
}

/**
 * Quem trabalha este mercado (`seller_markets`).
 *
 * É o vínculo que a transferência do SDR exige: closer sem vínculo é recusado pelo
 * backend. Antes desta seção, montar a operação pedia INSERT na mão no banco.
 *
 * Fica dentro do painel expandido do mercado de propósito — é configuração de quem
 * monta a operação, na mesma gaveta das outras pendências dele.
 */
function VendedoresDoMercado({ code }: { code: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [escolhido, setEscolhido] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['markets', code, 'sellers'],
    queryFn: () => getMarketSellers(code),
  });

  // As duas mutações devolvem a lista nova, então o cache é escrito direto: refetch
  // aqui piscaria a seção inteira a cada clique.
  function aplicar(novo: MarketSellers) {
    qc.setQueryData(['markets', code, 'sellers'], novo);
    setEscolhido('');
  }

  const vincular = useMutation({
    mutationFn: (sellerId: string) => linkMarketSeller(code, sellerId),
    onSuccess: (novo) => {
      aplicar(novo);
      toast.success('Vendedor vinculado — já pode receber lead deste mercado.');
    },
    onError: () => toast.error('Não foi possível vincular.'),
  });

  const desvincular = useMutation({
    mutationFn: (sellerId: string) => unlinkMarketSeller(code, sellerId),
    onSuccess: (novo) => {
      aplicar(novo);
      // Diz o que NÃO aconteceu: sem isso o operador teme ter tirado lead da mão de
      // alguém no meio de uma negociação.
      toast.info('Desvinculado. Não recebe mais lead novo; o que está na mão dele fica.');
    },
    onError: () => toast.error('Não foi possível desvincular.'),
  });

  if (isLoading) {
    return <p className="py-2 text-xs text-base-content/40">Carregando vendedores…</p>;
  }

  const vinculados = data?.vinculados ?? [];
  const disponiveis = data?.disponiveis ?? [];

  return (
    <div className="mt-2 border-t border-base-200 pt-2">
      <p className="mb-1.5 text-xs font-medium text-base-content/70">
        Quem trabalha este mercado
      </p>

      {vinculados.length === 0 && (
        <p className="mb-2 text-xs text-amber-700">
          Ninguém vinculado — o SDR não consegue passar lead deste mercado pra ninguém.
        </p>
      )}

      <ul className="mb-2 flex flex-col gap-1">
        {vinculados.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
            <span>
              {s.name}
              {s.email && <span className="ml-1.5 text-base-content/40">{s.email}</span>}
            </span>
            <button
              type="button"
              className="text-base-content/40 underline hover:text-base-content/70"
              disabled={desvincular.isPending}
              onClick={() => desvincular.mutate(s.id)}
            >
              tirar
            </button>
          </li>
        ))}
      </ul>

      {disponiveis.length > 0 ? (
        <div className="flex items-center gap-2">
          <select
            value={escolhido}
            onChange={(e) => setEscolhido(e.target.value)}
            className="h-8 rounded-md border border-base-300 bg-white px-2 text-xs text-base-content outline-none focus:border-brand-500"
          >
            <option value="">Adicionar vendedor…</option>
            {disponiveis.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <Button
            size="xs"
            variant="outline"
            disabled={!escolhido}
            loading={vincular.isPending}
            onClick={() => vincular.mutate(escolhido)}
          >
            Vincular
          </Button>
        </div>
      ) : (
        vinculados.length > 0 && (
          <p className="text-xs text-base-content/40">
            Todos os vendedores ativos já trabalham este mercado.
          </p>
        )
      )}
    </div>
  );
}

export function MarketsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [aberto, setAberto] = useState<string | null>(null);

  const { data: mercados = [], isLoading } = useQuery({
    queryKey: ['markets'],
    queryFn: () => listMarkets(false),
  });

  const liberar = useMutation({
    mutationFn: (code: string) => releaseMarket(code),
    onSuccess: (m) => {
      toast.success(`${m.name} liberado — já aparece no Disparo.`);
      void qc.invalidateQueries({ queryKey: ['markets'] });
    },
    // O servidor devolve QUAIS pendências bloquearam. Mostrar isso vale mais que
    // um "não foi possível" — a tela pode estar desatualizada em relação ao banco.
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Não foi possível liberar este mercado.'),
  });

  const suspender = useMutation({
    mutationFn: (code: string) => pauseMarket(code),
    onSuccess: (m) => {
      toast.info(`${m.name} suspenso — sumiu do Disparo.`);
      void qc.invalidateQueries({ queryKey: ['markets'] });
    },
    onError: () => toast.error('Não foi possível suspender.'),
  });

  async function pedirSuspensao(m: Market) {
    const ok = await confirm({
      title: `Suspender ${m.name}?`,
      message:
        'O mercado some do Disparo na hora e o vendedor deixa de poder criar campanha nele. ' +
        'Campanhas já em andamento continuam. Dá para liberar de novo depois.',
      confirmLabel: 'Suspender',
      variant: 'warning',
    });
    if (ok) suspender.mutate(m.code);
  }

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: 'Vendas' }, { label: 'Mercados' }]} />
      <PageHeader
        title="Mercados"
        subtitle="Cada mercado é um cliente ou produto que o Nexa prospecta. O vendedor só enxerga os liberados."
      />

      {isLoading && <p className="text-sm text-base-content/50">Carregando mercados…</p>}

      {!isLoading && mercados.length === 0 && (
        <Card>
          <p className="text-sm text-base-content/60">
            Nenhum mercado cadastrado ainda.
          </p>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {mercados.map((m) => {
          const st = ROTULO_STATUS[m.status] ?? { texto: m.status, tom: 'neutral' as const };
          const pend = m.readiness?.pendencias ?? [];
          const bloqueios = pend.filter((p) => p.bloqueia);
          const expandido = aberto === m.code;

          return (
            <Card key={m.id} className="p-0">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-base-200 text-xs font-medium text-base-content/70">
                  {iniciais(m.displayName || m.name)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-base-content">
                    {m.displayName || m.name}
                  </div>
                  <div className="truncate text-xs text-base-content/50">
                    {m.code}
                    {m.releasedAt && ` · no ar desde ${new Date(m.releasedAt).toLocaleDateString('pt-BR')}`}
                  </div>
                </div>

                <StatusBadge tone={st.tom}>{st.texto}</StatusBadge>

                {/* Só existe botão quando ele faz algo. Um "Liberar" cinza em mercado
                    já liberado é ruído. */}
                {m.status !== 'active' && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!m.readiness?.pronto || liberar.isPending}
                    onClick={() => liberar.mutate(m.code)}
                  >
                    <Icon name="check" className="h-4 w-4" /> Liberar
                  </Button>
                )}
                {m.status === 'active' && (
                  <Button size="sm" variant="ghost" onClick={() => void pedirSuspensao(m)}>
                    Suspender
                  </Button>
                )}
                <button
                  type="button"
                  aria-label={expandido ? 'Recolher pendências' : 'Ver pendências'}
                  className="rounded-lg p-1 text-base-content/40 hover:bg-base-100"
                  onClick={() => setAberto(expandido ? null : m.code)}
                >
                  <Icon name="chevronDown" className={`h-4 w-4 transition-transform ${expandido ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {/* O motivo fica ao lado do botão desabilitado, não escondido num
                  tooltip: quem clica precisa saber o que preencher. */}
              {bloqueios.length > 0 && !expandido && (
                <div className="border-t border-base-200 px-4 py-2">
                  <LinhaPendencia p={bloqueios[0]} />
                  {bloqueios.length > 1 && (
                    <button
                      type="button"
                      className="ml-6 text-xs text-base-content/40 underline"
                      onClick={() => setAberto(m.code)}
                    >
                      e mais {bloqueios.length - 1}
                    </button>
                  )}
                </div>
              )}

              {expandido && (
                <div className="border-t border-base-200 px-4 py-2">
                  {pend.length === 0 ? (
                    <p className="py-1 text-xs text-base-content/50">
                      Nada pendente — este mercado está completo.
                    </p>
                  ) : (
                    pend.map((p, i) => <LinhaPendencia key={`${p.campo}-${i}`} p={p} />)
                  )}
                  <VendedoresDoMercado code={m.code} />
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </PageContainer>
  );
}
