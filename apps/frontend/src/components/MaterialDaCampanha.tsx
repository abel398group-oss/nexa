import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Icon, StatusBadge } from '@/shared/ui';
import { useToast } from '@/app/providers/ToastContext';
import { useConfirm } from '@/app/providers/ConfirmContext';
import {
  listMarketAssets,
  readMarketAsset,
  uploadMarketAsset,
  approveMarketAsset,
  rejectMarketAsset,
  deleteMarketAsset,
  type MarketAsset,
} from '@/entities/market';

/**
 * Material de campanha do mercado (ADR 037).
 *
 * O plano de campanha nasce fora do Nexa — alguém escreve `.md` por eixo (cotações,
 * pneus, financeiro) numa pasta. Até aqui esse arquivo não tinha lugar no sistema:
 * quem montava a campanha abria fora, copiava e colava na tela de Mensagens. O plano,
 * que é a FONTE, ficava de fora, e a Lia nunca via.
 *
 * Tudo sobe PENDENTE. Aprovar é um ato separado, e é ele que libera o texto para a
 * Lia. Reenviar o mesmo arquivo derruba a aprovação — o servidor cuida disso; a tela
 * só precisa não esconder que aconteceu.
 */

const EXTENSOES = ['.md', '.txt', '.markdown'];

function ehTexto(nome: string): boolean {
  return EXTENSOES.some((e) => nome.toLowerCase().endsWith(e));
}

function tamanho(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

export function MaterialDaCampanha({ code }: { code: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);

  const chave = ['markets', code, 'assets'];
  const { data: itens = [], isLoading } = useQuery({ queryKey: chave, queryFn: () => listMarketAssets(code) });

  const { data: texto, isLoading: lendo } = useQuery({
    queryKey: [...chave, aberto],
    queryFn: () => readMarketAsset(code, aberto!),
    enabled: !!aberto,
  });

  const recarregar = () => void qc.invalidateQueries({ queryKey: chave });

  /**
   * Sobe os arquivos um a um, em série.
   *
   * Em série de propósito: arrastar os sete de uma vez em paralelo transformaria uma
   * recusa individual ("PDF não entra") em sete erros simultâneos, e o operador não
   * saberia qual arquivo é qual. Assim cada um dá o seu recado.
   */
  const subir = useMutation({
    mutationFn: async (arquivos: File[]) => {
      const aceitos: string[] = [];
      const recusados: string[] = [];
      for (const f of arquivos) {
        if (!ehTexto(f.name)) {
          recusados.push(f.name);
          continue;
        }
        try {
          await uploadMarketAsset(code, { name: f.name, content: await f.text() });
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
      if (aceitos.length) {
        toast.success(
          `${aceitos.length} arquivo(s) no mercado — aguardando sua aprovação para a Lia usar.`,
        );
      }
      // O recusado é dito INTEIRO, com o motivo. "Alguns arquivos falharam" faz o
      // operador subir tudo de novo às cegas.
      if (recusados.length) toast.error(`Fora: ${recusados.join(' · ')}`);
    },
    onError: () => toast.error('Não consegui subir o material.'),
  });

  const aprovar = useMutation({
    mutationFn: (id: string) => approveMarketAsset(code, id),
    onSuccess: () => { recarregar(); toast.success('Aprovado. A Lia já pode usar este material.'); },
    onError: () => toast.error('Não consegui aprovar.'),
  });

  const reprovar = useMutation({
    mutationFn: (id: string) => rejectMarketAsset(code, id),
    onSuccess: () => { recarregar(); toast.info('Voltou para pendente. O texto continua aqui.'); },
    onError: () => toast.error('Não consegui reprovar.'),
  });

  const remover = useMutation({
    mutationFn: (id: string) => deleteMarketAsset(code, id),
    onSuccess: () => { recarregar(); setAberto(null); toast.info('Material removido.'); },
    onError: () => toast.error('Não consegui remover.'),
  });

  async function pedirRemocao(a: MarketAsset) {
    const ok = await confirm({
      title: `Remover "${a.name}"?`,
      message: 'O texto sai do mercado e a Lia deixa de vê-lo. As mensagens já escritas continuam.',
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
        <p className="text-xs font-medium text-base-content">Material da campanha</p>
        <span className="text-[11px] text-base-content/50">
          {itens.length} arquivo(s)
          {pendentes > 0 && <span className="text-amber-600 dark:text-amber-400"> · {pendentes} aguardando</span>}
        </span>
      </div>
      <p className="mb-2 text-[11px] text-base-content/50">
        O plano que a Lia lê. Sobe pendente — só depois de você aprovar ela pode usar.
      </p>

      {/* ── Soltar arquivo ──────────────────────────────────────────────── */}
      <div
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); receber(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`mb-2 cursor-pointer rounded-lg border border-dashed px-3 py-4 text-center transition-colors ${
          arrastando ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-500/10' : 'border-base-300 hover:bg-base-100'
        }`}
      >
        <Icon name="upload" className="mx-auto h-5 w-5 text-base-content/40" />
        <p className="mt-1 text-[11px] text-base-content/60">
          {subir.isPending ? 'Subindo…' : 'Arraste os .md aqui, ou clique para escolher'}
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={EXTENSOES.join(',')}
        className="hidden"
        onChange={(e) => { receber(e.target.files); e.target.value = ''; }}
      />

      {/* ── Lista ───────────────────────────────────────────────────────── */}
      {isLoading ? (
        <p className="text-[11px] text-base-content/40">Carregando material…</p>
      ) : itens.length === 0 ? (
        <p className="text-[11px] text-base-content/40">
          Nenhum material ainda. Sem ele a Lia responde só com o conhecimento genérico.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-base-200">
          {itens.map((a) => {
            const pendente = a.status === 'pending';
            const expandido = aberto === a.id;
            return (
              <div key={a.id} className="border-b border-base-200 last:border-0">
                <div className={`flex flex-wrap items-center gap-2 px-3 py-2 ${pendente ? 'bg-amber-50/60 dark:bg-amber-500/10' : ''}`}>
                  <Icon name="mail" className={`h-4 w-4 shrink-0 ${pendente ? 'text-amber-600 dark:text-amber-400' : 'text-base-content/40'}`} />
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

                  {/* Ler vem antes de aprovar, e não por acaso: aprovar sem abrir é
                      exatamente o que a aprovação existe para impedir. */}
                  <button
                    type="button"
                    className="text-[11px] text-base-content/40 underline"
                    onClick={() => setAberto(expandido ? null : a.id)}
                  >
                    {expandido ? 'Fechar' : 'Ler'}
                  </button>
                  {pendente ? (
                    <Button size="sm" variant="outline" disabled={aprovar.isPending} onClick={() => aprovar.mutate(a.id)}>
                      Aprovar
                    </Button>
                  ) : (
                    <button
                      type="button"
                      className="text-[11px] text-base-content/40 underline"
                      onClick={() => reprovar.mutate(a.id)}
                    >
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
                    {lendo ? (
                      <p className="text-[11px] text-base-content/40">Abrindo…</p>
                    ) : (
                      // Texto cru, com rolagem própria. Renderizar o markdown aqui
                      // mostraria algo diferente do que a Lia lê — e é o que a Lia lê
                      // que está sendo aprovado.
                      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-base-content/70">
                        {texto?.content ?? ''}
                      </pre>
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
