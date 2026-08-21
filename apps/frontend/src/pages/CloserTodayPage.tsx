import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Input,
  Label,
  Modal,
  PageContainer,
  PageHeader,
  Textarea,
} from '@/shared/ui';
import { useToast } from '@/app/providers/ToastContext';
import { podeDiscar } from '@/shared/lib/dialable';
import {
  canalPeloIdentificador,
  emailDoIdentificador,
  identidadeVisivel,
} from '@/shared/lib/conversation';
import {
  adiarNegocio,
  getPainelDeHoje,
  listMaterialAprovado,
  marcarGanho,
  marcarPerda,
  reagendarReuniao,
  registrarProposta,
  MOTIVOS_PERDA,
  ROTULO_BLOCO,
  SUBTITULO_BLOCO,
  type Bloco,
  type Negocio,
  type PainelDeHoje,
} from '@/entities/closer';

type Acao = 'proposta' | 'reagendar' | 'ganhou' | 'perdeu' | 'adiar';

const ORDEM: Bloco[] = ['agora', 'precisa_de_voce', 'esperando'];

/// Canal de origem no card. Curto porque divide a linha com estágio, valor e horário.
const ROTULO_CANAL: Record<'email' | 'whatsapp' | 'web', string> = {
  email: 'e-mail',
  whatsapp: 'WhatsApp',
  web: 'web chat',
};

/**
 * Painel do closer (módulo 3). A aba padrão é o DIA, não um kanban.
 *
 * Kanban responde "como está meu pipeline". O closer com quinze negócios abertos
 * acorda com "o que eu faço hoje?" — e um quadro obriga a varrer quatro colunas pra
 * descobrir que tem reunião às 15h.
 *
 * Quem classifica os blocos é o backend; aqui só se rotula e renderiza.
 */
