import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Input,
  Label,
  PageContainer,
  PageHeader,
  Breadcrumb,
  Switch,
} from '@/shared/ui';
import { useToast } from '@/app/providers/ToastContext';
import { getMarketSellers, listMarkets, type Market } from '@/entities/market';
import { marketPadrao, useMarketAtivo } from '@/shared/lib/marketAtivo';
import {
  distribuirLote,
  importarLote,
  listLeadBatches,
  simularImportacao,
  PORQUE_TRAVADO,
  ROTULO_MOTIVO,
  type LeadBatch,
  type RelatorioImportacao,
} from '@/entities/lead-batch';

/**
 * Módulo 1 do telemarketing — "Preparar o trabalho do SDR", parte 1: a lista.
 *
 * A tela existe por causa de uma ordem: a peneira roda na IMPORTAÇÃO, não no
 * disparo. O operador vê o que a lista vale antes de ela entrar na base — por isso
 * todo caminho aqui passa pela prévia, e o botão de confirmar só existe depois dela.
 *
 * Ver docs/features/telemarketing/prd.md §Módulo 1.
 */
export function LeadBatchesPage() {
  const toast = useToast();
  const qc = useQueryClient();

  const [nome, setNome] = useState('');
  const [origem, setOrigem] = useState('');
  const [csv, setCsv] = useState('');
  const [arquivo, setArquivo] = useState('');
  const [forcar, setForcar] = useState(false);
  const [relatorio, setRelatorio] = useState<RelatorioImportacao | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const inputArquivo = useRef<HTMLInputElement>(null);

  const { data: mercados = [] } = useQuery<Market[]>({
    queryKey: ['markets', 'liberados'],
    queryFn: () => listMarkets(true),
  });
  // Mesmo market do cabeçalho do cockpit — ver marketAtivo.ts.
  const [productCode, setProductCode] = useMarketAtivo(marketPadrao(mercados));

  const { data: lotes = [] } = useQuery<LeadBatch[]>({
    queryKey: ['lead-batches'],
    queryFn: listLeadBatches,
  });

  const previa = useMutation({
    mutationFn: () =>
      simularImportacao({
        productCode,
        name: nome,
        csv,
        forcarJaNaBase: forcar,
        source: origem || undefined,
      }),
    onSuccess: setRelatorio,
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Não foi possível ler esta lista.'),
  });

  const confirmar = useMutation({
    mutationFn: () =>
      importarLote({
        productCode,
        name: nome,
        csv,
        forcarJaNaBase: forcar,
        source: origem || undefined,
      }),
    onSuccess: (r) => {
      toast.success(`${r.contadores.valid} leads entraram no lote "${nome}".`);
      limpar();
      qc.invalidateQueries({ queryKey: ['lead-batches'] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'A importação não foi concluída.'),
  });

  function limpar() {
    setCsv('');
    setArquivo('');
    setRelatorio(null);
    setForcar(false);
    setNome('');
    setOrigem('');
    if (inputArquivo.current) inputArquivo.current.value = '';
  }

  // Mudou o arquivo ou o mercado → o relatório na tela não vale mais. Deixar o número
  // antigo visível é pior que não ter número: ele confirmaria um valor que não é o que
  // vai entrar.
  useEffect(() => {
    setRelatorio(null);
  }, [csv, productCode]);

  // O switch muda quem entra, então muda os contadores. Sem re-simular, o operador
  // aprova um número e grava outro.
  useEffect(() => {
    if (csv && productCode && nome) previa.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forcar]);

  function lerArquivo(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      setCsv(String(reader.result ?? ''));
      setArquivo(file.name);
    };
    // Sem tratar erro de leitura o arquivo "não acontece" e a tela fica muda.
    reader.onerror = () => toast.error('Não foi possível ler o arquivo.');
    reader.readAsText(file, 'utf-8');
  }

  const podeSimular = !!productCode && !!nome.trim() && !!csv;
  const emVoo = previa.isPending || confirmar.isPending;

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: 'Vendas' }, { label: 'Listas de lead' }]} />
      <PageHeader
        title="Listas de lead"
        subtitle="A peneira roda aqui, na entrada — você vê o que a lista vale antes de ela entrar na base."
      />

      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mercado">Mercado</Label>
            <select
              id="mercado"
              value={productCode}
              onChange={(e) => setProductCode(e.target.value)}
              className="h-9 w-full rounded-md border border-base-300 bg-white px-3 text-sm text-base-content shadow-sm outline-none focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/30"
            >
              <option value="">Escolha…</option>
              {mercados.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-base-content/50">
              O roteiro do SDR vive no mercado, então a lista precisa declarar o dela.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nome">Nome da lista</Label>
            <Input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Feira Intermodal ago/26"
            />
            <p className="text-xs text-base-content/50">
              É esta etiqueta que responde, meses depois, qual lista prestou.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="origem">Origem (opcional)</Label>
            <Input
              id="origem"
              value={origem}
              onChange={(e) => setOrigem(e.target.value)}
              placeholder="feira, indicação, site"
            />
          </div>
        </div>
      </Card>

      <Card
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          const file = e.dataTransfer.files?.[0];
          if (file) lerArquivo(file);
        }}
        className={
          'flex flex-col items-center gap-3 border-2 border-dashed p-8 text-center transition-colors ' +
          (arrastando ? 'border-brand-500 bg-brand-500/5' : 'border-base-300')
        }
      >
        <p className="text-sm text-base-content/70">
          {arquivo ? (
            <>
              <span className="font-medium text-base-content">{arquivo}</span> carregado
            </>
          ) : csv ? (
            // Sem isso, quem acrescenta na mão digita, clica e não vê nada mudar —
            // e acha que não entrou.
            <span className="font-medium text-base-content">
              {Math.max(0, csv.trim().split('\n').length - 1)} lead(s) digitado(s)
            </span>
          ) : (
            'Arraste o CSV aqui, ou escolha o arquivo'
          )}
        </p>
        <input
          ref={inputArquivo}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) lerArquivo(file);
          }}
        />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => inputArquivo.current?.click()}>
            Escolher arquivo
          </Button>
          <Button
            size="sm"
            disabled={!podeSimular}
            loading={previa.isPending}
            onClick={() => previa.mutate()}
          >
            Ver o que entra
          </Button>
        </div>
        <p className="text-xs text-base-content/50">
          Aceita ponto-e-vírgula ou vírgula, com ou sem acento no cabeçalho. Nada é
          gravado até você confirmar.
        </p>
      </Card>

      <AdicionarNaMao
        onAdicionar={(linhas) =>
          // Vira CSV e entra pelo MESMO caminho do arquivo: prévia, peneira, confirmação.
          // Um atalho que gravasse direto pularia a peneira, e aí o lead digitado à mão
          // seria o único que entra sem checagem de opt-out e de cliente.
          setCsv((atual) => {
            const cabecalho = 'nome;empresa;telefone;email';
            const corpo = linhas.join('\n');
            return atual ? `${atual}\n${corpo}` : `${cabecalho}\n${corpo}`;
          })
        }
      />

      {relatorio && (
        <Relatorio
          relatorio={relatorio}
          forcar={forcar}
          onForcar={setForcar}
          simulando={previa.isPending}
          confirmando={confirmar.isPending}
          onConfirmar={() => confirmar.mutate()}
        />
      )}

      <Historico lotes={lotes} />
    </PageContainer>
  );
}

