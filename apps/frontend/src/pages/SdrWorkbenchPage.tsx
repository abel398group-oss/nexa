import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Input,
  Label,
  Modal,
  PageContainer,
  Textarea,
} from '@/shared/ui';
import { useToast } from '@/app/providers/ToastContext';
import { useAuth } from '@/app/providers/AuthContext';
import { podeDiscar } from '@/shared/lib/dialable';
import { identidadeVisivel } from '@/shared/lib/conversation';
import { getRoteiro } from '@/entities/sales-script';
import {
  descartarLead,
  listClosers,
  listMaterial,
  listQueue,
  pausarLead,
  registrarAtividade,
  transferirParaCloser,
  ROTULO_PRIORIDADE,
  ROTULO_RESULTADO,
  type Closer,
  type ItemDaFila,
} from '@/entities/sdr';

/**
 * Mesa de trabalho do SDR (módulo 2). Fila à esquerda, lead no centro, ações no
 * rodapé fixo.
 *
 * Duas regras de comportamento que vêm do PRD e não são detalhe:
 *
 *  • A tela NÃO troca de lead sozinha depois de registrar uma tentativa. Trocar
 *    atropela quem ainda está escrevendo a anotação.
 *  • Depois de pausar, descartar ou transferir, o lead sai da fila — aí avançar não é
 *    atropelo, é a única coisa possível, e a seleção anda sozinha.
 */
