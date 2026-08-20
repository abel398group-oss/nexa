import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, PageContainer, PageHeader, Breadcrumb, Icon, StatusBadge } from '@/shared/ui';
import { useToast } from '@/app/providers/ToastContext';
import { useConfirm } from '@/app/providers/ConfirmContext';
import { api } from '@/shared/lib/api';
import { listMarkets } from '@/entities/market';
import { marketPadrao, useMarketAtivo } from '@/shared/lib/marketAtivo';
import {
  listTemplates, createTemplate, archiveTemplate, deleteTemplate, deleteAllTemplates,
  approveTemplate, unapproveTemplate,
  previewTemplate, sendTemplateTest, rascunharModelos,
  type MessageTemplate, type TemplatePreview, type RascunhoDeModelo,
} from '@/entities/message-template';

/**
 * Biblioteca de mensagens do mercado (ADR 037).
 *
 * O fluxo que esta tela serve: a pessoa escreve a campanha numa IA de fora, cola
 * aqui, GERA O TESTE e só então salva. O valor de trazer o texto para dentro do Nexa
 * é ver como ele chega — ler markdown não mostra que o asterisco vai sair literal no
 * WhatsApp, nem que o assunto foi cortado pelo Gmail.
 */

/** Aviso do teste: erro em vermelho, aviso em âmbar. */
function Aviso({ gravidade, texto }: { gravidade: string; texto: string }) {
  const erro = gravidade === 'erro';
  return (
    <div className="flex items-start gap-2 py-1">
      <Icon name="alert" className={`mt-0.5 h-4 w-4 shrink-0 ${erro ? 'text-red-500' : 'text-amber-500'}`} />
      <span className="text-xs text-base-content/70">{texto}</span>
    </div>
  );
}

