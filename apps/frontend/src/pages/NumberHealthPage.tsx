import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { displayPhone } from '@/lib/phone';
import { Button, Card, PageContainer, PageHeader, Breadcrumb, Icon } from '@/shared/ui';

interface SenderNumber {
  id: string;
  phone: string;
  active: boolean;
  dailyLimit: number;
  sentToday: number;
  hourlyLimit: number;
  sentThisHour: number;
  warmupStage: number;
  effectiveDailyLimit: number;
}

// barra de progresso com cor por nível de uso (verde → âmbar → vermelho)
function UsageBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const color = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-base-200">
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function NumberHealthPage() {
  const [items, setItems] = useState<SenderNumber[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const r = await api.get('/sender/numbers');
      setItems(r.data);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 10000); // atualiza a cada 10s
    return () => clearInterval(t);
  }, []);

  const totalSent = items.reduce((a, n) => a + n.sentToday, 0);
  const totalCap = items.reduce((a, n) => a + n.effectiveDailyLimit, 0);
  const activeCount = items.filter((n) => n.active).length;

  return (
    <PageContainer>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Início', to: '/dashboard' }, { label: 'Saúde dos números' }]} />}
        title="Saúde dos números"
        subtitle="Status, limites e aquecimento dos números de WhatsApp (anti-ban). Atualiza a cada 10s."
        actions={<Button variant="outline" onClick={load}><Icon name="refresh" className="h-4 w-4" /> Atualizar</Button>}
      />

      {/* resumo */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-base-content/50">Números</div>
          <div className="mt-0.5 text-2xl font-bold text-base-content">{items.length}</div>
          <div className="mt-0.5 text-xs text-base-content/40">{activeCount} ativo(s)</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-base-content/50">Enviados hoje</div>
          <div className="mt-0.5 text-2xl font-bold text-base-content">{totalSent}</div>
          <div className="mt-0.5 text-xs text-base-content/40">de {totalCap} no limite efetivo</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-base-content/50">Capacidade usada</div>
          <div className="mt-0.5 text-2xl font-bold text-base-content">{totalCap > 0 ? Math.round((totalSent / totalCap) * 100) : 0}%</div>
          <div className="mt-0.5 text-xs text-base-content/40">do total liberado hoje</div>
        </Card>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-base-content/40">Carregando…</p>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="mb-2 flex justify-center text-base-content/30"><Icon name="inbox" className="h-9 w-9" /></div>
          <p className="text-sm font-medium text-base-content">Nenhum número configurado</p>
          <p className="mt-1 text-xs text-base-content/50">Conecte um número de WhatsApp (WAHA) para começar a disparar.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((n) => {
            const dailyPct = n.effectiveDailyLimit > 0 ? Math.round((n.sentToday / n.effectiveDailyLimit) * 100) : 0;
            const dayFull = n.sentToday >= n.effectiveDailyLimit;
            const hourFull = n.sentThisHour >= n.hourlyLimit;
            return (
              <Card key={n.id} className="p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon name="inbox" className="h-4 w-4 text-green-600" />
                    <span className="font-semibold text-base-content">{displayPhone(n.phone)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${n.active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-base-200 text-base-content/50'}`}>
                      {n.active ? 'ativo' : 'inativo'}
                    </span>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" title="Fase de aquecimento (anti-ban): o limite cresce gradualmente">
                      aquecimento · fase {n.warmupStage}
                    </span>
                  </div>
                  {(dayFull || hourFull) && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">
                      <Icon name="alert" className="h-3.5 w-3.5" /> {dayFull ? 'limite diário atingido' : 'limite por hora atingido'}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* diário */}
                  <div>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-base-content/60">Hoje</span>
                      <span className="font-medium text-base-content">{n.sentToday}/{n.effectiveDailyLimit} <span className="text-base-content/40">({dailyPct}%)</span></span>
                    </div>
                    <UsageBar used={n.sentToday} total={n.effectiveDailyLimit} />
                    <div className="mt-1 text-[11px] text-base-content/40">limite configurado: {n.dailyLimit}/dia</div>
                  </div>
                  {/* por hora */}
                  <div>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-base-content/60">Nesta hora</span>
                      <span className="font-medium text-base-content">{n.sentThisHour}/{n.hourlyLimit}</span>
                    </div>
                    <UsageBar used={n.sentThisHour} total={n.hourlyLimit} />
                    <div className="mt-1 text-[11px] text-base-content/40">teto por hora (anti-ban)</div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