export function SdrWorkbenchPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<'ligacao' | 'pausar' | 'descartar' | 'transferir' | null>(
    null,
  );

  const { data: fila = [], isLoading } = useQuery<ItemDaFila[]>({
    queryKey: ['sdr', 'queue'],
    queryFn: listQueue,
  });

  const lead = useMemo(
    () => fila.find((f) => f.id === selecionado) ?? fila[0] ?? null,
    [fila, selecionado],
  );

  // A versão do roteiro na tela — o CARIMBO. Toda ação manda ela junto; sem o carimbo
  // na atividade, "o texto novo converteu melhor?" nunca terá resposta (A1 da
  // auditoria). Mesma queryKey do painel do roteiro, então o react-query deduplica.
  const { data: roteiroDaTela } = useQuery({
    queryKey: ['sales-script', lead?.productCode],
    queryFn: () => getRoteiro(lead?.productCode as string),
    enabled: !!lead?.productCode,
  });
  const scriptVersion = roteiroDaTela?.version;

  // Primeira carga: já abre no primeiro da fila. Tela vazia com lista cheia do lado
  // faz o SDR clicar antes de começar a trabalhar, todo dia.
  useEffect(() => {
    if (!selecionado && fila.length) setSelecionado(fila[0].id);
  }, [fila, selecionado]);

  /// Chamado depois das ações que tiram o lead da fila. Anda para o próximo item da
  /// lista ATUAL, antes do refetch — assim a escolha não depende de quando a resposta
  /// do servidor chega.
  function avancar(idQueSaiu: string) {
    const i = fila.findIndex((f) => f.id === idQueSaiu);
    const proximo = fila[i + 1] ?? fila[i - 1] ?? null;
    setSelecionado(proximo?.id ?? null);
    qc.invalidateQueries({ queryKey: ['sdr', 'queue'] });
  }

  function erro(e: any, fallback: string) {
    toast.error(e?.response?.data?.message ?? fallback);
  }

  const atividade = useMutation({
    mutationFn: (dados: { result: string; notes?: string; type?: 'call' | 'whatsapp' | 'email' }) =>
      registrarAtividade({
        opportunityId: lead!.id,
        type: dados.type ?? 'call',
        result: dados.result,
        notes: dados.notes,
        scriptVersion,
      }),
    onSuccess: () => {
      toast.success('Registrado.');
      setDialogo(null);
      // Sem avançar de propósito: o lead continua sendo trabalho dele.
      qc.invalidateQueries({ queryKey: ['sdr', 'queue'] });
    },
    onError: (e) => erro(e, 'Não foi possível registrar.'),
  });

  const pausar = useMutation({
    mutationFn: (d: { retornoEm: string; notes?: string }) =>
      pausarLead(lead!.id, d.retornoEm, d.notes, scriptVersion),
    onSuccess: () => {
      toast.success('Volta pra sua fila na data marcada.');
      setDialogo(null);
      avancar(lead!.id);
    },
    onError: (e) => erro(e, 'Não foi possível pausar.'),
  });

  const descartar = useMutation({
    mutationFn: (d: { motivo: string; notes?: string }) =>
      descartarLead(lead!.id, d.motivo, d.notes, scriptVersion),
    onSuccess: () => {
      toast.info('Descartado.');
      setDialogo(null);
      avancar(lead!.id);
    },
    onError: (e) => erro(e, 'Não foi possível descartar.'),
  });

  const transferir = useMutation({
    mutationFn: (d: { closerId: string; meetingAt?: string; meetingUrl?: string; notes?: string }) =>
      transferirParaCloser(lead!.id, { ...d, scriptVersion }),
    onSuccess: () => {
      toast.success('Passado pro closer. Continua no seu histórico.');
      setDialogo(null);
      avancar(lead!.id);
    },
    onError: (e) => erro(e, 'Não foi possível transferir.'),
  });

  return (
    <PageContainer>
      <div className="grid gap-4 pb-24 lg:grid-cols-[20rem_1fr]">
        <Fila
          fila={fila}
          carregando={isLoading}
          selecionadoId={lead?.id ?? null}
          onSelecionar={setSelecionado}
        />
        {lead ? (
          // Roteiro à esquerda e maior: é o que ele lê enquanto fala. Ficha e histórico
          // são consulta; o roteiro é o trabalho.
          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <RoteiroDoMercado productCode={lead.productCode} lead={lead} />
            <FichaDoLead lead={lead} />
          </div>
        ) : (
          <Card className="flex items-center justify-center p-10 text-sm text-base-content/60">
            {isLoading ? 'Carregando sua fila…' : 'Sua fila está vazia por hoje.'}
          </Card>
        )}
      </div>

      {lead && (
        <BarraDeAcoes
          lead={lead}
          ocupado={
            atividade.isPending || pausar.isPending || descartar.isPending || transferir.isPending
          }
          onAcao={setDialogo}
          onNaoAtendeu={() => atividade.mutate({ result: 'nao_atendeu' })}
        />
      )}

      {lead && dialogo === 'ligacao' && (
        <DialogoLigacao
          onFechar={() => setDialogo(null)}
          salvando={atividade.isPending}
          onSalvar={(d) => atividade.mutate(d)}
        />
      )}

      {lead && dialogo === 'pausar' && (
        <DialogoPausa
          onFechar={() => setDialogo(null)}
          salvando={pausar.isPending}
          onSalvar={(d) => pausar.mutate(d)}
        />
      )}

      {lead && dialogo === 'descartar' && (
        <DialogoDescarte
          onFechar={() => setDialogo(null)}
          salvando={descartar.isPending}
          onSalvar={(d) => descartar.mutate(d)}
        />
      )}

      {lead && dialogo === 'transferir' && (
        <DialogoTransferencia
          productCode={lead.productCode}
          onFechar={() => setDialogo(null)}
          salvando={transferir.isPending}
          onSalvar={(d) => transferir.mutate(d)}
        />
      )}
    </PageContainer>
  );
}

const COR_PRIORIDADE: Record<string, string> = {
  retorno_hoje: 'bg-amber-100 text-amber-800',
  nunca_tocado: 'bg-brand-500/10 text-brand-700',
  em_andamento: 'bg-base-200 text-base-content/70',
};

