/**
 * SalesQueuePage — Fila de trabalho do vendedor (/fila).
 *
 * F7 (RevOps): o vendedor não procura nada. Abre, o lead mais urgente já está
 * na frente com o que a Lia descobriu, e ele decide em segundos: liga, assume
 * a conversa, ou move o estágio e cai o próximo.
 *
 * Antes disso ele precisava cruzar duas telas — Inbox pra ler a conversa,
 * Oportunidades pra mover o estágio — e escolher sozinho por quem começar.
 * A ordem de prioridade vem pronta do backend (ver OpportunitiesService.queue).
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/lib/api';
import { useToast } from '@/app/providers/ToastContext';
import { Button, Input, Select, Modal, Label, Textarea, Icon, Badge } from '@/shared/ui';
import type { BadgeVariant } from '@/components/ui/Badge';
import { displayPhone } from '@/shared/lib/phone';

interface QueueLead {
  id: string;
  name?: string | null;
  company?: string | null;
  phone?: string | null;
  stage: string;
  intent?: string | null;
  summary?: string | null;
  interestScore: number;
  conversationId?: string | null;
  waitingSince: string;
  pediuReuniao: boolean;
  lastMessage?: { direction: string; content: string; at: string } | null;
  /** Campanha que originou o lead — null quando entrou por outro caminho. */
  origemCampanha?: string | null;
}

// "há 12 min" / "há 3 h" / "há 2 d" — o vendedor pensa em quanto tempo o lead
// está parado, não em data e hora.
function esperaDesde(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `há ${min} min`;
  if (min < 60 * 24) return `há ${Math.round(min / 60)} h`;
  return `há ${Math.round(min / (60 * 24))} d`;
}

function iniciais(lead: QueueLead): string {
  const base = (lead.company || lead.name || '?').trim();
  const partes = base.split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || '?';
}

// Quente/morno seguem o mesmo corte do roteador (glossário: ≥70 quente, ≥40 morno).
function tempero(score: number): { label: string; variant: BadgeVariant } {
  if (score >= 70) return { label: 'quente', variant: 'error' };
  if (score >= 40) return { label: 'morno', variant: 'warning' };
  return { label: 'frio', variant: 'neutral' };
}

