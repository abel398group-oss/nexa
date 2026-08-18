import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Icon, StatusBadge } from '@/shared/ui';
import { useToast } from '@/app/providers/ToastContext';
import { useConfirm } from '@/app/providers/ConfirmContext';
import {
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
 * O que o mercado tem de material, em duas seções (ADR 037).
 *
 * São duas coisas diferentes e por isso não moram juntas:
 *
 *   • ROTEIRO — o `.md` que alguém escreveu por eixo (cotações, pneus, financeiro).
 *     É texto, e é o que a Lia lê para saber o que pode afirmar.
 *   • PORTFÓLIO — folder, catálogo, foto. É binário, e é o que o LEAD vê: vai
 *     anexado no e-mail ou mandado no zap.
 *
 * Misturar os dois numa lista só faz o operador procurar o PDF no meio dos textos e
 * não saber por que um abre na tela e o outro baixa.
 *
 * A regra de aprovação é a mesma para os dois: sobe pendente, e só vale depois que
 * alguém leu. Reenviar o mesmo nome derruba a aprovação.
 */

const EXT_ROTEIRO = ['.md', '.txt', '.markdown'];
const TIPOS_PORTFOLIO = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

function tamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function MaterialDaCampanha({ code }: { code: string }) {
  return (
    <>
      <SecaoDeMaterial
        code={code}
        kind="plan"
        titulo="Roteiro da campanha"
        explicacao="O texto que a Lia lê para saber o que pode afirmar deste mercado."
        convite="Arraste os .md ou .txt aqui, ou clique para escolher"
        vazio="Nenhum roteiro ainda. Sem ele a Lia responde só com o conhecimento genérico."
        accept={EXT_ROTEIRO.join(',')}
      />
      <SecaoDeMaterial
        code={code}
        kind="portfolio"
        titulo="Portfólio e materiais"
        explicacao="O que o lead vê: folder, catálogo, foto. Vai anexado no e-mail e no zap."
        convite="Arraste PDF, JPG ou PNG aqui, ou clique para escolher"
        vazio="Nenhum material ainda. O vendedor não tem o que anexar."
        accept={TIPOS_PORTFOLIO.join(',')}
      />
    </>
  );
}

interface SecaoProps {
  code: string;
  kind: 'plan' | 'portfolio';
  titulo: string;
  explicacao: string;
  convite: string;
  vazio: string;
  accept: string;
}

function SecaoDeMaterial({ code, kind, titulo, explicacao, convite, vazio, accept }: SecaoProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);

  const ehRoteiro = kind === 'plan';
  const chave = ['markets', code, 'assets', kind];
  const { data: itens = [], isLoading } = useQuery({
    queryKey: chave,
    queryFn: () => listMarketAssets(code, kind),
  });

  // O texto só é buscado quando alguém abre. O portfólio nunca passa por aqui — ele
  // é mostrado direto do `/uploads`, sem trafegar pelo JSON.
  const { data: texto, isLoading: lendo } = useQuery({
    queryKey: [...chave, aberto, 'conteudo'],
    queryFn: () => readMarketAsset(code, aberto!),
    enabled: !!aberto && ehRoteiro,
  });

  const recarregar = () => void qc.invalidateQueries({ queryKey: chave });

  /**
   * Sobe em série, e não em paralelo: arrastar sete de uma vez transformaria uma
   * recusa individual em sete erros simultâneos, sem dizer qual arquivo é qual.
   */
  const subir = useMutation({
    mutationFn: async (arquivos: File[]) => {
      const aceitos: string[] = [];
      const recusados: string[] = [];
      for (const f of arquivos) {
        try {
          if (ehRoteiro) await uploadMarketAsset(code, { name: f.name, content: await f.text() });
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
      if (aceitos.length) toast.success(`${aceitos.length} arquivo(s) — aguardando sua aprovação.`);
      // O recusado sai INTEIRO, com o motivo: "alguns falharam" faz subir tudo de novo
      // às cegas.
      if (recusados.length) toast.error(`Fora: ${recusados.join(' · ')}`);
    },
    onError: () => toast.error('Não consegui subir o material.'),
  });

  const aprovar = useMutation({
    mutationFn: (id: string) => approveMarketAsset(code, id),
    onSuccess: () => { recarregar(); toast.success(ehRoteiro ? 'Aprovado. A Lia já pode usar.' : 'Aprovado. O vendedor já pode anexar.'); },
    onError: () => toast.error('Não consegui aprovar.'),
  });

  const reprovar = useMutation({
    mutationFn: (id: string) => rejectMarketAsset(code, id),
    onSuccess: () => { recarregar(); toast.info('Voltou para pendente. O arquivo continua aqui.'); },
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
      message: ehRoteiro
        ? 'O texto sai do mercado e a Lia deixa de vê-lo. As mensagens já escritas continuam.'
        : 'O arquivo sai do mercado e o vendedor deixa de poder anexá-lo.',
      confirmLabel: 'Remover',
      variant: 'danger',
    });
    if (ok) remover.mutate(a.id);
  }

  function receber(lista: FileList | null) {
    const arquivos = Array.from(lista ?? []);
    if (arquivos.length) subir.mutate(arquivos);
  }

  const pendentes = itens.filter((a) => a.status === 'pending').length;

  return (
    <div className="mt-3 border-t border-base-200 pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-base-content">{titulo}</p>
        <span className="text-[11px] text-base-content/50">
          {itens.length} arquivo(s)
          {pendentes > 0 && <span className="text-amber-600 dark:text-amber-400"> · {pendentes} aguardando</span>}
        </span>
      </div>
      <p className="mb-2 text-[11px] text-base-content/50">{explicacao}</p>

      <div
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); receber(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`mb-2 cursor-pointer rounded-lg border border-dashed px-3 py-4 text-center transition-colors ${
          arrastando ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-500/10' : 'border-base-300 hover:bg-base-100'
        }`}
      >
        <Icon name={ehRoteiro ? 'upload' : 'building'} className="mx-auto h-5 w-5 text-base-content/40" />
        <p className="mt-1 text-[11px] text-base-content/60">{subir.isPending ? 'Subindo…' : convite}</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(e) => { receber(e.target.files); e.target.value = ''; }}
      />

      {isLoading ? (
        <p className="text-[11px] text-base-content/40">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="text-[11px] text-base-content/40">{vazio}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-base-200">
          {itens.map((a) => {
            const pendente = a.status === 'pending';
            const expandido = aberto === a.id;
            const ehImagem = !!a.mimeType?.startsWith('image/');
            return (
              <div key={a.id} className="border-b border-base-200 last:border-0">
                <div className={`flex flex-wrap items-center gap-2 px-3 py-2 ${pendente ? 'bg-amber-50/60 dark:bg-amber-500/10' : ''}`}>
                  <Icon
                    name={ehRoteiro ? 'mail' : ehImagem ? 'eye' : 'knowledge'}
                    className={`h-4 w-4 shrink-0 ${pendente ? 'text-amber-600 dark:text-amber-400' : 'text-base-content/40'}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs text-base-content">{a.name}</div>
                    <div className="truncate text-[11px] text-base-content/50">
                      {tamanho(a.sizeBytes)}
                      {a.approvedAt && ` · aprovado em ${new Date(a.approvedAt).toLocaleDateString('pt-BR')}`}
                    </div>
                  </div>

                  <StatusBadge tone={pendente ? 'warning' : 'success'}>
                    {pendente ? 'Aguardando' : 'Aprovado'}
                  </StatusBadge>

                  {/* Ver vem antes de Aprovar de propósito: aprovar sem abrir é
                      exatamente o que a aprovação existe para impedir. */}
                  <button
                    type="button"
                    className="text-[11px] text-base-content/40 underline"
                    onClick={() => setAberto(expandido ? null : a.id)}
                  >
                    {expandido ? 'Fechar' : ehRoteiro ? 'Ler' : 'Ver'}
                  </button>
                  {pendente ? (
                    <Button size="sm" variant="outline" disabled={aprovar.isPending} onClick={() => aprovar.mutate(a.id)}>
                      Aprovar
                    </Button>
                  ) : (
                    <button type="button" className="text-[11px] text-base-content/40 underline" onClick={() => reprovar.mutate(a.id)}>
                      Reprovar
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded-lg px-1.5 py-0.5 text-[11px] text-base-content/40 hover:bg-red-50 hover:text-red-500"
                    onClick={() => void pedirRemocao(a)}
                  >
                    Remover
                  </button>
                </div>

                {expandido && (
                  <div className="border-t border-base-200 bg-base-100 px-3 py-2">
                    {ehRoteiro ? (
                      lendo ? (
                        <p className="text-[11px] text-base-content/40">Abrindo…</p>
                      ) : (
                        // Texto cru. Renderizar o markdown mostraria algo diferente do
                        // que a Lia lê — e é o que ela lê que está sendo aprovado.
                        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-base-content/70">
                          {texto?.content ?? ''}
                        </pre>
                      )
                    ) : ehImagem ? (
                      <img src={a.fileUrl ?? ''} alt={a.name} className="max-h-96 rounded-lg border border-base-200" />
                    ) : (
                      // PDF no visualizador do próprio navegador, aqui na tela. Abrir
                      // noutra aba tira o operador do meio da revisão — e revisar sem
                      // sair é o ponto da seção.
                      <iframe
                        title={a.name}
                        src={a.fileUrl ?? ''}
                        className="h-96 w-full rounded-lg border border-base-200 bg-white"
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
