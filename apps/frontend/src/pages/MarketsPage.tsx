import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Input, PageContainer, PageHeader, Breadcrumb, Icon, StatusBadge } from '@/shared/ui';
import { useToast } from '@/app/providers/ToastContext';
import { useConfirm } from '@/app/providers/ConfirmContext';
import { CampoCor } from '@/components/CampoCor';
import { NewMarketModal } from '@/components/NewMarketModal';
import { MaterialDaCampanha } from '@/components/MaterialDaCampanha';
import {
  listMarkets,
  updateMarket,
  releaseMarket,
  pauseMarket,
  deleteMarket,
  getMarketSellers,
  linkMarketSeller,
  unlinkMarketSeller,
  type Market,
  type MarketPendencia,
  type MarketSellers,
  type MarketCounts,
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
/**
 * Identidade do mercado — a cara dele no e-mail que o lead recebe.
 *
 * Até 17/08/2026 estes campos não tinham tela. O `create` do backend dizia
 * "editável depois na configuração do mercado", essa configuração nunca foi
 * feita, e a trava de liberação exigia a identidade preenchida — o sistema
 * cobrava algo que ele mesmo não deixava fazer.
 *
 * O HiperTMS pagou: criado antes do `create` passar a semear os campos, ficou com
 * `displayName` e `senderName` NULL. E `email-market-identity.ts` faz
 * `if (!displayName) return {}` — o disparo saía SEM marca nenhuma: sem
 * assinatura, sem cor, sem link. Chegava, e chegava descaracterizado.
 *
 * Só grava no `submit`, não a cada tecla: `readiness` é recalculado no servidor a
 * cada gravação, e salvar por caractere faria a lista inteira piscar enquanto se
 * digita.
 */
function IdentidadeDoMercado({ market }: { market: Market }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    displayName: market.displayName ?? '',
    senderName: market.senderName ?? '',
    brandTagline: market.brandTagline ?? '',
    brandColor: market.brandColor ?? '',
    signupUrl: market.signupUrl ?? '',
  });

  const salvar = useMutation({
    mutationFn: () => updateMarket(market.code, form),
    onSuccess: () => {
      // A lista inteira volta do servidor: gravar identidade muda o `readiness`,
      // e a pendência tem que sumir na hora — senão a tela segue cobrando o que
      // acabou de ser preenchido.
      void qc.invalidateQueries({ queryKey: ['markets'] });
      toast.success('Identidade salva.');
    },
    onError: (e: any) => {
      const m = e?.response?.data?.message;
      toast.error(Array.isArray(m) ? m.join(', ') : m || 'Erro ao salvar a identidade.');
    },
  });

  const campo = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value })),
  });

  return (
    <form
      className="mt-3 border-t border-base-200 pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        salvar.mutate();
      }}
    >
      <p className="text-xs font-medium text-base-content">Identidade</p>
      <p className="mb-2 text-[11px] text-base-content/50">
        A cara deste mercado no e-mail que o lead recebe.
      </p>

      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block">
          <span className="text-[11px] text-base-content/60">Nome de exibição</span>
          <Input className="!h-8 text-xs" placeholder="HiperTMS" {...campo('displayName')} />
        </label>
        <label className="block">
          <span className="text-[11px] text-base-content/60">Remetente</span>
          <Input className="!h-8 text-xs" placeholder="Lia" {...campo('senderName')} />
        </label>
        <CampoCor valor={form.brandColor} aoMudar={(v) => setForm((f) => ({ ...f, brandColor: v }))} />
        <label className="block sm:col-span-2">
          <span className="text-[11px] text-base-content/60">Punchline</span>
          <Input className="!h-8 text-xs" placeholder="O TMS feito para vender frete." {...campo('brandTagline')} />
        </label>
        <label className="block">
          <span className="text-[11px] text-base-content/60">Link de cadastro</span>
          <Input className="!h-8 text-xs" placeholder="https://..." {...campo('signupUrl')} />
        </label>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" variant="outline" loading={salvar.isPending}>
          Salvar identidade
        </Button>
        {/* Diz o custo de deixar vazio, em vez de só marcar campo obrigatório: sem
            estes dois o e-mail sai sem marca nenhuma, e isso não aparece em lugar
            nenhum depois. */}
        {(!form.displayName.trim() || !form.senderName.trim()) && (
          <span className="text-[11px] text-amber-600 dark:text-amber-400">
            Sem nome de exibição e remetente, o e-mail sai sem a marca deste mercado.
          </span>
        )}
      </div>
    </form>
  );
}

/**
 * O que este mercado já tem, em números.
 *
 * A lista só sabia falar do que FALTA. Mercado sem pendência virava uma linha muda
 * — "completo", e nada sobre o tamanho da operação atrás dele. De relance dá para
 * ver que um tem 1483 fatos e o outro tem 3, o que é a diferença entre a Lia
 * responder e a Lia improvisar.
 */