/**
 * Acrescentar um lead na mão (módulo 1, item 1).
 *
 * Não é um caminho paralelo: vira linha de CSV e entra pela mesma prévia. Se gravasse
 * direto, o lead digitado à mão seria o único a escapar da peneira — justamente o que
 * costuma ser digitado com pressa, no meio de uma ligação.
 */
function AdicionarNaMao({ onAdicionar }: { onAdicionar: (linhas: string[]) => void }) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [fone, setFone] = useState('');
  const [email, setEmail] = useState('');

  // Ponto-e-vírgula é o separador; se o operador digitar um no nome da empresa, a linha
  // quebra em duas células. Trocar por vírgula é mais honesto que recusar o texto dele.
  const limpo = (v: string) => v.replace(/;/g, ',').trim();

  function acrescentar() {
    onAdicionar([[limpo(nome), limpo(empresa), limpo(fone), limpo(email)].join(';')]);
    setNome('');
    setEmpresa('');
    setFone('');
    setEmail('');
  }

  if (!aberto) {
    return (
      <button
        type="button"
        className="self-start text-sm text-brand-600 underline-offset-4 hover:underline"
        onClick={() => setAberto(true)}
      >
        Acrescentar um lead na mão
      </button>
    );
  }

  return (
    <Card className="p-5">
      <p className="mb-3 text-sm font-medium">Acrescentar na mão</p>
      <div className="grid gap-3 sm:grid-cols-4">
        <Input placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
        <Input
          placeholder="Empresa"
          value={empresa}
          onChange={(e) => setEmpresa(e.target.value)}
        />
        <Input placeholder="Telefone" value={fone} onChange={(e) => setFone(e.target.value)} />
        <Input placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button
          size="sm"
          // Telefone OU e-mail: um canal utilizável basta, e é a mesma regra da peneira.
          disabled={!fone.trim() && !email.trim()}
          onClick={acrescentar}
        >
          Acrescentar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAberto(false)}>
          Fechar
        </Button>
        <span className="text-xs text-base-content/50">
          Entra na mesma prévia do arquivo — clique em “Ver o que entra” depois.
        </span>
      </div>
    </Card>
  );
}

