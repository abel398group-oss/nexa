import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Icon, PageContainer, PageHeader, Breadcrumb, StatusBadge } from '@/shared/ui';
import { useToast } from '@/app/providers/ToastContext';
import { useConfirm } from '@/app/providers/ConfirmContext';
import { marketPadrao, useMarketAtivo } from '@/shared/lib/marketAtivo';
import {
  listMarkets,
  listMarketAssets,
  readMarketAsset,
  uploadMarketAsset,
  uploadMarketPortfolio,
  editMarketAsset,
  approveMarketAsset,
  rejectMarketAsset,
  deleteMarketAsset,
  type MarketAsset,
} from '@/entities/market';

/**
 * Validação de campanha.
 *
 * O material de campanha do HiperTMS existe espalhado no computador de quem o
 * escreveu: `.md` por eixo, folder em PDF, foto. Trazer para dentro do Nexa é o que
 * permite ler, avaliar e APROVAR — e é só o aprovado que a Lia usa e o vendedor manda.
 *
 * Esta tela é o lugar disso. A gaveta do mercado também sobe arquivo, mas ali é
 * configuração, no meio de identidade e vendedores: espaço apertado, para conferir
 * um arquivo. Aqui é o contrário — a lista de um lado, o texto ABERTO do outro, e o
 * botão de aprovar ao lado do que se está lendo. Aprovar sem ler é o que a aprovação
 * existe para impedir, e uma tela onde ler é incômodo empurra justamente para isso.
 *
 * Uma área de soltar só, para os dois tipos. Quem tem a pasta bagunçada não deveria
 * ter de separar texto de PDF antes de arrastar — o tipo do arquivo já diz para onde
 * ele vai.
 */

const EXT_TEXTO = ['.md', '.txt', '.markdown'];
const TIPOS_PORTFOLIO = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

function ehTexto(nome: string): boolean {
  return EXT_TEXTO.some((e) => nome.toLowerCase().endsWith(e));
}

function tamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function CampaignValidationPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const refRoteiro = useRef<HTMLInputElement>(null);
  const refPortfolio = useRef<HTMLInputElement>(null);
  /// Qual área está recebendo o arrasto — ou null. Guardado por área, e não como
  /// booleano único, para a moldura acender só embaixo do cursor.
  const [arrastando, setArrastando] = useState<'plan' | 'portfolio' | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  /// Rascunho da correção. `null` = só lendo; objeto = editando este arquivo.
  const [edicao, setEdicao] = useState<{ id: string; name: string; content: string } | null>(null);

  const { data: mercados = [] } = useQuery({ queryKey: ['markets'], queryFn: () => listMarkets(false) });
  // Mesmo market do cabeçalho do cockpit — ver marketAtivo.ts.
  const [code, setCode] = useMarketAtivo(marketPadrao(mercados));

  const chave = ['markets', code, 'assets'];
  const { data: itens = [], isLoading } = useQuery({
    queryKey: chave,
    queryFn: () => listMarketAssets(code),
    enabled: !!code,
  });

  const selecionado = itens.find((a) => a.id === aberto) ?? null;
  const editando = edicao?.id === aberto ? edicao : null;

  function abrir(id: string) {
    // Trocar de arquivo descarta o rascunho: sem isto o texto de um apareceria no
    // editor do outro, e salvar gravaria no arquivo errado.
    setEdicao(null);
    setAberto(id);
  }
  const { data: texto, isLoading: lendo } = useQuery({
    queryKey: [...chave, aberto, 'conteudo'],
    queryFn: () => readMarketAsset(code, aberto!),
    enabled: !!aberto && selecionado?.kind === 'plan',
  });

  const recarregar = () => void qc.invalidateQueries({ queryKey: chave });

  /**
   * Sobe a pilha inteira, um por um, cada arquivo pelo caminho do seu tipo.
   *
   * Em série, e não em paralelo: uma pilha arrastada de uma vez transformaria uma
   * recusa individual em N erros simultâneos, sem dizer qual arquivo é qual.
   */
  const subir = useMutation({
    mutationFn: async (arquivos: File[]) => {
      const aceitos: string[] = [];
      const recusados: string[] = [];
      for (const f of arquivos) {
        try {
          if (ehTexto(f.name)) await uploadMarketAsset(code, { name: f.name, content: await f.text() });
          else await uploadMarketPortfolio(code, f);
          aceitos.push(f.name);
        } catch (e: any) {
          const m = e?.response?.data?.message;
          recusados.push(`${f.name} (${Array.isArray(m) ? m.join(', ') : m ?? 'falhou'})`);
        }
      }
      return { aceitos, recusados };
    },
    onSuccess: ({ aceitos, recusados }) => {
      recarregar();
      if (aceitos.length) toast.success(`${aceitos.length} arquivo(s) na fila de validação.`);
      if (recusados.length) toast.error(`Fora: ${recusados.join(' · ')}`);
    },
    onError: () => toast.error('Não consegui subir os arquivos.'),
  });

  const salvar = useMutation({
    mutationFn: () =>
      editMarketAsset(code, edicao!.id, {
        ...(edicao!.name !== selecionado?.name && { name: edicao!.name }),
        ...(selecionado?.kind === 'plan' && { content: edicao!.content }),
      }),
    onSuccess: () => {
      recarregar();
      void qc.invalidateQueries({ queryKey: [...chave, aberto, 'conteudo'] });
      setEdicao(null);
      toast.success('Corrigido — voltou para a fila, é só aprovar.');
    },
    onError: (e: any) => {
      const m = e?.response?.data?.message;
      toast.error(Array.isArray(m) ? m.join(' · ') : m ?? 'Não consegui salvar a correção.');
    },
  });

  const aprovar = useMutation({
    mutationFn: (id: string) => approveMarketAsset(code, id),
    onSuccess: () => { recarregar(); toast.success('Aprovado.'); },
    onError: () => toast.error('Não consegui aprovar.'),
  });

  const reprovar = useMutation({
    mutationFn: (id: string) => rejectMarketAsset(code, id),
    onSuccess: () => { recarregar(); toast.info('Voltou para a fila.'); },
    onError: () => toast.error('Não consegui reprovar.'),
  });

  const remover = useMutation({
    mutationFn: (id: string) => deleteMarketAsset(code, id),
    onSuccess: () => { recarregar(); setAberto(null); toast.info('Removido.'); },
    onError: () => toast.error('Não consegui remover.'),
  });

  async function pedirRemocao(a: MarketAsset) {
    const ok = await confirm({
      title: `Remover "${a.name}"?`,
      message: 'Sai do mercado de vez. A Lia deixa de ver, e o vendedor deixa de poder anexar.',
      confirmLabel: 'Remover',
      variant: 'danger',
    });
    if (ok) remover.mutate(a.id);
  }

  function receber(lista: FileList | null) {
    const arquivos = Array.from(lista ?? []);
    if (arquivos.length) subir.mutate(arquivos);
  }

  /**
   * Duas áreas, porque são duas coisas.
   *
   * O tipo do arquivo continua mandando de verdade — soltar um PDF na área de roteiro
   * o manda para portfólio do mesmo jeito, e o contrário também. As duas existem para
   * DIZER o que cabe em cada uma, não para policiar: quem chega com a pasta bagunçada
   * não deveria descobrir que errou só depois de arrastar.
   */
  function AreaDeSoltar({ kind, titulo, detalhe, accept }: {
    kind: 'plan' | 'portfolio'; titulo: string; detalhe: string; accept: string;
  }) {
    const ref = kind === 'plan' ? refRoteiro : refPortfolio;
    return (
      <div
        onDragOver={(e) => { e.preventDefault(); setArrastando(kind); }}
        onDragLeave={() => setArrastando(null)}
        onDrop={(e) => { e.preventDefault(); setArrastando(null); receber(e.dataTransfer.files); }}
        onClick={() => ref.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
          arrastando === kind ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-500/10' : 'border-base-300 hover:bg-base-100'
        }`}
      >
        <Icon name={kind === 'plan' ? 'mail' : 'eye'} className="mx-auto h-6 w-6 text-base-content/40" />
        <p className="mt-1.5 text-sm text-base-content/75">{subir.isPending ? 'Subindo…' : titulo}</p>
        <p className="mt-0.5 text-[11px] text-base-content/45">{detalhe}</p>
        <input
          ref={ref}
          type="file"
          multiple
          accept={accept}
          className="hidden"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => { receber(e.target.files); e.target.value = ''; }}
        />
      </div>
    );
  }

  const pendentes = itens.filter((a) => a.status === 'pending');
  const aprovados = itens.filter((a) => a.status === 'approved');

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: 'Vendas' }, { label: 'Validação de campanha' }]} />
      <PageHeader
        title="Validação de campanha"
        subtitle="Traga o material do mercado para cá, leia e aprove. Só o aprovado a Lia usa e o vendedor manda."
        actions={
          <select className="input w-52 text-sm" value={code} onChange={(e) => setCode(e.target.value)}>
            {mercados.map((m) => (
              <option key={m.code} value={m.code}>{m.displayName || m.name}</option>
            ))}
          </select>
        }
      />

      {/* ── A pilha entra aqui, cada coisa na sua área ────────────────────── */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <AreaDeSoltar
          kind="plan"
          titulo="Roteiro da campanha"
          detalhe=".md ou .txt — é o que a Lia lê"
          accept={EXT_TEXTO.join(',')}
        />
        <AreaDeSoltar
          kind="portfolio"
          titulo="Portfólio, folder e fotos"
          detalhe="PDF, JPG, PNG — é o que o lead vê"
          accept={TIPOS_PORTFOLIO.join(',')}
        />
      </div>

      {/* ── Fila à esquerda, leitura à direita ─────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="space-y-4">
          <FilaDeMaterial
            titulo="Aguardando você"
            vazio="Nada na fila. Arraste os arquivos acima."
            itens={pendentes}
            aberto={aberto}
            destacar
            onAbrir={abrir}
            carregando={isLoading}
          />
          <FilaDeMaterial
            titulo="Já aprovado"
            vazio="Nada aprovado ainda."
            itens={aprovados}
            aberto={aberto}
            onAbrir={abrir}
            carregando={isLoading}
            recolhivel
          />
        </div>

        <Card className="p-0">
          {!selecionado ? (
            <div className="flex h-72 flex-col items-center justify-center gap-2 text-center">
              <Icon name="knowledge" className="h-8 w-8 text-base-content/20" />
              <p className="text-sm text-base-content/50">Escolha um arquivo para ler.</p>
              <p className="max-w-xs text-[11px] text-base-content/40">
                O botão de aprovar aparece aqui, ao lado do que você está lendo.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-base-200 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  {editando ? (
                    <input
                      className="input !h-8 w-full text-sm"
                      value={editando.name}
                      onChange={(e) => setEdicao((v) => v && { ...v, name: e.target.value })}
                      aria-label="Nome do arquivo"
                    />
                  ) : (
                    <div className="truncate text-sm font-medium text-base-content">{selecionado.name}</div>
                  )}
                  <div className="text-[11px] text-base-content/50">
                    {selecionado.kind === 'plan' ? 'Roteiro' : 'Portfólio'} · {tamanho(selecionado.sizeBytes)}
                    {selecionado.approvedAt &&
                      ` · aprovado em ${new Date(selecionado.approvedAt).toLocaleDateString('pt-BR')}`}
                  </div>
                </div>
                <StatusBadge tone={selecionado.status === 'pending' ? 'warning' : 'success'}>
                  {selecionado.status === 'pending' ? 'Aguardando' : 'Aprovado'}
                </StatusBadge>
                {editando ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setEdicao(null)}>Cancelar</Button>
                    <Button size="sm" loading={salvar.isPending} onClick={() => salvar.mutate()}>
                      Salvar correção
                    </Button>
                  </>
                ) : (
                  <>
                    {/* Corrigir fica ao lado de aprovar de propósito: quem lê é quem
                        vê o erro, e mandar essa pessoa voltar ao computador para
                        editar o arquivo é o que faz ela aprovar assim mesmo. */}
                    {/* Só no roteiro. Portfólio é arquivo pronto: o que se corrige
                        num PDF é o PDF, e isso é subir de novo. */}
                    {selecionado.kind === 'plan' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={lendo}
                        onClick={() =>
                          setEdicao({
                            id: selecionado.id,
                            name: selecionado.name,
                            content: texto?.content ?? '',
                          })
                        }
                      >
                        <Icon name="edit" className="h-4 w-4" /> Corrigir
                      </Button>
                    )}
                    {selecionado.status === 'pending' ? (
                      <Button size="sm" disabled={aprovar.isPending} onClick={() => aprovar.mutate(selecionado.id)}>
                        <Icon name="check" className="h-4 w-4" /> Aprovar
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => reprovar.mutate(selecionado.id)}>
                        Reprovar
                      </Button>
                    )}
                    <button
                      type="button"
                      className="rounded-lg px-2 py-1 text-xs text-base-content/40 hover:bg-red-50 dark:hover:bg-red-500/15 hover:text-red-500"
                      onClick={() => void pedirRemocao(selecionado)}
                    >
                      Remover
                    </button>
                  </>
                )}
              </div>

              <div className="p-3">
                {editando && selecionado.kind === 'plan' ? (
                  <textarea
                    className="input h-[32rem] w-full py-2 font-mono text-xs leading-relaxed"
                    style={{ resize: 'vertical' }}
                    value={editando.content}
                    onChange={(e) => setEdicao((v) => v && { ...v, content: e.target.value })}
                    aria-label="Texto do roteiro"
                  />
                ) : selecionado.kind === 'plan' ? (
                  lendo ? (
                    <p className="text-xs text-base-content/40">Abrindo…</p>
                  ) : (
                    // Texto cru: é o que a Lia lê, e é o que está sendo julgado.
                    // Renderizar o markdown mostraria outra coisa.
                    <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-base-content/75">
                      {texto?.content ?? ''}
                    </pre>
                  )
                ) : selecionado.mimeType?.startsWith('image/') ? (
                  <img src={selecionado.fileUrl ?? ''} alt={selecionado.name} className="max-h-[32rem] rounded-lg" />
                ) : (
                  <iframe
                    title={selecionado.name}
                    src={selecionado.fileUrl ?? ''}
                    className="h-[32rem] w-full rounded-lg border border-base-200 bg-white"
                  />
                )}
              </div>
            </>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}

/**
 * Uma fila de material.
 *
 * `recolhivel` é o "já aprovado": ele nasce FECHADO, mostrando só a contagem. Este
 * painel é fila de trabalho, e o aprovado é histórico — precisa estar alcançável
 * (para conferir, ou para puxar de volta), não precisa ocupar a tela. Com as duas
 * listas abertas e coladas, a de baixo empurrava a de cima para fora da vista
 * justamente quando havia mais coisa aprovada, que é quando ela menos importa.
 *
 * Some da tela, não some do sistema: um clique traz de volta.
 */
function FilaDeMaterial({
  titulo, vazio, itens, aberto, onAbrir, carregando, destacar, recolhivel,
}: {
  titulo: string;
  vazio: string;
  itens: MarketAsset[];
  aberto: string | null;
  onAbrir: (id: string) => void;
  carregando: boolean;
  destacar?: boolean;
  recolhivel?: boolean;
}) {
  const [recolhido, setRecolhido] = useState(!!recolhivel);
  // O arquivo aberto no leitor está nesta lista: mantê-la fechada esconderia de qual
  // fila veio o que se está lendo.
  const contemOAberto = itens.some((a) => a.id === aberto);
  const fechado = recolhido && !contemOAberto;

  const cabecalho = (
    <>
      <span className="text-xs font-medium text-base-content">{titulo}</span>
      <span className={`text-[11px] ${destacar && itens.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-base-content/50'}`}>
        {itens.length}
        {recolhivel && (
          <Icon
            name="chevronDown"
            className={`ml-1 inline h-3.5 w-3.5 transition-transform ${fechado ? '' : 'rotate-180'}`}
          />
        )}
      </span>
    </>
  );

  return (
    <Card className="p-0">
      {recolhivel ? (
        <button
          type="button"
          onClick={() => setRecolhido((v) => !v)}
          aria-expanded={!fechado}
          className="flex w-full items-baseline justify-between border-b border-base-200 px-4 py-2 hover:bg-base-100"
        >
          {cabecalho}
        </button>
      ) : (
        <div className="flex items-baseline justify-between border-b border-base-200 px-4 py-2">{cabecalho}</div>
      )}
      {fechado ? null : carregando ? (
        <p className="px-4 py-3 text-[11px] text-base-content/40">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="px-4 py-3 text-[11px] text-base-content/40">{vazio}</p>
      ) : (
        itens.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onAbrir(a.id)}
            className={`flex w-full items-center gap-2 border-b border-base-200 px-3 py-2 text-left last:border-0 ${
              aberto === a.id ? 'bg-blue-50 dark:bg-blue-500/10' : 'hover:bg-base-100'
            }`}
          >
            <Icon
              name={a.kind === 'plan' ? 'mail' : 'knowledge'}
              className={`h-4 w-4 shrink-0 ${destacar ? 'text-amber-600 dark:text-amber-400' : 'text-base-content/35'}`}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs text-base-content">{a.name}</span>
              <span className="block text-[11px] text-base-content/45">
                {a.kind === 'plan' ? 'Roteiro' : 'Portfólio'} · {tamanho(a.sizeBytes)}
              </span>
            </span>
          </button>
        ))
      )}
    </Card>
  );
}