export function CloserTodayPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [alvo, setAlvo] = useState<{ negocio: Negocio; acao: Acao } | null>(null);

  const { data: painel, isLoading } = useQuery<PainelDeHoje>({
    queryKey: ['closer', 'today'],
    queryFn: getPainelDeHoje,
  });

  function ok(msg: string) {
    toast.success(msg);
    setAlvo(null);
    qc.invalidateQueries({ queryKey: ['closer', 'today'] });
  }

  function erro(e: any, fallback: string) {
    toast.error(e?.response?.data?.message ?? fallback);
  }

  const proposta = useMutation({
    mutationFn: (d: { valor: number; notes?: string }) =>
      registrarProposta(alvo!.negocio.id, d.valor, d.notes),
    onSuccess: () => ok('Proposta registrada.'),
    onError: (e) => erro(e, 'Não foi possível registrar a proposta.'),
  });

  const reagendar = useMutation({
    mutationFn: (d: { meetingAt: string; meetingUrl?: string; notes?: string }) =>
      reagendarReuniao(alvo!.negocio.id, d.meetingAt, d.meetingUrl, d.notes),
    onSuccess: () => ok('Reunião remarcada.'),
    onError: (e) => erro(e, 'Não foi possível remarcar.'),
  });

  const ganhou = useMutation({
    mutationFn: (d: { valor?: number; notes?: string }) =>
      marcarGanho(alvo!.negocio.id, d.valor, d.notes),
    onSuccess: () => ok('Fechado. O contato já entra como cliente.'),
    onError: (e) => erro(e, 'Não foi possível marcar como ganho.'),
  });

  const perdeu = useMutation({
    mutationFn: (d: { motivo: string; notes?: string }) =>
      marcarPerda(alvo!.negocio.id, d.motivo, d.notes),
    onSuccess: () => ok('Registrado como perdido.'),
    onError: (e) => erro(e, 'Não foi possível registrar a perda.'),
  });

  const adiar = useMutation({
    mutationFn: (d: { voltarEm: string; motivo: string; notes?: string }) =>
      adiarNegocio(alvo!.negocio.id, d.voltarEm, d.motivo, d.notes),
    onSuccess: () => ok('Volta pro painel na data marcada.'),
    onError: (e) => erro(e, 'Não foi possível adiar.'),
  });

  const vazio =
    painel && ORDEM.every((b) => !painel[b]?.length);

  /**
   * Os números do dia.
   *
   * A tela entregava três listas e não somava nada. Para o SDR isso não faria
   * falta — o trabalho dele é lead a lead. Para quem FECHA, valor é a unidade de
   * trabalho: "quanto está na rua" é a pergunta que ele responde ao gerente, e
   * até agora só dava para responder contando card na mão.
   *
   * Contados do que já está na tela, sem pedir nada novo ao servidor. Reuniões é o
   * tamanho do bloco AGORA; em proposta soma todo negócio aberto em `proposal`,
   * esteja ele em qualquer bloco — proposta parada continua sendo dinheiro na rua.
   */
  const numerosDoDia = (() => {
    if (!painel) return null;
    const todos = ORDEM.flatMap((b) => painel[b] ?? []);
    const emProposta = todos.filter((n) => n.stage === 'proposal');
    const soma = emProposta.reduce((t, n) => t + Number(n.value ?? 0), 0);
    return {
      reunioes: (painel.agora ?? []).length,
      propostas: emProposta.length,
      // Sem valor somado não se inventa "R$ 0": proposta sem valor registrado é
      // dado faltando, e mostrar zero afirmaria que ela não vale nada.
      valorEmProposta: soma > 0 ? moeda(soma) : null,
      parados: (painel.precisa_de_voce ?? []).length,
    };
  })();

  return (
    <PageContainer>
      <PageHeader
        title="Hoje"
        subtitle="O que tem hora marcada, o que parou, e o que só precisa de paciência."
      />

      {/* Some quando não há nada aberto: linha de zeros embaixo de "nenhum negócio"
          é ruído repetindo o que a tela já disse. */}
      {!!numerosDoDia && !vazio && (
        <Card className="mb-4 flex flex-wrap items-center gap-x-8 gap-y-2 px-5 py-3">
          <NumeroDoDia rotulo="reuniões hoje" valor={String(numerosDoDia.reunioes)} />
          <NumeroDoDia rotulo="esperando você" valor={String(numerosDoDia.parados)} />
          <NumeroDoDia
            rotulo={numerosDoDia.propostas === 1 ? 'proposta na rua' : 'propostas na rua'}
            valor={
              numerosDoDia.valorEmProposta
                ? `${numerosDoDia.propostas} · ${numerosDoDia.valorEmProposta}`
                : String(numerosDoDia.propostas)
            }
          />
        </Card>
      )}

      {isLoading && (
        <Card className="p-6 text-sm text-base-content/60">Carregando seu dia…</Card>
      )}

      {vazio && (
        <Card className="p-6 text-sm text-base-content/60">
          Nenhum negócio aberto. Quando o SDR passar um lead, ele aparece aqui.
        </Card>
      )}

      {painel &&
        ORDEM.map((bloco) => {
          const itens = painel[bloco] ?? [];
          // Bloco vazio não vira card: três cabeçalhos vazios empurram o que importa
          // pra baixo da dobra.
          if (!itens.length) return null;
          return (
            <Card key={bloco} className="p-5">
              <div className="mb-3">
                <p className="text-sm font-semibold">
                  {ROTULO_BLOCO[bloco]}
                  <span className="ml-2 text-xs font-normal text-base-content/50">
                    {itens.length}
                  </span>
                </p>
                <p className="text-xs text-base-content/60">{SUBTITULO_BLOCO[bloco]}</p>
              </div>
              <ul className="flex flex-col">
                {itens.map((n) => (
                  <LinhaNegocio
                    key={n.id}
                    negocio={n}
                    onAcao={(acao) => setAlvo({ negocio: n, acao })}
                  />
                ))}
              </ul>
            </Card>
          );
        })}

      {alvo?.acao === 'proposta' && (
        <DialogoProposta
          negocio={alvo.negocio}
          salvando={proposta.isPending}
          onFechar={() => setAlvo(null)}
          onSalvar={(d) => proposta.mutate(d)}
        />
      )}
      {alvo?.acao === 'reagendar' && (
        <DialogoReagendar
          salvando={reagendar.isPending}
          onFechar={() => setAlvo(null)}
          onSalvar={(d) => reagendar.mutate(d)}
        />
      )}
      {alvo?.acao === 'ganhou' && (
        <DialogoGanho
          negocio={alvo.negocio}
          salvando={ganhou.isPending}
          onFechar={() => setAlvo(null)}
          onSalvar={(d) => ganhou.mutate(d)}
        />
      )}
      {alvo?.acao === 'perdeu' && (
        <DialogoPerda
          salvando={perdeu.isPending}
          onFechar={() => setAlvo(null)}
          onSalvar={(d) => perdeu.mutate(d)}
        />
      )}
      {alvo?.acao === 'adiar' && (
        <DialogoAdiar
          salvando={adiar.isPending}
          onFechar={() => setAlvo(null)}
          onSalvar={(d) => adiar.mutate(d)}
        />
      )}
    </PageContainer>
  );
}

