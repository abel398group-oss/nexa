import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, PageContainer, PageHeader, Breadcrumb, Icon, StatusBadge } from '@/shared/ui';
import { useToast } from '@/app/providers/ToastContext';
import { useConfirm } from '@/app/providers/ConfirmContext';
import { listMarkets } from '@/entities/market';
import { useMarketAtivo } from '@/shared/lib/marketAtivo';
import {
  listTemplates, createTemplate, archiveTemplate, previewTemplate, sendTemplateTest,
  type MessageTemplate, type TemplatePreview,
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

  const { data: mercados = [] } = useQuery({ queryKey: ['markets'], queryFn: () => listMarkets(false) });
  // O market vem do cabeçalho do cockpit, compartilhado com as outras abas. Antes
  // era um `useState` local por aba, e a escolha derivava entre elas.
  const [codigo, setMercado] = useMarketAtivo(mercados[0]?.code);

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

  const salvar = useMutation({
    mutationFn: () =>
      createTemplate({ productCode: codigo, name: nome, channel: canal, subject: assunto, body: corpo, step: passo }),
    onSuccess: () => {
      toast.success('Modelo salvo. Já aparece no Disparo deste mercado.');
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
        <div className="border-b border-base-200 px-4 py-2 text-xs text-base-content/60">
          {modelos.length} modelo(s) neste mercado
        </div>
        {modelos.length === 0 ? (
          <p className="px-4 py-3 text-xs text-base-content/40">
            Nenhum modelo ainda. Sem pelo menos um, o mercado não pode ser liberado.
          </p>
        ) : (
          modelos.map((t) => (
            <div key={t.id} className="flex items-center gap-3 border-b border-base-200 px-4 py-2 last:border-0">
              <StatusBadge tone="neutral">{t.channel === 'email' ? 'E-mail' : 'WhatsApp'}</StatusBadge>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-base-content">
                  {t.name} <span className="text-xs text-base-content/40">· toque {t.step}</span>
                </div>
                <div className="truncate text-xs text-base-content/50">{t.subject || t.body.slice(0, 70)}</div>
              </div>
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
            </div>
          ))
        )}
      </Card>
    </PageContainer>
  );
}
