import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, PageContainer, PageHeader, Breadcrumb, Icon, StatusBadge } from '@/shared/ui';
import { useToast } from '@/app/providers/ToastContext';
import { useConfirm } from '@/app/providers/ConfirmContext';
import { listMarkets, releaseMarket, pauseMarket, type Market, type MarketPendencia } from '@/entities/market';

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
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </PageContainer>
  );
}
