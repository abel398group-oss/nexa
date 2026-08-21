/**
 * ConversaDoLead — a thread do lead dentro da mesa do SDR (Fase 3, 21/08/2026).
 *
 * ## O buraco que isto fecha
 *
 * Os botões de WhatsApp e e-mail da mesa eram links `wa.me` e `mailto:` — eles ABREM
 * OUTRO APLICATIVO. A conversa acontecia fora, e o Nexa não guardava nada dela: o que
 * o lead respondeu não estava na tela quando o SDR ligava de novo três dias depois, o
 * closer herdava um buraco no lugar do histórico, e "tentativas" contava o que alguém
 * digitou à mão depois, não o que aconteceu.
 *
 * A infraestrutura de envio já existia inteira e rodava no Inbox. Faltava a mesa usar.
 *
 * ## Duas regras que não são detalhe
 *
 * **Enviar já assume a conversa.** O backend liga `humanTakeoverAt` na primeira
 * mensagem humana (ADR 035) e a Lia passa a só rascunhar. Não existe botão "assumir" —
 * e não deve existir: um botão a mais entre o SDR e a resposta é um SDR respondendo
 * pelo WhatsApp do celular dele.
 *
 * **Modelo preenche, nunca envia.** Escolher um modelo joga o texto no campo para ele
 * ajustar. Enviar direto transformaria a biblioteca aprovada num disparador de um
 * clique, que é exatamente o que a aprovação existe para impedir.
 */
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Icon } from '@/shared/ui';
import { useToast } from '@/app/providers/ToastContext';
import {
  getConversationMessages,
  listConversations,
  sendMessage,
  type Message,
} from '@/entities/conversation';
import { listTemplates, type MessageTemplate } from '@/entities/message-template';

/// De quem é a mensagem, para o lado e a cor da bolha.
function ehDoLead(m: Message): boolean {
  return m.direction === 'inbound';
}

