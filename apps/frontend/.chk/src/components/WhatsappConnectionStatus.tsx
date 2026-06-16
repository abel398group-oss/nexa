import { useQuery } from '@tanstack/react-query';
import { Card } from '@/shared/ui';
import {
  getWhatsappStatus,
  whatsappStatusLabel,
  whatsappStatusTone,
} from '@/shared/lib/whatsappStatus';

/**
 * Indicador de conexão do WhatsApp (sessão WAHA). Lê GET /whatsapp/status a cada 15s.
 * - `compact` (Dashboard): linha enxuta com bolinha + rótulo.
 * - padrão (Saúde dos Números): card com detalhe (tempo fora do ar + última checagem).
 */
const TONE = {
  ok: { dot: 'bg-emerald-500', text: 'text-emerald-600', ring: 'bg-emerald-500/30' },
  off: { dot: 'bg-red-500', text: 'text-red-600', ring: 'bg-red-500/30' },
  idle: { dot: 'bg-base-300', text: 'text-base-content/50', ring: 'bg-base-300/40' },
} as const;

function fmtTime(ts?: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function WhatsappConnectionStatus({ compact = false }: { compact?: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: getWhatsappStatus,
    refetchInterval: 15_000,
  });

  const tone = data ? whatsappStatusTone(data) : 'idle';
  const label = data ? whatsappStatusLabel(data) : 'Carregando…';
  const c = TONE[tone];

  const Dot = (
    <span className="relative flex h-2.5 w-2.5">
      {tone !== 'idle' && (
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${c.ring}`} />
      )}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${c.dot}`} />
    </span>
  );

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm" title={`WhatsApp: ${label}`}>
        {Dot}
        <span className="text-base-content/60">WhatsApp</span>
        <span className={`font-medium ${c.text}`}>{isLoading ? '…' : label}</span>
      </div>
    );
  }

  return (
    <Card className="p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-base-content/50">
        Conexão do WhatsApp
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        {Dot}
        <span className={`text-lg font-bold ${c.text}`}>{isLoading ? 'Carregando…' : label}</span>
      </div>
      <div className="mt-0.5 text-xs text-base-content/40">
        {tone === 'off' && data?.downMinutes != null
          ? `Fora do ar há ~${data.downMinutes} min · checado ${fmtTime(data?.checkedAt)}`
          : tone === 'ok'
            ? `Sessão ativa · checado ${fmtTime(data?.checkedAt)}`
            : tone === 'idle' && !isLoading
              ? 'Monitor não configurado'
              : 'Atualiza a cada 15s'}
      </div>
    </Card>
  );
}