function Fila({
  fila,
  carregando,
  selecionadoId,
  onSelecionar,
}: {
  fila: ItemDaFila[];
  carregando: boolean;
  selecionadoId: string | null;
  onSelecionar: (id: string) => void;
}) {
  return (
    <Card className="max-h-[calc(100vh-12rem)] overflow-y-auto p-2">
      <p className="px-2 py-2 text-xs font-medium uppercase tracking-wide text-base-content/50">
        Sua fila {fila.length > 0 && `· ${fila.length}`}
      </p>
      {carregando && <p className="px-2 py-3 text-sm text-base-content/60">Carregando…</p>}
      {!carregando && !fila.length && (
        <p className="px-2 py-3 text-sm text-base-content/60">Nada pra hoje.</p>
      )}
      <ul className="flex flex-col gap-0.5">
        {fila.map((f) => {
          const ativo = f.id === selecionadoId;
          return (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => onSelecionar(f.id)}
                className={
                  'w-full rounded-md px-2 py-2 text-left transition-colors ' +
                  (ativo ? 'bg-brand-500/10' : 'hover:bg-base-200')
                }
              >
                {/* Mesma cascata do card do closer: lead que entrou por e-mail não tem
                    empresa nem nome, e a fila mostrava "Sem nome" com o endereço dele
                    disponível ali do lado, na coluna `phone`. */}
                <p className="truncate text-sm font-medium">
                  {f.contact?.company ??
                    f.company ??
                    f.contact?.name ??
                    (identidadeVisivel(f.phone) || 'Sem nome')}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={
                      'rounded px-1.5 py-0.5 text-[10px] font-medium ' +
                      (COR_PRIORIDADE[f.prioridade] ?? '')
                    }
                  >
                    {ROTULO_PRIORIDADE[f.prioridade]}
                  </span>
                  {f.tentativas > 0 && (
                    <span className="text-[10px] text-base-content/50">
                      {f.tentativas} {f.tentativas === 1 ? 'tentativa' : 'tentativas'}
                    </span>
                  )}
                  {/* O mesmo lead veio em mais de uma lista. A fila já mostra ele uma
                      vez só; o selo existe para o SDR não achar que a duplicata sumiu
                      do sistema — ela está aqui, contada. */}
                  {(f.oportunidades?.length ?? 1) > 1 && (
                    <span
                      className="rounded bg-base-200 px-1.5 py-0.5 text-[10px] text-base-content/60"
                      title={`Este lead entrou em ${f.oportunidades!.length} listas diferentes`}
                    >
                      {f.oportunidades!.length} listas
                    </span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/// Troca `{{nome}}`, `{{remetente}}` e `{{saudacao}}` no texto do roteiro.
///
/// Sem nome, a saudação sai sem ele — "Bom dia!" e não "Bom dia, !". É a mesma regra do
/// backend: o fallback existe pra ninguém ler vírgula solta em voz alta no telefone.
function preencher(texto: string, lead: ItemDaFila, remetente: string): string {
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const nome = (lead.contact?.name ?? lead.name ?? '').trim().split(/\s+/)[0] ?? '';
  // Primeiro nome de quem está logado. Vazio era o bug A5: "Aqui é o {{remetente}}"
  // virava "Aqui é o ," na tela — lido em voz alta no telefone.
  const primeiroNome = remetente.trim().split(/\s+/)[0] ?? '';

  return texto
    .replace(/\{\{\s*saudacao\s*\}\}/gi, saudacao)
    .replace(/\{\{\s*remetente\s*\}\}/gi, primeiroNome)
    .replace(/\{\{\s*nome\s*\}\}/gi, nome)
    // Sobrou vírgula ou espaço antes da pontuação porque o nome era vazio: limpa, senão
    // o SDR lê "Bom dia, ! Aqui é o".
    .replace(/,\s*([!?.])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function Secao({
  titulo,
  texto,
  lead,
  aberta = false,
}: {
  titulo: string;
  texto: string | null;
  lead: ItemDaFila;
  aberta?: boolean;
}) {
  const [abre, setAbre] = useState(aberta);
  const { user } = useAuth();
  if (!texto) return null;
  return (
    <div className="border-b border-base-200 last:border-0">
      <button
        type="button"
        onClick={() => setAbre(!abre)}
        className="flex w-full items-center justify-between gap-2 py-2 text-left text-sm font-medium"
      >
        {titulo}
        <span className={'text-base-content/40 transition-transform ' + (abre ? 'rotate-180' : '')}>
          ▾
        </span>
      </button>
      {abre && (
        <p className="whitespace-pre-wrap pb-3 text-sm leading-relaxed text-base-content/90">
          {preencher(texto, lead, user?.name ?? '')}
        </p>
      )}
    </div>
  );
}

/**
 * O roteiro do mercado deste lead.
 *
 * Coluna própria com scroll próprio: se ele precisar rolar a página inteira pra achar a
 * resposta de "quanto custa?", ele improvisa — e evitar isso é o motivo de o módulo 1
 * existir. A abertura já vem aberta; as objeções ficam fechadas até precisar.
 */
function RoteiroDoMercado({
  productCode,
  lead,
}: {
  productCode: string | null;
  lead: ItemDaFila;
}) {
  const { data: roteiro, isLoading } = useQuery({
    queryKey: ['sales-script', productCode],
    queryFn: () => getRoteiro(productCode as string),
    enabled: !!productCode,
  });

  if (!productCode) {
    return (
      <Card className="p-5 text-sm text-base-content/60">
        Este lead não tem mercado, então não há roteiro para mostrar.
      </Card>
    );
  }

  if (isLoading) {
    return <Card className="p-5 text-sm text-base-content/60">Carregando roteiro…</Card>;
  }

  if (!roteiro) {
    return (
      <Card className="p-5">
        <p className="text-sm text-amber-700">
          Não existe roteiro para <b>{productCode}</b> ainda.
        </p>
        <p className="mt-1 text-xs text-base-content/60">
          Quem monta a operação precisa escrever em Roteiro do SDR. Ligar sem roteiro é
          exatamente o que este módulo existe para evitar.
        </p>
      </Card>
    );
  }

  const objecoes = roteiro.objecoes ?? [];

  return (
    <Card className="max-h-[calc(100vh-14rem)] overflow-y-auto p-5">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm font-semibold">Roteiro</p>
        <span className="text-xs text-base-content/40">
          {productCode} · v{roteiro.version}
        </span>
      </div>

      <Secao titulo="Abertura da ligação" texto={roteiro.aberturaCall} lead={lead} aberta />
      <Secao titulo="Abertura do WhatsApp" texto={roteiro.aberturaWhatsapp} lead={lead} />
      <Secao
        titulo={
          roteiro.assuntoEmail
            ? `Abertura do e-mail — assunto: ${roteiro.assuntoEmail}`
            : 'Abertura do e-mail'
        }
        texto={roteiro.aberturaEmail}
        lead={lead}
      />

      {objecoes.length > 0 && (
        <div className="mt-3 border-t border-base-300 pt-2">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-base-content/50">
            Se ele disser…
          </p>
          {objecoes.map((o, i) => (
            <Secao key={i} titulo={o.situacao} texto={o.resposta} lead={lead} />
          ))}
        </div>
      )}

      <Material productCode={productCode} />
    </Card>
  );
}

/**
 * Material de consulta (módulo 1, item 7): a base de conhecimento do mercado.
 *
 * Fica no fim do roteiro e fechado, porque não é o que ele lê — é o que ele procura
 * quando a conversa sai do script. Com busca, porque durante uma ligação ele tem uns
 * quinze segundos para achar o preço, e rolar uma lista não cabe nesse tempo.
 */
function Material({ productCode }: { productCode: string | null }) {
  const [busca, setBusca] = useState('');
  const [buscaAtrasada, setBuscaAtrasada] = useState('');
  const [abre, setAbre] = useState(false);

  // Espera 300ms depois da última tecla. Sem isso, "integração" dispara dez requisições
  // e a resposta da penúltima pode chegar depois da última, mostrando resultado de
  // "integraçã" — errado justamente no meio de uma ligação.
  useEffect(() => {
    const t = setTimeout(() => setBuscaAtrasada(busca), 300);
    return () => clearTimeout(t);
  }, [busca]);

  const { data: itens = [] } = useQuery({
    queryKey: ['sdr', 'material', productCode, buscaAtrasada],
    queryFn: () => listMaterial(productCode as string, buscaAtrasada),
    enabled: !!productCode && abre,
  });

  if (!productCode) return null;

  return (
    <div className="mt-3 border-t border-base-300 pt-2">
      <button
        type="button"
        onClick={() => setAbre(!abre)}
        className="flex w-full items-center justify-between gap-2 py-1 text-left text-xs font-medium uppercase tracking-wide text-base-content/50"
      >
        Material de consulta
        <span className={'transition-transform ' + (abre ? 'rotate-180' : '')}>▾</span>
      </button>

      {abre && (
        <div className="pt-2">
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="preço, integração, prazo…"
            className="h-8 text-xs"
          />
          {itens.length === 0 && (
            <p className="mt-2 text-xs text-base-content/50">
              {busca
                ? 'Nada com esse termo neste mercado.'
                : 'Este mercado ainda não tem material aprovado.'}
            </p>
          )}
          {itens.map((k) => (
            <details key={k.id} className="border-b border-base-200 py-1.5 last:border-0">
              <summary className="cursor-pointer text-sm">{k.title}</summary>
              <p className="whitespace-pre-wrap pt-1 text-xs leading-relaxed text-base-content/80">
                {k.content}
              </p>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string | number | null }) {
  if (valor === null || valor === '') return null;
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <span className="text-base-content/60">{rotulo}</span>
      <span className="text-right">{valor}</span>
    </div>
  );
}

function FichaDoLead({ lead }: { lead: ItemDaFila }) {
  const c = lead.contact;
  const fone = c?.phone ?? lead.phone ?? null;
  // wa.me com o WhatsApp do próprio SDR: o número do Nexa é o número das campanhas, e
  // ban da Meta nele não tem volta.
  //
  // Mesma checagem do `tel:`: sem ela, um campo de telefone com e-mail dentro abriria
  // `wa.me/` com os dígitos que sobrassem — pior que não ter botão, porque pode cair na
  // conversa de outra pessoa.
  const zap = podeDiscar(fone) ? `https://wa.me/${(fone as string).replace(/\D/g, '')}` : null;

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              {c?.company ?? lead.company ?? 'Empresa não informada'}
            </h2>
            <p className="text-sm text-base-content/70">
              {c?.name ?? lead.name ?? 'Sem nome'} {fone && `· ${fone}`}
            </p>
          </div>
          <div className="flex gap-2">
            {podeDiscar(fone) && (
              // `tel:` abre o discador do sistema ou o softphone. Sem telefonia dentro
              // do Nexa — é outro projeto, com regulação própria.
              //
              // `podeDiscar` e não `fone &&`: o campo é texto livre e guarda coisa que
              // não é telefone na base real. No meio de uma ligação, botão que abre o
              // discador com lixo custa o tempo que o SDR não tem.
              <a href={`tel:${fone}`}>
                <Button variant="outline" size="sm">
                  Ligar
                </Button>
              </a>
            )}
            {zap && (
              <a href={zap} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm">
                  WhatsApp
                </Button>
              </a>
            )}
            {c?.email && (
              <a href={`mailto:${c.email}`}>
                <Button variant="outline" size="sm">
                  E-mail
                </Button>
              </a>
            )}
          </div>
        </div>

        <div className="mt-4 border-t border-base-300 pt-3">
          <Linha rotulo="E-mail" valor={c?.email ?? null} />
          <Linha rotulo="Frota" valor={c?.fleetSize ? `${c.fleetSize} veículos` : null} />
          <Linha rotulo="Mercado" valor={lead.productCode} />
          <Linha rotulo="Veio da lista" valor={c?.batch?.name ?? null} />
          <Linha rotulo="Origem" valor={c?.batch?.source ?? null} />
        </div>
      </Card>

      <Card className="p-5">
        <p className="mb-2 text-sm font-medium">Histórico</p>
        {!lead.activities.length && (
          <p className="text-sm text-base-content/60">Nenhum contato ainda — a primeira ligação é sua.</p>
        )}
        <ul className="flex flex-col">
          {lead.activities.map((a) => (
            <li key={a.id} className="border-b border-base-200 py-2 text-sm last:border-0">
              <span className="text-base-content/50">
                {new Date(a.createdAt).toLocaleDateString('pt-BR')}
              </span>{' '}
              <span className="font-medium">{a.type}</span>
              {a.result && <span> · {ROTULO_RESULTADO[a.result] ?? a.result}</span>}
              {a.notes && <p className="mt-0.5 text-base-content/70">{a.notes}</p>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function BarraDeAcoes({
  lead,
  ocupado,
  onAcao,
  onNaoAtendeu,
}: {
  lead: ItemDaFila;
  ocupado: boolean;
  onAcao: (d: 'ligacao' | 'pausar' | 'descartar' | 'transferir') => void;
  onNaoAtendeu: () => void;
}) {
  return (
    // Fixa no rodapé: são os botões usados dezenas de vezes por dia, e posição
    // constante é o que deixa ele acertar sem olhar.
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-base-300 bg-base-100/95 p-3 backdrop-blur">
      <div className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-2">
        <span className="mr-2 hidden text-xs text-base-content/50 sm:inline">
          {lead.contact?.company ?? lead.company ?? 'lead atual'}
        </span>
        <Button size="sm" disabled={ocupado} onClick={() => onAcao('ligacao')}>
          Registrar contato
        </Button>
        <Button size="sm" variant="outline" disabled={ocupado} onClick={onNaoAtendeu}>
          Não atendeu
        </Button>
        <Button size="sm" variant="outline" disabled={ocupado} onClick={() => onAcao('pausar')}>
          Ligar depois
        </Button>
        <Button size="sm" variant="success" disabled={ocupado} onClick={() => onAcao('transferir')}>
          Passar pro closer
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={ocupado}
          className="ml-auto"
          onClick={() => onAcao('descartar')}
        >
          Descartar
        </Button>
      </div>
    </div>
  );
}

const RESULTADOS = [
  { valor: 'atendeu', rotulo: 'Atendeu e conversamos' },
  { valor: 'nao_atendeu', rotulo: 'Não atendeu' },
  { valor: 'numero_errado', rotulo: 'Número errado' },
  { valor: 'nao_e_decisor', rotulo: 'Não é quem decide' },
];

function DialogoLigacao({
  onFechar,
  salvando,
  onSalvar,
}: {
  onFechar: () => void;
  salvando: boolean;
  onSalvar: (d: { result: string; notes?: string; type?: 'call' | 'whatsapp' | 'email' }) => void;
}) {
  const [tipo, setTipo] = useState<'call' | 'whatsapp' | 'email'>('call');
  const [resultado, setResultado] = useState('atendeu');
  const [notas, setNotas] = useState('');

  return (
    <Modal
      open
      onClose={onFechar}
      title="Registrar contato"
      footer={
        <>
          <Button variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            loading={salvando}
            onClick={() => onSalvar({ result: resultado, notes: notas || undefined, type: tipo })}
          >
            Salvar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          {(['call', 'whatsapp', 'email'] as const).map((t) => (
            <Button
              key={t}
              size="sm"
              variant={tipo === t ? 'primary' : 'outline'}
              onClick={() => setTipo(t)}
            >
              {t === 'call' ? 'Ligação' : t === 'whatsapp' ? 'WhatsApp' : 'E-mail'}
            </Button>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Como foi</Label>
          <div className="flex flex-col gap-1">
            {RESULTADOS.map((r) => (
              <label key={r.valor} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="resultado"
                  checked={resultado === r.valor}
                  onChange={() => setResultado(r.valor)}
                />
                {r.rotulo}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notas">Anotação</Label>
          <Textarea
            id="notas"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="O que ele falou — é o que o closer vai ler antes da reunião."
          />
        </div>
      </div>
    </Modal>
  );
}

function DialogoPausa({
  onFechar,
  salvando,
  onSalvar,
}: {
  onFechar: () => void;
  salvando: boolean;
  onSalvar: (d: { retornoEm: string; notes?: string }) => void;
}) {
  const [quando, setQuando] = useState('');
  const [notas, setNotas] = useState('');

  return (
    <Modal
      open
      onClose={onFechar}
      title="Ligar depois"
      footer={
        <>
          <Button variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            loading={salvando}
            disabled={!quando}
            onClick={() => onSalvar({ retornoEm: new Date(quando).toISOString(), notes: notas || undefined })}
          >
            Marcar retorno
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="quando">Quando voltar a ligar</Label>
          <Input
            id="quando"
            type="datetime-local"
            value={quando}
            onChange={(e) => setQuando(e.target.value)}
          />
          <p className="text-xs text-base-content/50">
            Sai da sua fila até a data. Na hora, volta no topo — quem pediu para ser
            chamado está esperando.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notas-pausa">Por quê</Label>
          <Textarea
            id="notas-pausa"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Pediu para ligar depois do dia 20, quando fecha o mês."
          />
        </div>
      </div>
    </Modal>
  );
}

const MOTIVOS_DESCARTE = [
  { valor: 'sem_fit', rotulo: 'Não tem perfil' },
  { valor: 'sem_resposta', rotulo: 'Nunca respondeu' },
  { valor: 'concorrente', rotulo: 'Já usa concorrente e não quer trocar' },
  { valor: 'numero_errado', rotulo: 'Contato errado / não existe' },
  { valor: 'outro', rotulo: 'Outro' },
];

function DialogoDescarte({
  onFechar,
  salvando,
  onSalvar,
}: {
  onFechar: () => void;
  salvando: boolean;
  onSalvar: (d: { motivo: string; notes?: string }) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [notas, setNotas] = useState('');

  return (
    <Modal
      open
      onClose={onFechar}
      title="Descartar lead"
      footer={
        <>
          <Button variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            loading={salvando}
            // Motivo é obrigatório: sem ele, depois ninguém sabe se a lista era ruim
            // ou se a abordagem era.
            disabled={!motivo}
            onClick={() => onSalvar({ motivo, notes: notas || undefined })}
          >
            Descartar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Label>Motivo</Label>
          {MOTIVOS_DESCARTE.map((m) => (
            <label key={m.valor} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="motivo"
                checked={motivo === m.valor}
                onChange={() => setMotivo(m.valor)}
              />
              {m.rotulo}
            </label>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notas-descarte">Observação</Label>
          <Textarea
            id="notas-descarte"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}

function DialogoTransferencia({
  productCode,
  onFechar,
  salvando,
  onSalvar,
}: {
  productCode: string | null;
  onFechar: () => void;
  salvando: boolean;
  onSalvar: (d: {
    closerId: string;
    meetingAt?: string;
    meetingUrl?: string;
    notes?: string;
  }) => void;
}) {
  const [closerId, setCloserId] = useState('');
  const [quando, setQuando] = useState('');
  const [link, setLink] = useState('');
  const [notas, setNotas] = useState('');

  const { data: closers = [], isLoading } = useQuery<Closer[]>({
    queryKey: ['sdr', 'closers', productCode],
    queryFn: () => listClosers(productCode as string),
    enabled: !!productCode,
  });

  return (
    <Modal
      open
      onClose={onFechar}
      title="Passar pro closer"
      footer={
        <>
          <Button variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            variant="success"
            loading={salvando}
            disabled={!closerId}
            onClick={() =>
              onSalvar({
                closerId,
                meetingAt: quando ? new Date(quando).toISOString() : undefined,
                meetingUrl: link || undefined,
                notes: notas || undefined,
              })
            }
          >
            Passar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="closer">Quem vai atender</Label>
          <select
            id="closer"
            value={closerId}
            onChange={(e) => setCloserId(e.target.value)}
            className="h-9 w-full rounded-md border border-base-300 bg-white px-3 text-sm text-base-content shadow-sm outline-none focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/30"
          >
            <option value="">{isLoading ? 'Carregando…' : 'Escolha…'}</option>
            {closers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {!isLoading && !closers.length && (
            <p className="text-xs text-amber-700">
              Ninguém está vinculado a este mercado ainda — o admin precisa liberar
              alguém antes.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reuniao">Reunião marcada (opcional)</Label>
          <Input
            id="reuniao"
            type="datetime-local"
            value={quando}
            onChange={(e) => setQuando(e.target.value)}
          />
          <Input
            placeholder="Link da reunião (opcional)"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notas-transf">O que o closer precisa saber</Label>
          <Textarea
            id="notas-transf"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Emite 400 CT-e por mês, usa planilha hoje, quem decide é o sócio."
          />
        </div>

        <p className="text-xs text-base-content/50">
          O lead sai da sua fila ativa e continua no seu histórico — é o registro que
          sustenta sua comissão.
        </p>
      </div>
    </Modal>
  );
}
