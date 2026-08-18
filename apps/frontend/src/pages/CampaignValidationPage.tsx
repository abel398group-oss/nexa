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
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);

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

      {/* ── A pilha entra aqui ─────────────────────────────────────────────── */}
      <div
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); receber(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`mb-4 cursor-pointer rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors ${
          arrastando ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-500/10' : 'border-base-300 hover:bg-base-100'
        }`}
      >
        <Icon name="upload" className="mx-auto h-7 w-7 text-base-content/40" />
        <p className="mt-2 text-sm text-base-content/70">
          {subir.isPending ? 'Subindo…' : 'Arraste tudo aqui de uma vez'}
        </p>
        <p className="mt-0.5 text-[11px] text-base-content/45">
          Texto (.md, .txt) vira roteiro · PDF e imagem viram portfólio — eu separo pelo tipo
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => { receber(e.target.files); e.target.value = ''; }}
      />

      {/* ── Fila à esquerda, leitura à direita ─────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="space-y-4">
          <FilaDeMaterial
            titulo="Aguardando você"
            vazio="Nada na fila. Arraste os arquivos acima."
            itens={pendentes}
            aberto={aberto}
            destacar
            onAbrir={setAberto}
            carregando={isLoading}
          />
          <FilaDeMaterial
            titulo="Já aprovado"
            vazio="Nada aprovado ainda."
            itens={aprovados}
            aberto={aberto}
            onAbrir={setAberto}
            carregando={isLoading}
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
                  <div className="truncate text-sm font-medium text-base-content">{selecionado.name}</div>
                  <div className="text-[11px] text-base-content/50">
                    {selecionado.kind === 'plan' ? 'Roteiro' : 'Portfólio'} · {tamanho(selecionado.sizeBytes)}
                    {selecionado.approvedAt &&
                      ` · aprovado em ${new Date(selecionado.approvedAt).toLocaleDateString('pt-BR')}`}
                  </div>
                </div>
                <StatusBadge tone={selecionado.status === 'pending' ? 'warning' : 'success'}>
                  {selecionado.status === 'pending' ? 'Aguardando' : 'Aprovado'}
                </StatusBadge>
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
                  className="rounded-lg px-2 py-1 text-xs text-base-content/40 hover:bg-red-50 hover:text-red-500"
                  onClick={() => void pedirRemocao(selecionado)}
                >
                  Remover
                </button>
              </div>

              <div className="p-3">
                {selecionado.kind === 'plan' ? (
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

function FilaDeMaterial({
  titulo, vazio, itens, aberto, onAbrir, carregando, destacar,
}: {
  titulo: string;
  vazio: string;
  itens: MarketAsset[];
  aberto: string | null;
  onAbrir: (id: string) => void;
  carregando: boolean;
  destacar?: boolean;
}) {
  return (
    <Card className="p-0">
      <div className="flex items-baseline justify-between border-b border-base-200 px-4 py-2">
        <span className="text-xs font-medium text-base-content">{titulo}</span>
        <span className={`text-[11px] ${destacar && itens.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-base-content/50'}`}>
          {itens.length}
        </span>
      </div>
      {carregando ? (
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