/** Um número do dia: valor grande, rótulo pequeno embaixo. */
function NumeroDoDia({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="text-lg font-semibold tabular-nums text-base-content">{valor}</p>
      <p className="text-[11px] text-base-content/50">{rotulo}</p>
    </div>
  );
}

function moeda(v: string | number | null): string | null {
  if (v === null || v === '') return null;
  const n = typeof v === 'string' ? Number(v) : v;
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function hora(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function LinhaNegocio({
  negocio: n,
  onAcao,
}: {
  negocio: Negocio;
  onAcao: (acao: Acao) => void;
}) {
  const valor = moeda(n.value);
  const reuniao = hora(n.meetingAt);
  const volta = hora(n.pausedUntil);
  const canal = canalPeloIdentificador(n.phone);
  const email = emailDoIdentificador(n.phone);
  const [contexto, setContexto] = useState(false);
  // Mais recente primeiro (backend já ordena): a nota que importa é a do handoff, não
  // a primeira ligação que o SDR fez há três semanas.
  const notaDoSdr = n.activities.find((a) => a.result === 'passou_closer')?.notes ?? null;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-base-200 py-3 last:border-0">
      <div className="min-w-0">
        {/* O identificador entra na cascata ANTES do "Sem nome": lead que chegou por
            e-mail não tem empresa nem nome preenchidos, e o card virava "Sem nome" sem
            empresa, sem telefone e sem nada para o closer agir. O endereço de e-mail é
            uma identidade de verdade — some do card só o que não existe. */}
        {/* `||` e não `??` no último degrau: `identidadeVisivel` devolve string VAZIA
            quando não tem nada verdadeiro a dizer, e `??` só cai em null/undefined —
            deixaria o título em branco em vez de "Sem nome". */}
        <p className="truncate text-sm font-medium">
          {n.company ?? n.name ?? (identidadeVisivel(n.phone) || 'Sem nome')}
        </p>
        <p className="text-xs text-base-content/60">
          {canal && <span className="mr-1 rounded bg-base-200 px-1.5 py-0.5">{ROTULO_CANAL[canal]}</span>}
          {n.stage === 'proposal' ? 'proposta' : n.stage === 'paused' ? 'adiado' : 'reunião'}
          {valor && ` · ${valor}`}
          {reuniao && ` · ${reuniao}`}
          {volta && ` · volta ${volta}`}
          {n.productCode && ` · ${n.productCode}`}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {n.meetingUrl && (
          <a href={n.meetingUrl} target="_blank" rel="noreferrer">
            <Button size="xs" variant="outline">
              Entrar
            </Button>
          </a>
        )}
        {/* `podeDiscar` e não `n.phone`: o campo é texto livre e na base real guarda
            coisa que não é telefone. Botão que abre o discador com lixo é pior que botão
            ausente — o closer clica, não funciona, e não sabe se o problema é o número
            ou o sistema. */}
        {podeDiscar(n.phone) && (
          <a href={`tel:${n.phone}`}>
            <Button size="xs" variant="outline">
              Ligar
            </Button>
          </a>
        )}
        {/* Lead de e-mail não tem para onde ligar. Sem este botão o card só oferecia
            ações de DESFECHO (ganhou/perdeu/adiar) e nenhuma de contato — o closer
            tinha que sair do sistema para responder. */}
        {email && (
          <a href={`mailto:${email}`}>
            <Button size="xs" variant="outline">
              E-mail
            </Button>
          </a>
        )}
        {/* Nota do SDR e material do mercado (roteiro/portfólio aprovados) — vivia
            gravado e ninguém buscava de volta neste painel (19/08/2026). Selo só
            quando há nota: sem lead nenhum não fica sinalizado à toa. */}
        <Button size="xs" variant="outline" onClick={() => setContexto(true)}>
          Contexto{notaDoSdr && ' 📝'}
        </Button>
        <Button size="xs" variant="outline" onClick={() => onAcao('reagendar')}>
          Remarcar
        </Button>
        <Button size="xs" variant="outline" onClick={() => onAcao('proposta')}>
          Proposta
        </Button>
        <Button size="xs" variant="ghost" onClick={() => onAcao('adiar')}>
          Adiar
        </Button>

        {/* Daqui para a direita, o negócio ACABA.
            Antes "Ganhou" e "Perdeu" dividiam a fileira com "Adiar" e "Remarcar",
            no mesmo tamanho e encostados — rotina e ponto final indistinguíveis.
            Um clique errado em "Perdeu" tira o negócio do funil, e a única defesa
            era a pontaria. O separador não impede o clique; deixa visível que
            aquele lado da linha é outro tipo de decisão. */}
        <span className="mx-1 h-4 w-px shrink-0 self-center bg-base-300" aria-hidden />
        <Button size="xs" variant="success" onClick={() => onAcao('ganhou')}>
          Ganhou
        </Button>
        <Button
          size="xs"
          variant="ghost"
          className="text-red-500 hover:bg-red-50 dark:hover:bg-red-500/15"
          onClick={() => onAcao('perdeu')}
        >
          Perdeu
        </Button>
      </div>

      {contexto && (
        <ModalContexto
          nome={n.company ?? n.name ?? 'este lead'}
          notaDoSdr={notaDoSdr}
          productCode={n.productCode}
          onFechar={() => setContexto(false)}
        />
      )}
    </li>
  );
}

/**
 * Nota do handoff + material do mercado, num modal — não no card, que já divide
 * espaço com estágio, valor e cinco botões de ação.
 */
function ModalContexto({
  nome,
  notaDoSdr,
  productCode,
  onFechar,
}: {
  nome: string;
  notaDoSdr: string | null;
  productCode: string | null;
  onFechar: () => void;
}) {
  const { data: itens = [], isLoading } = useQuery({
    queryKey: ['closer', 'material-aprovado', productCode],
    queryFn: () => listMaterialAprovado(productCode as string),
    enabled: !!productCode,
  });

  const planos = itens.filter((i) => i.kind === 'plan');
  const portfolios = itens.filter((i) => i.kind === 'portfolio');

  return (
    <Modal open onClose={onFechar} title={`Contexto — ${nome}`}>
      <div className="flex flex-col gap-4">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-base-content/50">
            O que o SDR deixou ao passar o lead
          </p>
          <p className="text-sm text-base-content/90">
            {notaDoSdr ?? 'O SDR não deixou nota nesta transferência.'}
          </p>
        </div>

        <div className="border-t border-base-200 pt-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-base-content/50">
            Material do mercado (aprovado)
          </p>
          {!productCode && (
            <p className="text-sm text-base-content/60">Este negócio não tem mercado.</p>
          )}
          {productCode && isLoading && (
            <p className="text-sm text-base-content/60">Carregando…</p>
          )}
          {productCode && !isLoading && !itens.length && (
            <p className="text-sm text-base-content/60">
              Nada aprovado ainda para este mercado na Validação de Campanha.
            </p>
          )}
          {planos.map((p) => (
            <details key={p.id} className="border-b border-base-200 py-1.5 last:border-0" open>
              <summary className="cursor-pointer text-sm">{p.name}</summary>
              <p className="whitespace-pre-wrap pt-1 text-xs leading-relaxed text-base-content/80">
                {p.content}
              </p>
            </details>
          ))}
          {portfolios.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {portfolios.map((p) => (
                <a key={p.id} href={p.fileUrl ?? '#'} target="_blank" rel="noreferrer">
                  <Button size="xs" variant="outline">
                    📎 {p.name}
                  </Button>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Rodape({
  onFechar,
  onSalvar,
  salvando,
  desabilitado,
  rotulo,
  variante = 'primary',
}: {
  onFechar: () => void;
  onSalvar: () => void;
  salvando: boolean;
  desabilitado?: boolean;
  rotulo: string;
  variante?: 'primary' | 'success' | 'destructive';
}) {
  return (
    <>
      <Button variant="ghost" onClick={onFechar}>
        Cancelar
      </Button>
      <Button variant={variante} loading={salvando} disabled={desabilitado} onClick={onSalvar}>
        {rotulo}
      </Button>
    </>
  );
}

function DialogoProposta({
  negocio,
  salvando,
  onFechar,
  onSalvar,
}: {
  negocio: Negocio;
  salvando: boolean;
  onFechar: () => void;
  onSalvar: (d: { valor: number; notes?: string }) => void;
}) {
  const [valor, setValor] = useState(negocio.value ? String(Number(negocio.value)) : '');
  const [notas, setNotas] = useState('');
  const n = Number(valor);

  const valido = valor !== '' && Number.isFinite(n) && n >= 0;

  return (
    <Modal
      open
      onClose={onFechar}
      title="Registrar proposta"
      footer={
        <Rodape
          onFechar={onFechar}
          salvando={salvando}
          desabilitado={!valido}
          rotulo="Registrar"
          onSalvar={() => onSalvar({ valor: n, notes: notas || undefined })}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="valor">Valor mensal proposto</Label>
          <Input
            id="valor"
            type="number"
            min={0}
            step="0.01"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="1200"
          />
          <p className="text-xs text-base-content/50">
            Valor estimado de pipeline. Sem ele o relatório só diz “fechou 3”, sem
            distinguir 3 de R$ 200 de 3 de R$ 50.000.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notas-prop">Observação</Label>
          <Textarea id="notas-prop" value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

function DialogoReagendar({
  salvando,
  onFechar,
  onSalvar,
}: {
  salvando: boolean;
  onFechar: () => void;
  onSalvar: (d: { meetingAt: string; meetingUrl?: string; notes?: string }) => void;
}) {
  const [quando, setQuando] = useState('');
  const [link, setLink] = useState('');
  const [notas, setNotas] = useState('');

  return (
    <Modal
      open
      onClose={onFechar}
      title="Remarcar reunião"
      footer={
        <Rodape
          onFechar={onFechar}
          salvando={salvando}
          desabilitado={!quando}
          rotulo="Remarcar"
          onSalvar={() =>
            onSalvar({
              meetingAt: new Date(quando).toISOString(),
              meetingUrl: link || undefined,
              notes: notas || undefined,
            })
          }
        />
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="quando-r">Nova data e hora</Label>
          <Input
            id="quando-r"
            type="datetime-local"
            value={quando}
            onChange={(e) => setQuando(e.target.value)}
          />
          <p className="text-xs text-base-content/50">
            Remarcar não muda a etapa do negócio — não é avanço, é a mesma conversa em
            outro dia.
          </p>
        </div>
        <Input
          placeholder="Link da reunião (opcional)"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
        <Textarea
          placeholder="Por que remarcou"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
        />
      </div>
    </Modal>
  );
}

function DialogoGanho({
  negocio,
  salvando,
  onFechar,
  onSalvar,
}: {
  negocio: Negocio;
  salvando: boolean;
  onFechar: () => void;
  onSalvar: (d: { valor?: number; notes?: string }) => void;
}) {
  const [valor, setValor] = useState(negocio.value ? String(Number(negocio.value)) : '');
  const [notas, setNotas] = useState('');
  const n = Number(valor);
  /**
   * Sem proposta anterior, o valor é OBRIGATÓRIO — não há o que "manter em branco".
   *
   * O negócio fechado direto na reunião (o SDR passou, o closer fechou, nunca houve
   * proposta registrada) saía com `value` nulo: o funil registrava a vitória e não
   * sabia quanto entrou. Some do relatório de receita por lista, por mercado e por
   * closer — e justamente nos fechados no impulso, que costumam ser os melhores.
   *
   * Com proposta, o comportamento antigo continua: em branco mantém o que já estava.
   */
  const temProposta = negocio.value != null && Number(negocio.value) > 0;
  const valorInformado = valor !== '' && Number.isFinite(n) && n > 0;
  const faltaValor = !temProposta && !valorInformado;

  return (
    <Modal
      open
      onClose={onFechar}
      title={`Fechou com ${negocio.company ?? negocio.name ?? 'este lead'}?`}
      footer={
        <Rodape
          onFechar={onFechar}
          salvando={salvando}
          variante="success"
          rotulo="Confirmar venda"
          desabilitado={faltaValor}
          onSalvar={() =>
            onSalvar({
              valor: valor !== '' && Number.isFinite(n) ? n : undefined,
              notes: notas || undefined,
            })
          }
        />
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="valor-final">Valor fechado</Label>
          <Input
            id="valor-final"
            type="number"
            min={0}
            step="0.01"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
          {/* O texto muda com a situação: "mantém o valor da proposta" não quer
              dizer nada quando não existe proposta para manter. */}
          <p className={`text-xs ${faltaValor ? 'text-amber-600 dark:text-amber-400' : 'text-base-content/50'}`}>
            {temProposta
              ? 'Em branco mantém o valor da proposta.'
              : 'Este negócio fechou sem proposta registrada — informe o valor, senão a venda entra no funil sem receita.'}
          </p>
        </div>
        <Textarea
          placeholder="Observação"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
        />
        <p className="text-xs text-base-content/60">
          O contato passa a contar como cliente na hora — então ele não entra mais em
          lista de prospecção, mesmo antes de aparecer no TMS.
        </p>
      </div>
    </Modal>
  );
}

function EscolhaMotivo({
  motivo,
  onMotivo,
}: {
  motivo: string;
  onMotivo: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label>Motivo</Label>
      {MOTIVOS_PERDA.map((m) => (
        <label key={m.valor} className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="motivo-perda"
            checked={motivo === m.valor}
            onChange={() => onMotivo(m.valor)}
          />
          {m.rotulo}
        </label>
      ))}
    </div>
  );
}

function DialogoPerda({
  salvando,
  onFechar,
  onSalvar,
}: {
  salvando: boolean;
  onFechar: () => void;
  onSalvar: (d: { motivo: string; notes?: string }) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [notas, setNotas] = useState('');

  return (
    <Modal
      open
      onClose={onFechar}
      title="Negócio perdido"
      footer={
        <Rodape
          onFechar={onFechar}
          salvando={salvando}
          variante="destructive"
          desabilitado={!motivo}
          rotulo="Registrar perda"
          onSalvar={() => onSalvar({ motivo, notes: notas || undefined })}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <EscolhaMotivo motivo={motivo} onMotivo={setMotivo} />
        <Textarea
          placeholder="O que aconteceu"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
        />
        <p className="text-xs text-base-content/60">
          Se foi só questão de momento — “sem orçamento agora” — use <b>Adiar</b>: o
          negócio volta na data em vez de morrer.
        </p>
      </div>
    </Modal>
  );
}

function DialogoAdiar({
  salvando,
  onFechar,
  onSalvar,
}: {
  salvando: boolean;
  onFechar: () => void;
  onSalvar: (d: { voltarEm: string; motivo: string; notes?: string }) => void;
}) {
  const [quando, setQuando] = useState('');
  const [motivo, setMotivo] = useState('');
  const [notas, setNotas] = useState('');

  return (
    <Modal
      open
      onClose={onFechar}
      title="Adiar negócio"
      footer={
        <Rodape
          onFechar={onFechar}
          salvando={salvando}
          desabilitado={!quando || !motivo}
          rotulo="Adiar"
          onSalvar={() =>
            onSalvar({
              voltarEm: new Date(quando).toISOString(),
              motivo,
              notes: notas || undefined,
            })
          }
        />
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="volta">Quando retomar</Label>
          <Input
            id="volta"
            type="datetime-local"
            value={quando}
            onChange={(e) => setQuando(e.target.value)}
          />
          <p className="text-xs text-base-content/50">
            Sai do painel até a data. Na hora, volta em “Precisa de você”.
          </p>
        </div>
        <EscolhaMotivo motivo={motivo} onMotivo={setMotivo} />
        <Textarea
          placeholder="Contexto para quando voltar"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
        />
      </div>
    </Modal>
  );
}
