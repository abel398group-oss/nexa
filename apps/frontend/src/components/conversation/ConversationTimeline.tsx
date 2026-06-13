import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getStatusConfig, getOutcomeConfig } from '@/lib/conversation-status';
import { Icon } from '@/components/ui/icons';

interface TimelineEntry {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  fromOutcome: string | null;
  toOutcome: string | null;
  reason: string | null;
  changedAt: string;
}

interface Props {
  conversationId: string;
}

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

// Mapeia reasons técnicas para frases legíveis
const REASON_LABEL: Record<string, string> = {
  reaberta_lead_retornou: 'Nova mensagem do lead',
  reaberta_manual:        'Reaberta manualmente',
  opt_out:                'Lead pediu opt-out',
  won:                    'Venda realizada',
  lost:                   'Venda perdida',
  no_response:            'Sem resposta',
  inatividade_7d:         'Inativo por 7 dias',
  inatividade_3d:         'Inativo por 3 dias',
};

function reasonLabel(r: string | null) {
  if (!r) return null;
  // inatividade_Nd genérico
  if (r.startsWith('inatividade_')) {
    const days = r.replace('inatividade_', '').replace('d', '');
    return `Inativo por ${days} dias`;
  }
  return REASON_LABEL[r] ?? r;
}

export function ConversationTimeline({ conversationId }: Props) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/conversations/${conversationId}/timeline`)
      .then((r) => setEntries(r.data))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [conversationId]);

  if (loading) return (
    <div className="py-4 text-center text-xs text-base-content/40">Carregando histórico…</div>
  );

  if (entries.length === 0) return (
    <div className="py-4 text-center text-xs text-base-content/40">Nenhum histórico ainda.</div>
  );

  return (
    <div className="space-y-0">
      {entries.map((e, i) => {
        const toStatus = getStatusConfig(e.toStatus);
        const fromStatus = e.fromStatus ? getStatusConfig(e.fromStatus) : null;
        const toOutcome = e.toOutcome ? getOutcomeConfig(e.toOutcome) : null;
        const reason = reasonLabel(e.reason);
        const isReopen = e.reason === 'reaberta_lead_retornou' || e.reason === 'reaberta_manual';

        return (
          <div key={e.id} className="relative flex gap-3">
            {/* linha vertical */}
            {i < entries.length - 1 && (
              <div className="absolute left-[14px] top-6 h-full w-px bg-base-300" />
            )}

            {/* dot */}
            <div
              className="relative z-10 mt-1 h-3.5 w-3.5 flex-shrink-0 rounded-full border-2 border-white"
              style={{ background: toStatus.dot, boxShadow: '0 0 0 2px var(--border)' }}
            />

            {/* conteúdo */}
            <div className="flex-1 pb-4">
              <div className="flex flex-wrap items-center gap-1.5">
                {fromStatus && (
                  <>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${fromStatus.bg} ${fromStatus.text}`}>
                      {fromStatus.labelPt}
                    </span>
                    <span className="text-base-content/30 text-xs">→</span>
                  </>
                )}
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${toStatus.bg} ${toStatus.text}`}>
                  {toStatus.labelPt}
                </span>
                {toOutcome && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${toOutcome.bg} ${toOutcome.text}`}>
                    {toOutcome.labelPt}
                  </span>
                )}
                {isReopen && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                    <Icon name="refresh" className="h-3 w-3" /> Reaberta
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <span className="text-[10px] text-base-content/40">{fmt(e.changedAt)}</span>
                {reason && (
                  <span className="text-[10px] text-base-content/50">· {reason}</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