function Numero({ valor, rotulo, tom }: { valor: number; rotulo: string; tom?: 'bom' | 'ruim' }) {
  const cor =
    tom === 'bom' ? 'text-emerald-600' : tom === 'ruim' ? 'text-base-content/60' : 'text-base-content';
  return (
    <div>
      <p className={`text-2xl font-semibold ${cor}`}>{valor}</p>
      <p className="text-xs text-base-content/60">{rotulo}</p>
    </div>
  );
}

function Relatorio({
  relatorio,
  forcar,
  onForcar,
  simulando,
  confirmando,
  onConfirmar,
}: {
  relatorio: RelatorioImportacao;
  forcar: boolean;
  onForcar: (v: boolean) => void;
  simulando: boolean;
  confirmando: boolean;
  onConfirmar: () => void;
}) {
  const { contadores, colunasIgnoradas, descartes } = relatorio;
  const fora = contadores.received - contadores.valid;
  const temJaNaBase = descartes.some((d) => d.motivo === 'ja_na_base');

  return (
    <Card className="p-5">
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
        <Numero valor={contadores.valid} rotulo="entram" tom="bom" />
        <Numero valor={fora} rotulo="ficam de fora" tom="ruim" />
        <Numero valor={contadores.received} rotulo="linhas no arquivo" />
        <Numero valor={contadores.noName} rotulo="sem nome" />
      </div>

      {contadores.noName > 0 && (
        <p className="mt-3 text-xs text-base-content/60">
          Os {contadores.noName} sem nome entram — o SDR só vai abrir com “Bom dia!” em
          vez de “Bom dia, Carlos!”.
        </p>
      )}

      {contadores.foneLixo > 0 && (
        // Aviso, não descarte: a linha entra porque o e-mail vale. Mas sem dizer isso
        // aqui, o SDR descobre na fila que não tem número pra ligar.
        <p className="mt-2 text-xs text-amber-700">
          {contadores.foneLixo}{' '}
          {contadores.foneLixo === 1 ? 'lead entra' : 'leads entram'} com a coluna de
          telefone preenchida errada — o SDR não vai conseguir ligar, só mandar e-mail.
          Vale corrigir na planilha antes.
        </p>
      )}

      {colunasIgnoradas.length > 0 && (
        <p className="mt-3 text-xs text-base-content/60">
          Colunas ignoradas: {colunasIgnoradas.join(', ')}. Nada foi perdido do que a
          gente usa — só não existe campo pra elas.
        </p>
      )}

      {Object.keys(contadores.porMotivo).length > 0 && (
        <div className="mt-5 border-t border-base-300 pt-4">
          <p className="mb-2 text-sm font-medium">Por que ficaram de fora</p>
          <ul className="flex flex-col gap-1.5">
            {Object.entries(contadores.porMotivo).map(([motivo, qtd]) => {
              const m = motivo as keyof typeof ROTULO_MOTIVO;
              return (
                <li key={motivo} className="flex items-baseline justify-between gap-3 text-sm">
                  <span>
                    {ROTULO_MOTIVO[m] ?? motivo}
                    <span className="ml-2 text-xs text-base-content/50">
                      {PORQUE_TRAVADO[m] ?? ''}
                    </span>
                  </span>
                  <span className="font-medium tabular-nums">{qtd}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* `|| forcar` porque o switch se apagava a si mesmo: ligado, ninguém mais fica em
          "já na base", `temJaNaBase` virava falso e o controle desaparecia — sem como
          desligar a não ser trocando o arquivo. */}
      {(temJaNaBase || forcar) && (
        <div className="mt-5 flex items-start gap-3 border-t border-base-300 pt-4">
          <Switch id="forcar" checked={forcar} onCheckedChange={onForcar} disabled={simulando} />
          <div>
            <Label htmlFor="forcar">Importar também quem já está na base</Label>
            <p className="text-xs text-base-content/60">
              Único motivo que dá pra forçar. Quem pediu para não receber, cliente,
              concorrente e e-mail morto continuam de fora.
            </p>
          </div>
        </div>
      )}

      {descartes.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-brand-600">
            Ver as {descartes.length} linhas de fora
          </summary>
          <ul className="mt-2 max-h-64 overflow-y-auto text-xs">
            {descartes.map((d) => (
              <li
                key={d.linha}
                className="flex justify-between gap-3 border-b border-base-200 py-1"
              >
                <span>linha {d.linha}</span>
                <span className="text-base-content/70">{ROTULO_MOTIVO[d.motivo]}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-5 flex items-center gap-3 border-t border-base-300 pt-4">
        <Button
          onClick={onConfirmar}
          loading={confirmando}
          // Travado enquanto a re-simulação está no ar: senão ele aprova o número
          // antigo e grava outro.
          disabled={simulando || contadores.valid === 0}
        >
          Importar {contadores.valid} leads
        </Button>
        {simulando && (
          <span className="text-xs text-base-content/60">recalculando…</span>
        )}
        {contadores.valid === 0 && !simulando && (
          <span className="text-xs text-base-content/60">
            Nenhuma linha aproveitável nesta lista.
          </span>
        )}
      </div>
    </Card>
  );
}

/**
 * Distribuir o lote entre SDRs.
 *
 * Fica no histórico e não logo após a importação de propósito: distribuir é decisão de
 * quem vai trabalhar, e nem sempre é na mesma hora que se sobe a lista — "guardar
 * agora, liberar segunda" é caso real.
 */
function Distribuir({ lote }: { lote: LeadBatch }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [abertos, setAbertos] = useState<string[]>([]);
  const [aberto, setAberto] = useState(false);

  const { data } = useQuery({
    queryKey: ['markets', lote.productCode, 'sellers'],
    queryFn: () => getMarketSellers(lote.productCode),
    enabled: aberto,
  });

  const distribuir = useMutation({
    mutationFn: () => distribuirLote(lote.id, abertos),
    onSuccess: (r) => {
      if (r.distribuidos === 0) {
        // Zero não é erro: normalmente é lote já distribuído. Dizer isso evita o
        // operador clicar de novo achando que travou.
        toast.info('Nada a distribuir — estes leads já têm dono.');
      } else {
        toast.success(`${r.distribuidos} leads divididos entre ${abertos.length}.`);
      }
      setAberto(false);
      setAbertos([]);
      qc.invalidateQueries({ queryKey: ['sdr', 'queue'] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Não foi possível distribuir.'),
  });

  const elegiveis = data?.vinculados ?? [];

  if (!aberto) {
    return (
      <Button size="xs" variant="outline" onClick={() => setAberto(true)}>
        Distribuir
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {elegiveis.length === 0 ? (
        <p className="text-xs text-amber-700">
          Ninguém trabalha o mercado <b>{lote.productCode}</b> ainda — vincule alguém em
          Mercados antes.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            {elegiveis.map((s) => (
              <label
                key={s.id}
                className={
                  'flex items-center gap-1.5 text-xs ' +
                  (s.ausente ? 'text-base-content/40' : '')
                }
                title={s.ausente ? 'Está ausente — não recebe lead novo agora.' : undefined}
              >
                <input
                  type="checkbox"
                  // Ausente entra desabilitado, não escondido: sumir com a pessoa faria
                  // o gestor procurar por ela. O backend já recusaria — mas aí ele
                  // marcaria, clicaria, e os leads iriam pros outros sem explicação.
                  disabled={s.ausente}
                  checked={abertos.includes(s.id)}
                  onChange={(e) =>
                    setAbertos((prev) =>
                      e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id),
                    )
                  }
                />
                {s.name}
                {s.ausente && <span className="text-amber-700">(ausente)</span>}
              </label>
            ))}
          </div>
          <p className="text-xs text-base-content/50">
            Divide em rodízio entre os marcados. Cada lead fica com um dono só — é o que
            evita dois SDRs ligando pra mesma pessoa.
          </p>
        </>
      )}
      <div className="flex gap-2">
        <Button
          size="xs"
          disabled={!abertos.length}
          loading={distribuir.isPending}
          onClick={() => distribuir.mutate()}
        >
          Dividir
        </Button>
        <Button size="xs" variant="ghost" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function Historico({ lotes }: { lotes: LeadBatch[] }) {
  if (!lotes.length) return null;

  return (
    <Card className="p-5">
      <p className="mb-3 text-sm font-medium">Listas que já entraram</p>
      <ul className="flex flex-col gap-1">
        {lotes.map((l) => (
          <li key={l.id} className="border-b border-base-200 last:border-0">
            <details>
              <summary className="flex cursor-pointer items-baseline justify-between gap-3 py-2 text-sm">
                <span>
                  {l.name}
                  <span className="ml-2 text-xs text-base-content/50">
                    {l.productCode} · {new Date(l.createdAt).toLocaleDateString('pt-BR')}
                  </span>
                </span>
                <span className="tabular-nums text-base-content/70">
                  {l.validCount} de {l.receivedCount}
                </span>
              </summary>
              <div className="flex flex-col gap-2 pb-3">
                <div className="flex flex-wrap gap-4 text-xs text-base-content/60">
                  <span>repetidos: {l.duplicateCount}</span>
                  <span>inválidos: {l.invalidCount}</span>
                  <span>sem nome: {l.noNameCount}</span>
                  {l.source && <span>origem: {l.source}</span>}
                </div>
                <Distribuir lote={l} />
              </div>
            </details>
          </li>
        ))}
      </ul>
    </Card>
  );
}