function hora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ConversaDoLead({
  conversationId,
  contactId,
  productCode,
  nomeDoLead,
}: {
  conversationId: string | null;
  contactId: string | null;
  productCode: string | null;
  nomeDoLead: string;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [texto, setTexto] = useState('');
  const fimDaLista = useRef<HTMLDivElement>(null);

  /**
   * Acha a conversa deste lead.
   *
   * `conversationId` na oportunidade cobre o lead que nasceu de uma conversa. O lead
   * importado por CSV não tem — a conversa só passa a existir quando a campanha
   * dispara —, e é por isso que existe a busca por contato: sem ela, justamente a
   * maioria dos leads abriria a aba vazia mesmo tendo thread.
   */
  const { data: achadas } = useQuery({
    queryKey: ['sdr', 'conversa-do-contato', contactId],
    queryFn: () => listConversations({ contactId: contactId as string, limit: 1 }),
    enabled: !conversationId && !!contactId,
  });

  const convId = conversationId ?? achadas?.items?.[0]?.id ?? null;

  const { data: mensagens = [], isLoading } = useQuery<Message[]>({
    queryKey: ['sdr', 'mensagens', convId],
    queryFn: () => getConversationMessages(convId as string),
    enabled: !!convId,
    // A thread muda por fora (o lead responde). 15s é o suficiente para uma conversa
    // por WhatsApp sem transformar a mesa num poller.
    refetchInterval: 15_000,
  });

  /// Modelos aprovados do mercado. Só leitura — o SDR usa o que já foi validado, e não
  /// pode editar a biblioteca (a rota de escrita continua exigindo `campaigns`).
  const { data: modelos = [] } = useQuery<MessageTemplate[]>({
    queryKey: ['sdr', 'modelos', productCode],
    queryFn: () => listTemplates(productCode as string, undefined, true),
    enabled: !!productCode,
  });

  // Rola para o fim quando chega mensagem nova. Sem isto a thread abre no topo e o
  // SDR lê a conversa de trás para frente.
  useEffect(() => {
    fimDaLista.current?.scrollIntoView({ block: 'end' });
  }, [mensagens.length, convId]);

  const enviar = useMutation({
    mutationFn: () => sendMessage(convId as string, texto.trim()),
    onSuccess: () => {
      setTexto('');
      void qc.invalidateQueries({ queryKey: ['sdr', 'mensagens', convId] });
      // A fila mostra o histórico e a contagem de tentativas — sem invalidar, o SDR
      // manda a mensagem e a lista do lado continua dizendo que ninguém falou com ele.
      void qc.invalidateQueries({ queryKey: ['sdr', 'queue'] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Não consegui enviar a mensagem.'),
  });

  if (!convId) {
    return (
      <Card className="flex h-[calc(100vh-14rem)] flex-col items-center justify-center gap-2 p-8 text-center">
        <Icon name="inbox" className="h-8 w-8 text-base-content/25" />
        <p className="text-sm text-base-content/70">
          Nenhuma conversa com {nomeDoLead} ainda.
        </p>
        <p className="max-w-sm text-xs text-base-content/50">
          A conversa nasce quando a campanha dispara ou quando o lead escreve. Para o
          primeiro contato agora, use a aba <b>Roteiro</b> e o telefone.
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex h-[calc(100vh-14rem)] flex-col p-0">
      {/* ── A thread ─────────────────────────────────────────────────────── */}
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {isLoading && <p className="text-sm text-base-content/60">Abrindo a conversa…</p>}
        {!isLoading && !mensagens.length && (
          <p className="text-sm text-base-content/60">
            A conversa existe, mas ainda não tem mensagem.
          </p>
        )}
        {mensagens.map((m) => {
          const doLead = ehDoLead(m);
          return (
            <div key={m.id} className={'flex ' + (doLead ? 'justify-start' : 'justify-end')}>
              <div
                className={
                  'max-w-[80%] rounded-lg px-3 py-2 text-sm ' +
                  (m.isInternal
                    ? 'border border-dashed border-amber-400/60 bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200'
                    : doLead
                      ? 'bg-base-200 text-base-content'
                      : 'bg-brand-500 text-white')
                }
              >
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
                <p
                  className={
                    'mt-1 text-[10px] ' + (doLead || m.isInternal ? 'text-base-content/40' : 'text-white/70')
                  }
                >
                  {m.isInternal && 'nota interna · '}
                  {hora(m.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={fimDaLista} />
      </div>

      {/* ── Escrever ─────────────────────────────────────────────────────── */}
      <div className="border-t border-base-200 p-3">
        {modelos.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-base-content/40">
              Modelo aprovado
            </span>
            {modelos.slice(0, 6).map((t) => (
              <button
                key={t.id}
                type="button"
                // Preenche para ajustar. Enviar direto faria da biblioteca aprovada um
                // disparador de um clique — o oposto do que a aprovação garante.
                onClick={() => setTexto(t.body)}
                className="rounded-full border border-base-200 px-2 py-0.5 text-[11px] hover:border-brand-500 hover:bg-brand-500/5"
                title="Joga o texto no campo para você ajustar antes de enviar"
              >
                {t.name}
              </button>
            ))}
          </div>
        )}

        <textarea
          className="input w-full py-2 text-sm"
          style={{ minHeight: 72, resize: 'vertical' }}
          placeholder={`Escreva para ${nomeDoLead}…`}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />

        <div className="mt-2 flex items-center justify-between gap-2">
          {/* O aviso do takeover fica à vista ANTES de enviar, não depois: a Lia
              parar de responder sozinha é consequência que o SDR precisa conhecer
              enquanto ainda pode escolher ligar em vez de escrever. */}
          <span className="text-[11px] text-base-content/40">
            Ao enviar, você assume a conversa e a Lia para de responder sozinha.
          </span>
          <Button
            size="sm"
            disabled={!texto.trim() || enviar.isPending}
            loading={enviar.isPending}
            onClick={() => enviar.mutate()}
          >
            <Icon name="send" className="h-4 w-4" /> Enviar
          </Button>
        </div>
      </div>
    </Card>
  );
}
