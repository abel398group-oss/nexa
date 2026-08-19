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

/**
 * Completa a extensão de um roteiro escrito à mão.
 *
 * Quem digita um nome está pensando no assunto ("eixo de pneus"), não no formato do
 * arquivo. Mas a extensão é o que decide o tipo no servidor, e sem ela a criação era
 * recusada — depois de o texto inteiro estar escrito, que é o pior momento para
 * descobrir uma regra dessas.
 *
 * O nome completo aparece embaixo do campo enquanto se digita: completar em silêncio
 * e mostrar outra coisa na lista seria trocar uma recusa por uma surpresa.
 */
function nomeDeRoteiro(nome: string): string {
  const limpo = nome.trim();
  return !limpo || ehTexto(limpo) ? limpo : `${limpo}.md`;
}

/** Os grupos da fila, na mesma ordem e com o mesmo nome das áreas de soltar. */
const GRUPOS = [
  { kind: 'plan', titulo: 'Roteiro da campanha', icone: 'mail' },
  { kind: 'portfolio', titulo: 'Portfólio e materiais', icone: 'eye' },
] as const;

/** O nome da área de onde o arquivo veio — o mesmo texto das áreas de soltar. */
function rotuloDoTipo(kind: string): string {
  return kind === 'plan' ? 'Roteiro da campanha' : 'Portfólio e materiais';
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
  const [edicao, setEdicao] = useState<{ id: string | null; name: string; content: string } | null>(null);

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
  /// Rascunho que ainda não existe no servidor: `id` nulo com nada aberto na fila.
  const novo = !!editando && editando.id === null;

  function abrir(id: string) {
    // Trocar de arquivo descarta o rascunho: sem isto o texto de um apareceria no
    // editor do outro, e salvar gravaria no arquivo errado.
    setEdicao(null);
    setAberto(id);
  }

  /**
   * Roteiro escrito aqui, do zero — nem todo texto nasce num arquivo no computador.
   *
   * Abre o MESMO editor da correção, vazio. O nome já vem com `.md` porque a extensão
   * decide o tipo no servidor, e descobrir isso levando recusa depois de escrever o
   * texto inteiro seria o pior momento possível.
   */
  function escreverDoZero() {
    setAberto(null);
    setEdicao({ id: null, name: 'novo-roteiro.md', content: '' });
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
    mutationFn: async ({ arquivos, kind }: { arquivos: File[]; kind: 'plan' | 'portfolio' }) => {
      const aceitos: string[] = [];
      const recusados: string[] = [];
      for (const f of arquivos) {
        // A ÁREA decide o grupo, não o tipo do arquivo. O que entra pelo Roteiro fica
        // sob o título Roteiro. Antes o tipo mandava, e um PDF solto na área de texto
        // reaparecia calado no outro grupo — a área dizia uma coisa e a lista, outra.
        //
        // Não cabendo, é RECUSA com o nome do arquivo e para onde ele deveria ir. Um
        // `.md` não vira portfólio (o texto some do que a Lia lê) e um PDF não vira
        // roteiro (binário não cabe na coluna de texto): remanejar em silêncio seria
        // trocar um erro visível por um escondido.
        const ehArquivoDeTexto = ehTexto(f.name);
        if (kind === 'plan' && !ehArquivoDeTexto) {
          recusados.push(`${f.name} (não é texto — solte em Portfólio e materiais)`);
          continue;
        }
        if (kind === 'portfolio' && ehArquivoDeTexto) {
          recusados.push(`${f.name} (é texto — solte em Roteiro da campanha)`);
          continue;
        }
        try {
          if (kind === 'plan') await uploadMarketAsset(code, { name: f.name, content: await f.text() });
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
    // Rascunho novo (`id` nulo) entra pela MESMA rota do arquivo arrastado: o servidor
    // faz upsert pelo nome, então escrever aqui e arrastar um `.md` com o mesmo nome
    // acabam na mesma linha, com a mesma regra de aprovação. Dois caminhos de escrita
    // seriam duas chances de divergirem.
    mutationFn: () =>
      edicao!.id === null
        ? uploadMarketAsset(code, { name: nomeDeRoteiro(edicao!.name), content: edicao!.content })
        : editMarketAsset(code, edicao!.id, {
            ...(edicao!.name !== selecionado?.name && { name: edicao!.name }),
            ...(selecionado?.kind === 'plan' && { content: edicao!.content }),
          }),
    onSuccess: (salvo) => {
      recarregar();
      void qc.invalidateQueries({ queryKey: [...chave, aberto, 'conteudo'] });
      const eraNovo = edicao?.id === null;
      setEdicao(null);
      // Abre o que acabou de nascer: escrever e não ver o resultado deixa a dúvida
      // de se salvou mesmo.
      if (eraNovo && salvo?.id) setAberto(salvo.id);
      toast.success(eraNovo ? 'Roteiro criado — está na fila para você aprovar.' : 'Corrigido — voltou para a fila, é só aprovar.');
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

  /**
   * Esvazia o mercado inteiro. Existe para o caso de recomeçar a pilha do zero —
   * subir a pasta errada e ter que apagar sete arquivos um a um é o caminho que faz
   * a pessoa desistir e conviver com material errado no mercado.
   *
   * O texto da confirmação DIZ O NÚMERO e quantos já estavam aprovados: "remover
   * tudo" é fácil de clicar sem perceber que leva junto o que já foi revisado.
   *
   * Sem endpoint em lote de propósito — são poucos arquivos por mercado, e um
   * DELETE por item reaproveita a rota que já existe (com a checagem de tenant que
   * ela já faz) em vez de abrir uma rota nova que apaga em massa.
   */
  const removerTudo = useMutation({
    mutationFn: async () => {
      for (const a of itens) await deleteMarketAsset(code, a.id);
    },
    onSuccess: () => { recarregar(); setAberto(null); toast.info('Mercado esvaziado.'); },
    onError: () => toast.error('Não consegui remover tudo — recarregue e veja o que sobrou.'),
  });

  async function pedirRemocaoTotal() {
    const qtdAprovados = itens.filter((a) => a.status === 'approved').length;
    const ok = await confirm({
      title: `Remover todos os ${itens.length} arquivos de ${code}?`,
      message:
        (qtdAprovados
          ? `${qtdAprovados} já ${qtdAprovados === 1 ? 'está aprovado' : 'estão aprovados'} e ${qtdAprovados === 1 ? 'vai' : 'vão'} junto. `
          : '') +
        'Não tem como desfazer: os arquivos saem do mercado, a Lia deixa de ver e o vendedor deixa de poder anexar.',
      confirmLabel: `Remover os ${itens.length}`,
      variant: 'danger',
    });
    if (ok) removerTudo.mutate();
  }

  function receber(lista: FileList | null, kind: 'plan' | 'portfolio') {
    const arquivos = Array.from(lista ?? []);
    if (arquivos.length) subir.mutate({ arquivos, kind });
  }

  /**
   * Duas áreas, porque são duas coisas — e a área é que MANDA.
   *
   * O que entra pelo Roteiro fica sob o título Roteiro; o que entra pelo Portfólio,
   * sob o dele. O arquivo que não couber é recusado dizendo o nome e para onde ir,
   * em vez de reaparecer calado no outro grupo: a área prometendo uma coisa e a
   * lista mostrando outra é pior do que uma recusa clara.
   */
  function AreaDeSoltar({ kind, titulo, detalhe, accept }: {
    kind: 'plan' | 'portfolio'; titulo: string; detalhe: string; accept: string;
  }) {
    const ref = kind === 'plan' ? refRoteiro : refPortfolio;
    return (
      <div
        onDragOver={(e) => { e.preventDefault(); setArrastando(kind); }}
        onDragLeave={() => setArrastando(null)}
        onDrop={(e) => { e.preventDefault(); setArrastando(null); receber(e.dataTransfer.files, kind); }}
        onClick={() => ref.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
          arrastando === kind ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-500/10' : 'border-base-300 hover:bg-base-100'
        }`}
      >
        <Icon name={kind === 'plan' ? 'mail' : 'eye'} className="mx-auto h-6 w-6 text-base-content/60" />
        <p className="mt-1.5 text-sm text-base-content/75">{subir.isPending ? 'Subindo…' : titulo}</p>
        <p className="mt-0.5 text-[11px] text-base-content/65">{detalhe}</p>
        <input
          ref={ref}
          type="file"
          multiple
          accept={accept}
          className="hidden"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => { receber(e.target.files, kind); e.target.value = ''; }}
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
          <>
            <select className="input w-52 text-sm" value={code} onChange={(e) => setCode(e.target.value)}>
              {mercados.map((m) => (
                <option key={m.code} value={m.code}>{m.displayName || m.name}</option>
              ))}
            </select>
            {/* Nem todo roteiro nasce num arquivo: às vezes a pessoa quer escrever
                aqui mesmo. Cai na mesma fila e na mesma aprovação do que foi
                arrastado — o texto não sabe por onde entrou. */}
            <Button variant="outline" onClick={escreverDoZero}>
              <Icon name="edit" className="h-4 w-4" /> Escrever roteiro
            </Button>
            {/* Só aparece com material na tela: botão de esvaziar num mercado já
                vazio não tem o que fazer, e ocupa o lugar de quem importa. */}
            {itens.length > 0 && (
              <Button
                variant="ghost"
                className="text-red-500 hover:bg-red-50 dark:hover:bg-red-500/15"
                disabled={removerTudo.isPending}
                onClick={() => void pedirRemocaoTotal()}
              >
                <Icon name="trash" className="h-4 w-4" />{' '}
                {removerTudo.isPending ? 'Removendo…' : 'Remover tudo'}
              </Button>
            )}
          </>
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

        {/* A moldura azul é o sinal de que se está ESCREVENDO, e não lendo.
            Antes, "Corrigir" trocava um <pre> por um <textarea> e o resto da tela
            ficava igual — dava para não saber em que modo se estava, e um clique
            fora perdia o que tinha sido digitado sem aviso. */}
        <Card className={`p-0 ${editando ? 'ring-2 ring-blue-400 dark:ring-blue-500' : ''}`}>
          {!selecionado && !novo ? (
            <div className="flex h-72 flex-col items-center justify-center gap-2 text-center">
              <Icon name="knowledge" className="h-8 w-8 text-base-content/20" />
              <p className="text-sm text-base-content/70">Escolha um arquivo para ler.</p>
              <p className="max-w-xs text-[11px] text-base-content/60">
                O botão de aprovar aparece aqui, ao lado do que você está lendo. Para escrever um
                roteiro do zero, use “Escrever roteiro” lá em cima.
              </p>
            </div>
          ) : (
            <>
              <div
                className={`flex flex-wrap items-center gap-2 border-b border-base-200 px-4 py-2.5 ${
                  editando ? 'bg-blue-50 dark:bg-blue-500/10' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  {editando ? (
                    <input
                      className="input !h-8 w-full text-sm"
                      value={editando.name}
                      onChange={(e) => setEdicao((v) => v && { ...v, name: e.target.value })}
                      aria-label="Nome do arquivo"
                    />
                  ) : (
                    <div className="truncate text-sm font-medium text-base-content">{selecionado?.name}</div>
                  )}
                  <div className="text-[11px] text-base-content/70">
                    {selecionado
                      ? `${rotuloDoTipo(selecionado.kind)} · ${tamanho(selecionado.sizeBytes)}${
                          selecionado.approvedAt
                            ? ` · aprovado em ${new Date(selecionado.approvedAt).toLocaleDateString('pt-BR')}`
                            : ''
                        }`
                      : // Mostra o nome COM a extensão que vai ser gravada. Completar em
                        // silêncio e a lista exibir outra coisa seria trocar a recusa
                        // por uma surpresa.
                        `Roteiro da campanha · salva como ${nomeDeRoteiro(editando?.name ?? '') || '…'}`}
                  </div>
                </div>
                {editando ? (
                  <StatusBadge tone="info">
                    <Icon name="edit" className="mr-1 inline h-3 w-3" /> {novo ? 'Escrevendo' : 'Editando'}
                  </StatusBadge>
                ) : (
                  selecionado && (
                    <StatusBadge tone={selecionado.status === 'pending' ? 'warning' : 'success'}>
                      {selecionado.status === 'pending' ? 'Aguardando' : 'Aprovado'}
                    </StatusBadge>
                  )
                )}
                {editando ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => { setEdicao(null); }}>
                      {novo ? 'Descartar' : 'Cancelar'}
                    </Button>
                    <Button
                      size="sm"
                      loading={salvar.isPending}
                      // Rascunho novo sem nome ou sem texto não vira arquivo. O servidor
                      // recusaria, mas depois de escrever tudo — travar aqui é mais honesto.
                      disabled={novo && (!editando.name.trim() || !editando.content.trim())}
                      onClick={() => salvar.mutate()}
                    >
                      {novo ? 'Criar roteiro' : 'Salvar correção'}
                    </Button>
                  </>
                ) : (
                  selecionado && (
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
                      className="rounded-lg px-2 py-1 text-xs text-base-content/60 hover:bg-red-50 dark:hover:bg-red-500/15 hover:text-red-500"
                      onClick={() => void pedirRemocao(selecionado)}
                    >
                      Remover
                    </button>
                  </>
                  )
                )}
              </div>

              <div className="p-3">
                {editando && (novo || selecionado?.kind === 'plan') ? (
                  <textarea
                    className="input h-[32rem] w-full py-2 font-mono text-xs leading-relaxed"
                    style={{ resize: 'vertical' }}
                    value={editando.content}
                    onChange={(e) => setEdicao((v) => v && { ...v, content: e.target.value })}
                    aria-label="Texto do roteiro"
                  />
                ) : null}
                {editando ? (
                  <p className="mt-2 text-[11px] text-base-content/70">
                    {novo
                      ? 'O roteiro entra na fila como pendente — você lê de novo e aprova. Se o nome não terminar em .md ou .txt, eu completo com .md.'
                      : 'Salvar devolve o arquivo para a fila — você aprova de novo com o texto novo na frente. Cancelar descarta o que foi digitado.'}
                  </p>
                ) : !selecionado ? null : selecionado.kind === 'plan' ? (
                  lendo ? (
                    <p className="text-xs text-base-content/60">Abrindo…</p>
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
      <span className={`text-[11px] ${destacar && itens.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-base-content/70'}`}>
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
        <p className="px-4 py-3 text-[11px] text-base-content/60">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="px-4 py-3 text-[11px] text-base-content/60">{vazio}</p>
      ) : (
        // Agrupado pela origem. Com oito arquivos do mesmo tipo, repetir "Roteiro da
        // campanha" em cada linha é oito vezes a mesma informação; dito uma vez no
        // topo do grupo, a linha fica só com o que muda — nome e tamanho.
        //
        // Grupo sem arquivo não aparece: a fila mostra o que existe, não o que
        // poderia existir.
        GRUPOS.filter((g) => itens.some((a) => a.kind === g.kind)).map((g) => (
          <div key={g.kind}>
            <div className="flex items-center gap-1.5 border-b border-base-200 bg-base-100 px-3 py-1.5">
              <Icon
                name={g.icone as any}
                className={`h-3.5 w-3.5 ${destacar ? 'text-amber-600 dark:text-amber-400' : 'text-base-content/70'}`}
              />
              <span className="text-[11px] font-medium uppercase tracking-wide text-base-content/70">
                {g.titulo}
              </span>
              <span className="ml-auto text-[11px] text-base-content/60">
                {itens.filter((a) => a.kind === g.kind).length}
              </span>
            </div>
            {itens
              .filter((a) => a.kind === g.kind)
              .map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onAbrir(a.id)}
                  className={`flex w-full items-center gap-2 border-b border-base-200 py-2 pl-5 pr-3 text-left last:border-0 ${
                    aberto === a.id ? 'bg-blue-50 dark:bg-blue-500/10' : 'hover:bg-base-100'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-base-content">{a.name}</span>
                    <span className="block text-[11px] text-base-content/60">{tamanho(a.sizeBytes)}</span>
                  </span>
                </button>
              ))}
          </div>
        ))
      )}
    </Card>
  );
}