export function MessageTemplatesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();

  const [canal, setCanal] = useState<'email' | 'whatsapp'>('email');
  const [nome, setNome] = useState('');
  const [assunto, setAssunto] = useState('');
  const [corpo, setCorpo] = useState('');
  const [passo, setPasso] = useState(1);
  const [previa, setPrevia] = useState<TemplatePreview | null>(null);
  /// Propostas vindas do roteiro aprovado. Vivem só na tela: escolher uma joga o
  /// texto no formulário, e a partir daí é o mesmo caminho de sempre — ler, testar,
  /// salvar. Nada aqui está gravado.
  const [rascunhos, setRascunhos] = useState<RascunhoDeModelo[]>([]);
  /// Qual proposta está no formulário agora. É o que substitui o antigo "some tudo":
  /// destacar a escolhida resolve a confusão sem destruir as outras três.
  const [rascunhoAtivo, setRascunhoAtivo] = useState<number | null>(null);
  /// Quais já viraram modelo salvo. Sem esta marca, salvar quatro mensagens de uma
  /// cadência vira contar nos dedos qual já foi — e salvar a mesma duas vezes.
  const [rascunhosSalvos, setRascunhosSalvos] = useState<Set<number>>(new Set());
  /// Frases recusadas, uma por linha. Vive no playbook (é configuração de voz), mas
  /// é editada AQUI porque é aqui que se percebe o que proibir — ler o texto ruim e
  /// ter de procurar outra tela para bani-lo é o atrito que faz ninguém banir nada.
  const [evitar, setEvitar] = useState('');
  const [evitarAberto, setEvitarAberto] = useState(false);

  const { data: mercados = [] } = useQuery({ queryKey: ['markets'], queryFn: () => listMarkets(false) });
  // O market vem do cabeçalho do cockpit, compartilhado com as outras abas. Antes
  // era um `useState` local por aba, e a escolha derivava entre elas.
  const [codigo, setMercado] = useMarketAtivo(marketPadrao(mercados));

  const { data: modelos = [] } = useQuery({
    queryKey: ['message-templates', codigo],
    queryFn: () => listTemplates(codigo || undefined),
    enabled: !!codigo,
  });

  const gerar = useMutation({
    mutationFn: () => previewTemplate({ productCode: codigo, channel: canal, subject: assunto, body: corpo }),
    onSuccess: setPrevia,
    onError: () => toast.error('Não consegui gerar o teste.'),
  });

  // Carrega a lista uma vez. Falhar aqui não trava a tela: sem lista, o gerador cai
  // nas regras gerais de tom, que é como ele funcionava antes de o campo existir.
  useQuery({
    queryKey: ['playbook', 'avoid'],
    queryFn: async () => {
      const r = await api.get('/playbook');
      setEvitar(r.data?.avoidPhrases ?? '');
      return r.data;
    },
  });

  const salvarEvitar = useMutation({
    // PUT parcial: o servidor só toca no campo enviado, então mandar a lista sozinha
    // não apaga persona, CTAs nem objeções.
    mutationFn: () => api.put('/playbook', { avoidPhrases: evitar }),
    onSuccess: () => toast.success('Lista salva. Vale a partir da próxima geração.'),
    onError: () => toast.error('Não consegui salvar a lista.'),
  });

  /// Lê o roteiro aprovado do mercado e propõe a cadência. Não grava nada — quem
  /// salva continua sendo quem lê.
  const rascunhar = useMutation({
    mutationFn: () => rascunharModelos({ productCode: codigo, channel: canal, quantos: 4 }),
    onSuccess: (r) => {
      setRascunhos(r);
      // Marcas zeradas: são propostas NOVAS, e um "✓ salva" herdado da geração
      // anterior apontaria para um texto que não existe mais na tela.
      setRascunhoAtivo(null);
      setRascunhosSalvos(new Set());
      toast.success(`${r.length} proposta(s) a partir do roteiro aprovado. Escolha uma para editar.`);
    },
    // A mensagem do servidor é específica ("este mercado não tem roteiro aprovado"),
    // e trocá-la por um genérico manda a pessoa procurar defeito no lugar errado.
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Não consegui rascunhar as mensagens.'),
  });

  /**
   * Joga a proposta no formulário. A partir daqui é o caminho de sempre: ler,
   * "Gerar teste", salvar.
   *
   * A lista FICA (20/08/2026). Ela sumia ao escolher a primeira, para a tela não
   * sugerir que o formulário ainda era "a proposta número 2" — o que resolvia uma
   * confusão de leitura criando um problema pior: são quatro mensagens de uma
   * cadência, feitas para serem salvas as quatro, e apagar as outras três obrigava a
   * gerar tudo de novo (pagando outra chamada) para pegar a segunda.
   *
   * O que evita a confusão é destacar qual está no formulário, não esconder o resto.
   */
  function usarRascunho(i: number) {
    const r = rascunhos[i];
    if (!r) return;
    setNome(r.name);
    setAssunto(r.subject);
    setCorpo(r.body);
    setPasso(r.step);
    setPrevia(null); // a prévia é do texto ANTERIOR; deixá-la seria mostrar outra mensagem
    setRascunhoAtivo(i);
  }

  const salvar = useMutation({
    mutationFn: () =>
      createTemplate({ productCode: codigo, name: nome, channel: canal, subject: assunto, body: corpo, step: passo }),
    onSuccess: () => {
      // Nasce rascunho (20/08/2026): o texto que o LEAD recebe agora passa por
      // revisão, como o material de campanha. Dizer "já aparece no Disparo" aqui
      // seria a mentira antiga com sinal trocado.
      toast.success('Modelo salvo como rascunho. Aprove-o na lista abaixo para aparecer no Disparo.');
      // Marca a proposta que acabou de virar modelo, ANTES de limpar o formulário:
      // é o que deixa a lista mostrar o que já foi salvo enquanto se trabalha a
      // cadência inteira, em vez de obrigar a contar nos dedos.
      if (rascunhoAtivo !== null) {
        setRascunhosSalvos((s) => new Set(s).add(rascunhoAtivo));
        setRascunhoAtivo(null);
      }
      setNome(''); setAssunto(''); setCorpo(''); setPrevia(null);
      void qc.invalidateQueries({ queryKey: ['message-templates', codigo] });
      // "Nenhuma mensagem pronta" é uma das quatro travas de liberação, e ela é
      // calculada dentro do `readiness` que vem junto da lista de mercados. Sem
      // invalidar aqui, o operador salva o primeiro modelo, volta para Markets e
      // continua lendo que falta modelo — e conclui que não salvou. Visto em
      // 17/08/2026, com a trava já satisfeita no banco. Ver `avaliarMercado`.
      void qc.invalidateQueries({ queryKey: ['markets'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Não consegui salvar o modelo.'),
  });

  const aprovar = useMutation({
    mutationFn: (id: string) => approveTemplate(id),
    onSuccess: () => {
      toast.success('Aprovado — já aparece no Disparo deste mercado.');
      void qc.invalidateQueries({ queryKey: ['message-templates'] });
    },
    // 403 é o caso esperado para quem escreve sem carimbar (perm `settings`).
    onError: (e: any) =>
      toast.error(
        e?.response?.status === 403
          ? 'Aprovar exige a permissão de configuração — peça a quem gerencia a operação.'
          : e?.response?.data?.message ?? 'Não consegui aprovar.',
      ),
  });

  const reprovar = useMutation({
    mutationFn: (id: string) => unapproveTemplate(id),
    onSuccess: () => {
      toast.info('Voltou para rascunho — saiu do Disparo.');
      void qc.invalidateQueries({ queryKey: ['message-templates'] });
    },
    onError: () => toast.error('Não consegui reprovar.'),
  });

  const enviarTeste = useMutation({
    mutationFn: (para: string) => sendTemplateTest({ to: para, productCode: codigo, subject: assunto, body: corpo }),
    onSuccess: (r) =>
      r.sent ? toast.success('Teste enviado. Confira a caixa (e a aba Promoções).') : toast.error(`Não saiu: ${r.reason}`),
    onError: () => toast.error('Não consegui enviar o teste.'),
  });

  async function pedirEnvioDeTeste() {
    const para = window.prompt('Enviar o teste para qual e-mail?');
    if (para?.includes('@')) enviarTeste.mutate(para);
  }

  /**
   * Excluir um. O texto do aviso diz o que NÃO se perde — sem isso, quem hesita
   * entre "Arquivar" e "Excluir" escolhe arquivar por medo e a lista nunca limpa.
   */
  async function pedirExclusao(t: MessageTemplate) {
    const ok = await confirm({
      title: `Excluir "${t.name}"?`,
      message:
        'Some da lista para sempre — não dá para desfazer. As campanhas que já usaram este ' +
        'texto continuam intactas: elas guardam a mensagem enviada nelas mesmas. ' +
        'Se o modelo já rodou e você quer preservar o texto, use "Arquivar".',
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await deleteTemplate(t.id);
      toast.info('Modelo excluído.');
      void qc.invalidateQueries({ queryKey: ['message-templates'] });
      void qc.invalidateQueries({ queryKey: ['markets'] });
    } catch (e: any) {
      toast.error(
        e?.response?.status === 403
          ? 'Excluir exige a permissão de configuração.'
          : e?.response?.data?.message ?? 'Não consegui excluir.',
      );
    }
  }

  /** Excluir todos do mercado. A confirmação diz o número — é a única defesa real. */
  async function pedirExclusaoTotal() {
    const nomeDoMercado = mercados.find((m) => m.code === codigo)?.name ?? codigo;
    const ok = await confirm({
      title: `Excluir os ${modelos.length} modelos de ${nomeDoMercado}?`,
      message:
        'Todos os modelos deste mercado somem para sempre — não dá para desfazer. ' +
        'Nenhum outro mercado é tocado, e as campanhas já enviadas continuam intactas. ' +
        'Sem modelo nenhum, este mercado volta a ficar bloqueado para liberação.',
      confirmLabel: `Excluir ${modelos.length}`,
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const r = await deleteAllTemplates(codigo);
      toast.info(`${r.deleted} modelo(s) excluído(s).`);
      void qc.invalidateQueries({ queryKey: ['message-templates'] });
      void qc.invalidateQueries({ queryKey: ['markets'] });
    } catch (e: any) {
      toast.error(
        e?.response?.status === 403
          ? 'Excluir exige a permissão de configuração.'
          : e?.response?.data?.message ?? 'Não consegui excluir os modelos.',
      );
    }
  }

  async function pedirArquivamento(t: MessageTemplate) {
    const ok = await confirm({
      title: `Arquivar "${t.name}"?`,
      message: 'Ele some do Disparo. As campanhas que já usaram este texto continuam intactas.',
      confirmLabel: 'Arquivar',
      variant: 'warning',
    });
    if (!ok) return;
    await archiveTemplate(t.id);
    toast.info('Modelo arquivado.');
    void qc.invalidateQueries({ queryKey: ['message-templates', codigo] });
    // Mesmo motivo do salvar, no sentido contrário: arquivar o ÚLTIMO modelo faz a
    // trava voltar, e o Markets precisa passar a cobrar de novo.
    void qc.invalidateQueries({ queryKey: ['markets'] });
  }

  const podeGerar = corpo.trim().length > 0;
  const podeSalvar = podeGerar && nome.trim().length > 1 && (canal === 'whatsapp' || assunto.trim().length > 0);

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: 'Vendas' }, { label: 'Mensagens' }]} />
      <PageHeader
        title="Mensagens"
        subtitle="Modelos prontos por mercado. Escreva na IA que preferir, cole aqui e veja como chega antes de salvar."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-base-content/60">Mercado</span>
        <select className="input w-52 text-sm" value={codigo} onChange={(e) => setMercado(e.target.value)}>
          {mercados.map((m) => (
            <option key={m.code} value={m.code}>{m.displayName || m.name}</option>
          ))}
        </select>
      </div>

      {/* ── Escrever / colar ─────────────────────────────────────────────── */}
      <Card className="mb-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            className="input min-w-48 flex-1 text-sm"
            placeholder="Nome do modelo (ex: Cotação fora da rota)"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
          <div className="flex overflow-hidden rounded-lg border border-base-200 text-xs font-medium">
            {(['email', 'whatsapp'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { setCanal(c); setPrevia(null); }}
                className={`px-3 py-2 ${canal === c ? 'bg-blue-500 text-white' : 'text-base-content/50 hover:bg-base-100'}`}
              >
                {c === 'email' ? 'E-mail' : 'WhatsApp'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-base-content/50">Toque</span>
            <input
              type="number" min={1} className="input w-16 text-sm"
              value={passo} onChange={(e) => setPasso(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
        </div>

        {canal === 'email' && (
          <input
            className="input mb-2 w-full text-sm"
            placeholder="Assunto — fale da dor do cliente, não do produto"
            value={assunto}
            onChange={(e) => setAssunto(e.target.value)}
          />
        )}

        <textarea
          className="input w-full py-2 text-sm"
          style={{ minHeight: 140, resize: 'vertical' }}
          placeholder={'Cole aqui o texto...\n\nUse {{nome}} e {{saudacao}} — o teste mostra já preenchido.'}
          value={corpo}
          onChange={(e) => setCorpo(e.target.value)}
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* Primeiro botão da fila: é por onde a mensagem NASCE quando existe roteiro
              aprovado. Os outros dois agem sobre um texto que já está escrito. */}
          <Button
            size="sm"
            variant="outline"
            disabled={!codigo || rascunhar.isPending}
            onClick={() => rascunhar.mutate()}
            title="Lê o roteiro aprovado deste mercado e propõe a cadência"
          >
            <Icon name="bot" className="h-4 w-4" />
            {rascunhar.isPending ? 'Lendo o roteiro…' : 'Gerar do roteiro'}
          </Button>
          <Button size="sm" variant="outline" disabled={!podeGerar || gerar.isPending} onClick={() => gerar.mutate()}>
            <Icon name="play" className="h-4 w-4" /> Gerar teste
          </Button>
          {canal === 'email' && (
            <Button size="sm" variant="ghost" disabled={!podeGerar} onClick={() => void pedirEnvioDeTeste()}>
              <Icon name="send" className="h-4 w-4" /> Enviar teste pra mim
            </Button>
          )}
          <Button size="sm" variant="primary" disabled={!podeSalvar || salvar.isPending} onClick={() => salvar.mutate()}>
            Salvar modelo
          </Button>
          {!podeSalvar && podeGerar && (
            <span className="text-xs text-base-content/40">
              {nome.trim().length < 2 ? 'Falta o nome do modelo' : 'Falta o assunto'}
            </span>
          )}
        </div>

        {/* Frases recusadas. Fechado por padrão: é manutenção de voz, não o trabalho
            do dia. O contador no rótulo existe para a lista não virar uma gaveta que
            ninguém lembra que está cheia. */}
        <div className="mt-3 border-t border-base-200 pt-2">
          <button
            type="button"
            onClick={() => setEvitarAberto(!evitarAberto)}
            className="flex w-full items-center justify-between gap-2 py-1 text-left text-xs font-medium uppercase tracking-wide text-base-content/50"
          >
            <span>
              Frases que a Lia não deve usar
              {evitar.trim() && ` · ${evitar.split('\n').filter((l) => l.trim()).length}`}
            </span>
            <span className={'transition-transform ' + (evitarAberto ? 'rotate-180' : '')}>▾</span>
          </button>

          {evitarAberto && (
            <div className="pt-2">
              <p className="mb-2 text-xs text-base-content/60">
                Viu uma frase com tom errado? Copia e cola aqui, uma por linha. Ela não volta
                nas próximas gerações — e frases parecidas também saem, porque a lista ensina o
                estilo a evitar, não só as palavras exatas.
              </p>
              <textarea
                className="input w-full py-2 font-mono text-xs"
                style={{ minHeight: 90, resize: 'vertical' }}
                placeholder={'não perca esta oportunidade\núltima chance de conhecer\njá pensou em quanto você economizaria'}
                value={evitar}
                onChange={(e) => setEvitar(e.target.value)}
              />
              <div className="mt-2 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={salvarEvitar.isPending}
                  onClick={() => salvarEvitar.mutate()}
                >
                  {salvarEvitar.isPending ? 'Salvando…' : 'Salvar lista'}
                </Button>
                <span className="text-xs text-base-content/40">
                  Vale para todos os mercados. Salve e clique em "Gerar do roteiro" de novo.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Propostas do roteiro. Ficam AQUI, entre o formulário e a prévia, porque é
            daqui que o texto vai para o campo de cima. A lista PERMANECE ao escolher
            uma: são as mensagens de uma cadência, feitas para serem salvas todas, e
            apagá-las na primeira obrigava a gerar tudo de novo para pegar a segunda.
            O que evita confusão é o destaque de qual está no formulário. */}
        {rascunhos.length > 0 && (
          <div className="mt-4 border-t border-base-200 pt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-base-content/50">
                Propostas do roteiro aprovado
                {rascunhosSalvos.size > 0 && ` — ${rascunhosSalvos.size} de ${rascunhos.length} salva(s)`}
              </span>
              <button
                type="button"
                className="text-xs text-base-content/50 hover:text-base-content"
                onClick={() => {
                  setRascunhos([]);
                  setRascunhoAtivo(null);
                  setRascunhosSalvos(new Set());
                }}
              >
                descartar
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {rascunhos.map((r, i) => {
                const ativo = rascunhoAtivo === i;
                const salvo = rascunhosSalvos.has(i);
                return (
                <button
                  key={i}
                  type="button"
                  onClick={() => usarRascunho(i)}
                  className={
                    'rounded-lg border p-3 text-left transition-colors ' +
                    (ativo
                      ? 'border-brand-500 bg-brand-500/10'
                      : salvo
                        ? 'border-base-200 bg-base-200/40 opacity-60 hover:opacity-100'
                        : 'border-base-200 hover:border-brand-500 hover:bg-brand-500/5')
                  }
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{r.name}</span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-base-content/40">
                      {/* O estado vem antes do número do toque: é o que se procura ao
                          voltar para a lista depois de salvar uma. */}
                      {ativo ? 'no formulário' : salvo ? '✓ salva' : `toque ${r.step}`}
                    </span>
                  </div>
                  {r.subject && (
                    <p className="mt-0.5 text-xs text-base-content/70">Assunto: {r.subject}</p>
                  )}
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-base-content/60">
                    {r.body.length > 220 ? `${r.body.slice(0, 220)}…` : r.body}
                  </p>
                  {r.porque && (
                    <p className="mt-1 text-[11px] italic text-base-content/40">{r.porque}</p>
                  )}
                </button>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* ── Como chega ───────────────────────────────────────────────────── */}
      {previa && (
        <Card className="mb-4">
          <div className="mb-2 text-xs text-base-content/60">Como chega</div>

          {previa.assunto && (
            <div className="mb-2 text-sm">
              <span className="text-base-content/50">Assunto: </span>
              <span className="text-base-content">{previa.assunto}</span>
            </div>
          )}

          {/* O HTML vem do MESMO render do envio real — prévia que diverge dá
              confiança errada. Vai em iframe sandbox: é HTML de e-mail com estilo
              próprio, e injetar no documento quebraria o layout da página. */}
          {previa.html ? (
            <iframe
              title="Prévia do e-mail"
              sandbox=""
              srcDoc={previa.html}
              className="h-96 w-full rounded-lg border border-base-200 bg-white"
            />
          ) : (
            <div className="max-w-md rounded-xl border border-base-200 bg-base-100 px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
              {previa.corpo}
            </div>
          )}

          {previa.avisos.length > 0 && (
            <div className="mt-3 border-t border-base-200 pt-2">
              {previa.avisos.map((a, i) => <Aviso key={i} {...a} />)}
            </div>
          )}
        </Card>
      )}

      {/* ── Modelos deste mercado ────────────────────────────────────────── */}
      <Card className="p-0">
        <div className="flex items-center justify-between gap-3 border-b border-base-200 px-4 py-2 text-xs text-base-content/60">
          <span>{modelos.length} modelo(s) neste mercado</span>
          {/* Só aparece quando há o que excluir — botão destrutivo em lista vazia é
              só um convite a clicar sem motivo. */}
          {modelos.length > 0 && (
            <button
              type="button"
              className="text-xs text-red-500 underline hover:text-red-600"
              onClick={() => void pedirExclusaoTotal()}
            >
              Excluir todos
            </button>
          )}
        </div>
        {modelos.length === 0 ? (
          <p className="px-4 py-3 text-xs text-base-content/40">
            Nenhum modelo ainda. Sem pelo menos um, o mercado não pode ser liberado.
          </p>
        ) : (
          modelos.map((t) => (
            <div key={t.id} className="flex items-center gap-3 border-b border-base-200 px-4 py-2 last:border-0">
              <StatusBadge tone="neutral">{t.channel === 'email' ? 'E-mail' : 'WhatsApp'}</StatusBadge>
              {/* Rascunho em âmbar: é o que NÃO sai no Disparo até alguém revisar. */}
              <StatusBadge tone={t.status === 'approved' ? 'success' : 'warning'}>
                {t.status === 'approved' ? 'Aprovado' : 'Rascunho'}
              </StatusBadge>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-base-content">
                  {t.name} <span className="text-xs text-base-content/40">· toque {t.step}</span>
                </div>
                <div className="truncate text-xs text-base-content/50">{t.subject || t.body.slice(0, 70)}</div>
              </div>
              {t.status !== 'approved' ? (
                <button
                  type="button"
                  className="text-xs font-medium text-brand-600 underline"
                  onClick={() => void aprovar.mutate(t.id)}
                >
                  Aprovar
                </button>
              ) : (
                <button
                  type="button"
                  className="text-xs text-base-content/40 underline"
                  onClick={() => void reprovar.mutate(t.id)}
                >
                  Reprovar
                </button>
              )}
              <button
                type="button"
                className="text-xs text-base-content/40 underline"
                onClick={() => { setCanal(t.channel as any); setAssunto(t.subject ?? ''); setCorpo(t.body); setPrevia(null); }}
              >
                Abrir
              </button>
              <button type="button" className="text-xs text-base-content/40 underline" onClick={() => void pedirArquivamento(t)}>
                Arquivar
              </button>
              {/* Vermelho e por último: é o único da linha que não tem volta. */}
              <button
                type="button"
                className="text-xs text-red-500 underline hover:text-red-600"
                onClick={() => void pedirExclusao(t)}
              >
                Excluir
              </button>
            </div>
          ))
        )}
      </Card>
    </PageContainer>
  );
}
