import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { displayPhone } from '@/shared/lib/phone';
import { Button, Card, PageContainer, PageHeader, Breadcrumb, Icon } from '@/shared/ui';
import { listSenderNumbers } from '@/entities/campaign';
import { WhatsappConnectionStatus } from '@/components/WhatsappConnectionStatus';
import {
  restartWhatsappSession,
  getWhatsappQr,
  listWhatsappLinhas,
  linhaLabel,
} from '@/shared/lib/whatsappStatus';

// Rótulos das origens de envio (NumberBudgetService). Chave desconhecida cai no
// próprio nome — origem nova aparece na tela sem precisar mexer aqui.
const ORIGIN_LABELS: Record<string, string> = {
  campaign: 'Campanha',
  lia: 'Lia',
  followup: 'Follow-up',
  monitor: 'Alertas TMS',
  janitor: 'Encerramento',
  handoff: 'Vendedor',
  admin: 'Admin',
  'suporte-interno': 'Suporte',
  anexo: 'Anexo',
  teste: 'Teste',
  outros: 'Outros',
};

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
  // React Query: leitura + polling (10s) sem useEffect/setInterval manual.
  const { data: items = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sender-numbers'],
    queryFn: listSenderNumbers,
    refetchInterval: 10_000,
  });

  const totalSent = items.reduce((a, n) => a + n.sentToday, 0);
  const totalCap = items.reduce((a, n) => a + n.effectiveDailyLimit, 0);
  const activeCount = items.filter((n) => n.active).length;

  // Reconexão do WhatsApp (reiniciar sessão + mostrar QR para reparear).
  //
  // Guarda QUAL linha está sendo reconectada, não um booleano: com dois números,
  // reiniciar sem dizer qual derruba a principal — que costuma ser justamente a
  // que estava funcionando. `null` = modal fechado.
  const qc = useQueryClient();
  const [qrLinha, setQrLinha] = useState<string | null>(null);

  const { data: linhas = [] } = useQuery({
    queryKey: ['whatsapp-linhas'],
    queryFn: listWhatsappLinhas,
    refetchInterval: 15_000,
  });

  const qr = useQuery({
    queryKey: ['whatsapp-qr', qrLinha],
    queryFn: () => getWhatsappQr(qrLinha ?? undefined),
    enabled: !!qrLinha,
    refetchInterval: qrLinha ? 3000 : false,
  });

  const restart = useMutation({ mutationFn: (linha: string) => restartWhatsappSession(linha) });
  const connected = qr.data?.status === 'WORKING';

  const abrirQr = (linha: string) => {
    setQrLinha(linha);
    restart.mutate(linha);
  };

  return (
    <PageContainer>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Início', to: '/dashboard' }, { label: 'Saúde dos números' }]} />}
        title="Saúde dos números"
        subtitle="Status, limites e aquecimento dos números de WhatsApp (anti-ban). Atualiza a cada 10s."
        actions={
          <div className="flex flex-wrap gap-2">
            {/* Um botão POR LINHA. Com duas configuradas, um "Reconectar" genérico
                reiniciaria a principal sem dizer — e derrubaria o número que
                estava online. Com uma só, o rótulo continua o de sempre. */}
            {linhas.map((l) => (
              <Button
                key={l.linha}
                variant="outline"
                disabled={restart.isPending}
                onClick={() => abrirQr(l.linha)}
                title={linhaLabel(l.linha)}
              >
                <Icon name="refresh" className="h-4 w-4" />
                {linhas.length > 1 ? `Reconectar ${l.linha}` : 'Reconectar'}
              </Button>
            ))}
            <Button variant="outline" onClick={() => refetch()}><Icon name="refresh" className="h-4 w-4" /> Atualizar</Button>
          </div>
        }
      />

      {/* Estado por LINHA. Só aparece quando existe mais de uma — com um número
          só, o cartão de conexão abaixo já diz tudo e isto seria ruído. */}
      {linhas.length > 1 && (
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          {linhas.map((l) => (
            <Card key={l.linha} className="flex items-center justify-between p-4">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-base-content/50">
                  {linhaLabel(l.linha)}
                </div>
                <div
                  className={`mt-0.5 text-lg font-bold ${l.conectada ? 'text-emerald-500' : 'text-amber-500'}`}
                >
                  {l.conectada ? 'Conectado' : 'Desconectado'}
                </div>
                <div className="mt-0.5 text-xs text-base-content/40">
                  {l.configurada ? `status: ${l.status}` : 'sem container configurado'}
                </div>
              </div>
              <Button variant="outline" disabled={restart.isPending} onClick={() => abrirQr(l.linha)}>
                <Icon name="refresh" className="h-4 w-4" /> Parear
              </Button>
            </Card>
          ))}
        </div>
      )}

      {/* resumo */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <WhatsappConnectionStatus />
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

      {isLoading ? (
        <p className="py-10 text-center text-sm text-base-content/40">Carregando…</p>
      ) : isError ? (
        <Card className="p-8 text-center">
          <p className="text-sm font-medium text-base-content">Erro ao carregar a saúde dos números.</p>
          {(error as Error)?.message && (
            <p className="mt-1 text-xs text-base-content/50">{(error as Error).message}</p>
          )}
          <Button variant="outline" className="mt-3" onClick={() => refetch()}>
            <Icon name="refresh" className="h-4 w-4" /> Tentar novamente
          </Button>
        </Card>
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
                    <span className="font-semibold text-base-content">
                      {n.phone ? displayPhone(n.phone) : 'número ainda não identificado'}
                    </span>
                    {n.linha && (
                      <span className="rounded-full bg-base-200 px-2 py-0.5 text-[11px] font-medium text-base-content/60">
                        {linhaLabel(n.linha)}
                      </span>
                    )}
                    {/* Sem este selo, um chip pareado hoje aparece com "0/10 · fase 0" e
                        parece um número que está falhando em enviar, em vez de um que
                        ainda não foi usado. */}
                    {n.semRegistro && (
                      <span
                        className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
                        title="A linha está pareada. O registro de uso nasce no primeiro envio — os limites abaixo são os de um número novo."
                      >
                        aguardando 1º envio
                      </span>
                    )}
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

                {/* Uso REAL do chip — os dois medidores acima contam só a campanha.
                    O mesmo número responde lead, manda alerta do Monitor, avisa
                    vendedor e fecha conversa. Sem este bloco a tela mostrava
                    "0/30 hoje" com o chip tendo mandado sessenta mensagens. */}
                {n.budget && (
                  <div className="mt-4 border-t border-base-200 pt-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-base-content/60">Uso real do número (todos os canais)</span>
                      <span className="text-xs font-medium text-base-content">
                        {n.budget.today}/{n.budget.dailyCeiling} hoje
                        <span className="text-base-content/40"> · {n.budget.thisHour}/{n.budget.hourlyCeiling} nesta hora</span>
                      </span>
                    </div>
                    <UsageBar used={n.budget.today} total={n.budget.dailyCeiling} />
                    {Object.keys(n.budget.byOrigin).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {Object.entries(n.budget.byOrigin)
                          .sort((a, b) => b[1] - a[1])
                          .map(([origem, qtd]) => (
                            <span
                              key={origem}
                              className="rounded-full bg-base-200 px-2 py-0.5 text-[11px] text-base-content/70"
                            >
                              {ORIGIN_LABELS[origem] ?? origem}: {qtd}
                            </span>
                          ))}
                      </div>
                    )}
                    {n.budget.today >= n.budget.dailyCeiling && (
                      <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                        <strong>Campanhas pausadas até amanhã.</strong> O número atingiu o teto do dia
                        somando todos os canais. Alertas e respostas continuam saindo normalmente.
                      </p>
                    )}
                  </div>
                )}

                {/* Engajamento — os medidores acima contam só o que SAI. Quem decide
                    banir um número é o WhatsApp, e o sinal dele é quanta gente responde.
                    Sem este bloco a tela dizia "tudo dentro do limite" com o chip queimando. */}
                {n.health && (
                  <div className="mt-4 border-t border-base-200 pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-base-content/60">Engajamento (24h)</span>
                      <span
                        className={`text-xs font-medium ${
                          n.health.healthy ? 'text-base-content' : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {n.health.replied} de {n.health.sent} responderam
                        <span className="text-base-content/40">
                          {' '}({(n.health.replyRate * 100).toFixed(1)}%)
                        </span>
                        {n.health.failed > 0 && (
                          <span className="text-base-content/40"> · {n.health.failed} falhas</span>
                        )}
                      </span>
                    </div>
                    {!n.health.healthy && n.health.reason && (
                      <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700 dark:bg-red-500/10 dark:text-red-300">
                        <strong>Disparo travado:</strong> {n.health.reason}. Revise a lista e a
                        mensagem antes de reativar.
                      </p>
                    )}
                    {n.health.healthy && n.health.sent < 30 && (
                      <p className="mt-1 text-[11px] text-base-content/40">
                        Amostra pequena ({n.health.sent} envios) — o freio só avalia a partir de 30.
                      </p>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {qrLinha && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setQrLinha(null)}
        >
          <div className="w-full max-w-sm rounded-xl bg-base-100 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              {/* O rótulo da linha no título não é decoração: é a última chance
                  de perceber que o QR aberto é do número errado ANTES de escanear. */}
              <h3 className="text-sm font-semibold text-base-content">
                Reconectar — {linhaLabel(qrLinha)}
              </h3>
              <button onClick={() => setQrLinha(null)} className="text-lg leading-none text-base-content/50 hover:text-base-content">×</button>
            </div>

            {connected ? (
              <div className="py-6 text-center">
                <p className="text-2xl">✅</p>
                <p className="mt-2 text-sm font-medium text-base-content">Conectado!</p>
                <p className="mt-1 text-xs text-base-content/50">O número está pronto para enviar.</p>
                <Button
                  className="mt-4"
                  onClick={() => {
                    setQrLinha(null);
                    qc.invalidateQueries({ queryKey: ['whatsapp-status'] });
                    qc.invalidateQueries({ queryKey: ['sender-numbers'] });
                    refetch();
                  }}
                >
                  Fechar
                </Button>
              </div>
            ) : restart.isPending || !qr.data?.qr ? (
              <div className="py-8 text-center">
                <div className="mb-3 flex justify-center text-base-content/40">
                  <Icon name="refresh" className="h-8 w-8 animate-spin" />
                </div>
                <p className="text-sm text-base-content/70">Reiniciando a sessão e gerando o QR…</p>
                <p className="mt-1 text-[11px] text-base-content/40">status: {qr.data?.status ?? '—'}</p>
              </div>
            ) : (
              <div className="text-center">
                <img src={qr.data?.qr} alt="QR code de pareamento" className="mx-auto h-56 w-56 rounded-lg bg-white p-2" />
                <ol className="mt-4 space-y-1 text-left text-xs text-base-content/70">
                  <li>1. Abra o WhatsApp no celular do número.</li>
                  <li>2. Toque em <b>Configurações → Aparelhos conectados</b>.</li>
                  <li>3. Toque em <b>Conectar aparelho</b> e escaneie este QR.</li>
                </ol>
                <p className="mt-3 text-[11px] text-base-content/40">Atualiza sozinho — assim que conectar, esta janela confirma.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </PageContainer>
  );
}