export function SalesQueuePage() {
  const [idx, setIdx] = useState(0);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityForm, setActivityForm] = useState({ result: '', durationSec: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: fila = [], isLoading } = useQuery<QueueLead[]>({
    queryKey: ['sales-queue'],
    queryFn: async () => (await api.get('/opportunities/queue')).data,
  });

  const lead = fila[idx];
  const invalidate = () => qc.invalidateQueries({ queryKey: ['sales-queue'] });

  // Depois de resolver um lead, a fila encolhe — o índice fica onde está e o
  // próximo sobe pra posição atual sozinho. Só recua se era o último.
  function aposResolver() {
    setIdx((i) => (i >= fila.length - 1 ? Math.max(0, i - 1) : i));
    invalidate();
  }

  async function moverEstagio(stage: string, rotulo: string) {
    if (!lead || busy) return;
    setBusy(true);
    try {
      await api.patch(`/opportunities/${lead.id}/stage`, { stage });
      toast.success(rotulo);
      aposResolver();
    } catch (e: any) {
      const m = e?.response?.data?.message;
      toast.error(Array.isArray(m) ? m.join(', ') : m || 'Erro ao mover estágio.');
    } finally {
      setBusy(false);
    }
  }

  function assumirConversa() {
    if (!lead) return;
    // O inbox aceita ?c=<conversationId> e já abre a thread certa.
    navigate(lead.conversationId ? `/inbox?c=${lead.conversationId}` : '/inbox');
  }

  async function registrarLigacao() {
    if (!lead || busy) return;
    setBusy(true);
    try {
      await api.post('/seller-activities', {
        opportunityId: lead.id,
        type: 'call',
        result: activityForm.result || undefined,
        durationSec: activityForm.durationSec ? Number(activityForm.durationSec) : undefined,
        notes: activityForm.notes || undefined,
      });
      toast.success('Ligação registrada.');
      setActivityOpen(false);
      setActivityForm({ result: '', durationSec: '', notes: '' });
      invalidate();
    } catch (e: any) {
      const m = e?.response?.data?.message;
      toast.error(Array.isArray(m) ? m.join(', ') : m || 'Erro ao registrar.');
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return <div className="p-8 text-center text-base-content/40">Carregando a fila...</div>;
  }

  if (!lead) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <Icon name="check" className="mx-auto mb-3 h-10 w-10 text-emerald-500" />
        <h2 className="text-lg font-medium text-base-content">Fila zerada</h2>
        <p className="mt-1 text-sm text-base-content/60">
          Nenhum lead esperando ação agora. Novos leads quentes entram aqui automaticamente.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/opportunities')}>
          Ver todas as oportunidades
        </Button>
      </div>
    );
  }

  const t = tempero(lead.interestScore);
  const proximos = fila.slice(idx + 1, idx + 4);

  return (
    <div className="mx-auto max-w-3xl px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-medium text-base-content">Minha fila</h1>
          <Badge variant={fila.length > 0 ? 'error' : 'neutral'}>{fila.length} esperando</Badge>
        </div>
        <span className="text-xs text-base-content/50">lead {idx + 1} de {fila.length}</span>
      </div>

      {/* Lead atual */}
      <div className="card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-full bg-brand-500/15 text-sm font-medium text-brand-500">
              {iniciais(lead)}
            </div>
            <div>
              <p className="font-medium text-base-content">{lead.company || lead.name || 'Lead sem nome'}</p>
              <p className="text-sm text-base-content/60">
                {[lead.company && lead.name, lead.phone && displayPhone(lead.phone)].filter(Boolean).join(' · ') || '—'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <Badge variant={t.variant}>{t.label} · {lead.interestScore}</Badge>
            <p className="mt-1.5 text-xs text-base-content/40">esperando {esperaDesde(lead.waitingSince)}</p>
            {lead.origemCampanha && (
              <p className="mt-0.5 text-xs text-base-content/40" title="Campanha que originou este lead">
                <Icon name="campaigns" className="mr-1 inline h-3 w-3 align-[-1px]" />
                {lead.origemCampanha}
              </p>
            )}
          </div>
        </div>

        {/* Contexto que a Lia já levantou */}
        <div className="mt-4 border-t border-base-300 pt-3">
          <p className="mb-2 text-xs text-base-content/40">
            <Icon name="bot" className="mr-1 inline h-4 w-4 align-[-3px]" />
            o que a Lia já resolveu
          </p>
          {lead.summary
            ? <p className="text-sm leading-relaxed text-base-content/70">{lead.summary}</p>
            : <p className="text-sm text-base-content/30">Sem resumo — abra a conversa para o contexto completo.</p>}
          {lead.pediuReuniao && (
            <p className="mt-2 text-sm text-amber-500">
              <Icon name="calendar" className="mr-1 inline h-4 w-4 align-[-3px]" />
              Pediu reunião — prioridade máxima.
            </p>
          )}
          {lead.lastMessage && (
            <p className="mt-2 text-xs leading-relaxed text-base-content/50">
              <span className="text-base-content/40">
                {lead.lastMessage.direction === 'inbound' ? 'última do lead: ' : 'última da Lia: '}
              </span>
              “{lead.lastMessage.content.slice(0, 180)}”
            </p>
          )}
        </div>

        {/* Ações principais */}
        <div className="mt-4 flex flex-wrap gap-2 border-t border-base-300 pt-3">
          <Button className="min-w-[160px] flex-1" onClick={() => setActivityOpen(true)}>
            <Icon name="clock" className="mr-1.5 h-4 w-4" /> Ligar e registrar
          </Button>
          <Button variant="outline" className="min-w-[160px] flex-1" onClick={assumirConversa}>
            <Icon name="inbox" className="mr-1.5 h-4 w-4" /> Assumir conversa
          </Button>
        </div>

        {/* Desfecho — um clique, sem modal, e o próximo sobe */}
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="flex-1" disabled={busy}
            onClick={() => moverEstagio('proposal', 'Movido para proposta.')}>
            Proposta enviada
          </Button>
          <Button variant="outline" size="sm" className="flex-1" disabled={busy}
            onClick={() => moverEstagio('won', 'Marcado como ganho!')}>
            Ganhou
          </Button>
          <Button variant="outline" size="sm" className="flex-1" disabled={busy}
            onClick={() => moverEstagio('lost', 'Marcado como perdido.')}>
            Sem interesse
          </Button>
        </div>
      </div>

      {/* Navegação: pular sem resolver não some com o lead, só passa a vez */}
      <div className="mt-3 flex items-center justify-between">
        <Button variant="ghost" size="sm" disabled={idx === 0} onClick={() => setIdx((i) => i - 1)}>
          <Icon name="chevronLeft" className="h-4 w-4" /> Anterior
        </Button>
        <Button variant="ghost" size="sm" disabled={idx >= fila.length - 1} onClick={() => setIdx((i) => i + 1)}>
          Pular <Icon name="chevronRight" className="h-4 w-4" />
        </Button>
      </div>

      {proximos.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs text-base-content/40">próximos na fila</p>
          <div className="card divide-y divide-base-300">
            {proximos.map((p, i) => {
              const pt = tempero(p.interestScore);
              return (
                <button
                  key={p.id}
                  onClick={() => setIdx(idx + 1 + i)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-base-200"
                >
                  <Badge variant={pt.variant}>{p.interestScore}</Badge>
                  <span className="flex-1 truncate text-sm text-base-content">
                    {p.company || p.name || displayPhone(p.phone ?? '') || 'Lead sem nome'}
                  </span>
                  <span className="text-xs text-base-content/40">
                    {p.pediuReuniao ? 'pediu reunião' : esperaDesde(p.waitingSince)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Registrar ligação — já sabe de quem é, o vendedor só diz o que rolou */}
      <Modal open={activityOpen} onClose={() => setActivityOpen(false)} title="Registrar ligação">
        <div className="space-y-4">
          <p className="text-xs text-base-content/50">
            {lead.company || lead.name} · {displayPhone(lead.phone ?? '')}
          </p>
          <div>
            <Label className="mb-1 block">Resultado</Label>
            <Select value={activityForm.result} onChange={(e) => setActivityForm((f) => ({ ...f, result: e.target.value }))}>
              <option value="">Selecione…</option>
              <option value="atendeu">Atendeu</option>
              <option value="nao_atendeu">Não atendeu</option>
              <option value="agendou_retorno">Agendou retorno</option>
              <option value="outro">Outro</option>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block">Duração (segundos, opcional)</Label>
            <Input type="number" min={0} value={activityForm.durationSec}
              onChange={(e) => setActivityForm((f) => ({ ...f, durationSec: e.target.value }))} />
          </div>
          <div>
            <Label className="mb-1 block">Anotações</Label>
            <Textarea rows={3} value={activityForm.notes}
              onChange={(e) => setActivityForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setActivityOpen(false)}>Cancelar</Button>
            <Button onClick={registrarLigacao} disabled={busy}>Registrar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
