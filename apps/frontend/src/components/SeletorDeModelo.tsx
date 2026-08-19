import { useQuery } from '@tanstack/react-query';
import { Icon } from '@/shared/ui';
import { listTemplates, type MessageTemplate } from '@/entities/message-template';

/**
 * Escolher um modelo já validado em vez de digitar o texto do zero.
 *
 * A tela de Modelos de Mensagens sempre serviu para escrever a copy, ver como ela
 * chega e salvar — e o texto salvo não ia a lugar nenhum. Nenhum caminho de envio lia
 * `message_templates`; a única coisa que os consultava era a trava de liberação do
 * mercado, para CONTAR quantos existem. O operador validava o texto numa tela e
 * digitava tudo de novo na outra, e a tela de Modelos ainda dizia "já aparece no
 * Disparo", que era falso.
 *
 * Escolher aqui COPIA o texto para os campos, em vez de amarrar a campanha ao modelo.
 * É de propósito: a campanha guarda o texto que foi de fato enviado, e editar um
 * modelo meses depois não pode reescrever o histórico do que já saiu.
 *
 * Sem mercado escolhido não há o que listar — os modelos são por mercado, que é o que
 * impede a copy de pneus sair para transportadora.
 */
export function SeletorDeModelo({
  productCode,
  channel,
  onEscolher,
}: {
  productCode: string;
  channel: 'email' | 'whatsapp';
  onEscolher: (m: MessageTemplate) => void;
}) {
  const code = productCode.trim();
  const { data: modelos = [], isLoading } = useQuery({
    queryKey: ['message-templates', code],
    queryFn: () => listTemplates(code),
    enabled: !!code,
  });

  const doCanal = modelos.filter((m) => m.channel === channel);
  if (!code || isLoading || doCanal.length === 0) return null;

  return (
    <div className="rounded-lg border border-base-200 bg-base-100 px-3 py-2">
      <label className="flex flex-wrap items-center gap-2">
        <Icon name="mail" className="h-4 w-4 text-base-content/60" />
        <span className="text-xs font-medium text-base-content/70">Usar um modelo pronto</span>
        <select
          className="input !h-8 min-w-56 flex-1 text-sm"
          defaultValue=""
          onChange={(e) => {
            const m = doCanal.find((x) => x.id === e.target.value);
            if (m) onEscolher(m);
            // Volta para o rótulo: o campo diz o que FAZER, não o que foi escolhido —
            // depois de copiar, quem manda é o texto, que a pessoa pode ter editado.
            e.target.value = '';
          }}
        >
          <option value="">Escolha…</option>
          {doCanal.map((m) => (
            <option key={m.id} value={m.id}>
              Toque {m.step} — {m.name}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-1 text-[11px] text-base-content/60">
        Preenche os campos abaixo com o texto já validado. Dá para ajustar depois — a campanha
        guarda o que você enviar, não o modelo.
      </p>
    </div>
  );
}