function ResumoDoMercado({ c }: { c: MarketCounts }) {
  // Singular e plural escritos por extenso: "mensagem" vira "mensagens" e "vendedor"
  // vira "vendedores". Colar um "s" no fim dá "2 vendedors", e a linha inteira passa
  // a parecer improvisada — que é justamente o que ela veio corrigir.
  const itens = [
    { n: c.conhecimentoUtil, um: 'fato', varios: 'fatos', icone: 'knowledge' },
    { n: c.modelos, um: 'mensagem', varios: 'mensagens', icone: 'mail' },
    { n: c.vendedores, um: 'vendedor', varios: 'vendedores', icone: 'sellers' },
  ];
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
      {itens.map((i) => (
        <span
          key={i.um}
          // Zero em cinza claro somiria justamente onde está a informação mais
          // importante da linha. Fica âmbar, do lado do número.
          className={`flex items-center gap-1 text-[11px] ${i.n === 0 ? 'text-amber-600 dark:text-amber-400' : 'text-base-content/50'}`}
        >
          <Icon name={i.icone as any} className="h-3.5 w-3.5" />
          {i.n} {i.n === 1 ? i.um : i.varios}
        </span>
      ))}
    </div>
  );
}

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
              {/* Ausente aparece aqui porque este é o lugar onde alguém decide contar
                  com a pessoa. Vinculado e de férias não é o mesmo que vinculado. */}
              {s.ausente && (
                <span className="ml-1.5 text-amber-700">
                  ausente
                  {s.awayUntil &&
                    ` até ${new Date(s.awayUntil).toLocaleDateString('pt-BR')}`}
                </span>
              )}
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
  // O modal mora aqui, e não no cockpit que embute esta tela: quem cria precisa ver
  // a lista mudar, e a rota /markets também tem que poder criar. Antes o cockpit
  // tinha o botão e o próprio título, e a tela abria com dois cabeçalhos empilhados
  // dizendo a mesma coisa.
  const [criando, setCriando] = useState(false);

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

  const excluir = useMutation({
    mutationFn: (code: string) => deleteMarket(code),
    onSuccess: () => {
      toast.info('Mercado excluído.');
      void qc.invalidateQueries({ queryKey: ['markets'] });
    },
    // A recusa do servidor diz O QUE impede (já tem conhecimento, já foi
    // liberado). Trocar isso por um genérico manda procurar defeito onde não há.
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Não foi possível excluir este mercado.'),
  });

  async function pedirExclusao(m: Market) {
    const ok = await confirm({
      title: `Excluir ${m.displayName || m.name}?`,
      message:
        'Só é possível porque este mercado ainda está em rascunho e não tem conhecimento, ' +
        'modelo de mensagem nem lista de lead. Não dá para desfazer.',
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (ok) excluir.mutate(m.code);
  }

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
        actions={<Button onClick={() => setCriando(true)}>+ Criar mercado</Button>}
      />
      <NewMarketModal open={criando} onClose={() => setCriando(false)} />

      {isLoading && <p className="text-sm text-base-content/50">Carregando mercados…</p>}

      {!isLoading && mercados.length === 0 && (
        <Card>
          <p className="text-sm text-base-content/60">Nenhum mercado cadastrado ainda.</p>
          <Button className="mt-3" size="sm" onClick={() => setCriando(true)}>
            + Criar o primeiro
          </Button>
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
              {/* Duplo clique abre e fecha, como linha de planilha. O chevron continua
                  ali para quem não descobre isso sozinho — e é ele que carrega o
                  aria-label, porque duplo clique não é alcançável pelo teclado. */}
              <div
                className="flex flex-wrap items-center gap-3 px-4 py-3 select-none"
                onDoubleClick={() => setAberto(expandido ? null : m.code)}
                title={expandido ? 'Clique duas vezes para fechar' : 'Clique duas vezes para editar'}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-base-200 text-xs font-medium text-base-content/70">
                  {iniciais(m.displayName || m.name)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-base-content">
                    {m.displayName || m.name}
                  </div>
                  <div className="truncate text-xs text-base-content/50">
                    {m.code}
                    {/* De quem é o mercado. Parceiro desativado fica em âmbar: as
                        campanhas dele continuam saindo com a marca de uma empresa
                        que alguém tirou do ar — quem olha a lista precisa ver. */}
                    {m.partner && (
                      <span className={m.partner.active ? '' : 'text-amber-600 dark:text-amber-400'}>
                        {' · '}
                        {m.partner.name}
                        {!m.partner.active && ' (parceiro desativado)'}
                      </span>
                    )}
                    {m.releasedAt && ` · no ar desde ${new Date(m.releasedAt).toLocaleDateString('pt-BR')}`}
                  </div>
                  {m.readiness?.counts && <ResumoDoMercado c={m.readiness.counts} />}
                </div>

                <StatusBadge tone={st.tom}>{st.texto}</StatusBadge>

                {/* Só existe botão quando ele faz algo. Um "Liberar" cinza em mercado
                    já liberado é ruído. */}
                {m.status !== 'active' && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!m.readiness?.pronto || liberar.isPending}
                    // stopPropagation em todos os botões da linha: sem isto, dois
                    // cliques rápidos em "Liberar" também abrem o painel embaixo, e a
                    // tela pula no meio da ação.
                    onDoubleClick={(e) => e.stopPropagation()}
                    onClick={() => liberar.mutate(m.code)}
                  >
                    <Icon name="check" className="h-4 w-4" /> Liberar
                  </Button>
                )}
                {m.status === 'active' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onDoubleClick={(e) => e.stopPropagation()}
                    onClick={() => void pedirSuspensao(m)}
                  >
                    Suspender
                  </Button>
                )}
                {/* Excluir só aparece em rascunho — é o desfazer do "Criar Novo
                    Market", não uma segunda forma de tirar do ar. */}
                {m.status !== 'active' && (
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1 text-xs text-base-content/40 hover:bg-red-50 dark:hover:bg-red-500/15 hover:text-red-500"
                    disabled={excluir.isPending}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onClick={() => void pedirExclusao(m)}
                  >
                    Excluir
                  </button>
                )}
                <button
                  type="button"
                  aria-label={expandido ? 'Recolher pendências' : 'Ver pendências'}
                  className="rounded-lg p-1 text-base-content/40 hover:bg-base-100"
                  onDoubleClick={(e) => e.stopPropagation()}
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
                  <IdentidadeDoMercado market={m} />
                  <MaterialDaCampanha code={m.code} />
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
