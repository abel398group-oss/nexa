/**
 * OpportunitiesPage — Pipeline de vendas (/opportunities).
 *
 * Lista as oportunidades do tenant com:
 *   - Cards de resumo por estágio (GET /opportunities/summary)
 *   - Lista com busca, filtro por estágio e paginação (GET /opportunities)
 *   - Criar/editar via modal (POST / PATCH /:id)
 *   - Mover estágio inline (PATCH /:id/stage)
 *   - Excluir com confirmação (DELETE /:id)
 */
import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/lib/api';
import { useToast } from '@/app/providers/ToastContext';
import { useConfirm } from '@/app/providers/ConfirmContext';
import { useAuth } from '@/app/providers/AuthContext';
import {
  Button, Input, Select, Modal, Label, Textarea, Icon, KpiCard,
} from '@/shared/ui';
import { displayPhone } from '@/shared/lib/phone';
import { StandardListPage } from '@/components/shared/StandardListPage';
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable';
import { listPartners, recordPartnerConsent, shareLeadWithPartner } from '@/entities/partner';
import type { EvolutionPoint } from './OpportunitiesEvolutionChart';

// F6+: recharts em chunk async (mesmo padrão do DashboardActivityChart)
const EvolutionChart = lazy(() => import('./OpportunitiesEvolutionChart'));

// ── Tipos ──────────────────────────────────────────────────────────────────────

// F6+ seller-leads: + paused (pausedUntil) e discarded (discardReason)
type OppStage = 'new' | 'qualified' | 'proposal' | 'paused' | 'won' | 'lost' | 'discarded';

interface Opportunity {
  id: string;
  name?: string | null;
  company?: string | null;
  phone?: string | null;
  stage: OppStage;
  interestScore?: number | null;
  intent?: string | null;
  summary?: string | null;
  value?: string | number | null; // Decimal vem como string do JSON
  assignedTo?: string | null;
  conversationId?: string | null;
  contactId?: string | null;
  createdAt: string;
  updatedAt: string;
  // F7 (RevOps): indicação a parceiro externo. `partnerConsentAt` é o carimbo
  // de consentimento LGPD — sem ele o backend recusa o compartilhamento.
  sharedWithPartnerId?: string | null;
  partnerShareStatus?: string | null;
  partnerSharedAt?: string | null;
  partnerConsentAt?: string | null;
}

interface OppSummaryRow { stage: OppStage; count: number; value: number }

// ── Constantes ─────────────────────────────────────────────────────────────────

const STAGES: { key: OppStage; label: string }[] = [
  { key: 'new',       label: 'Novo'        },
  { key: 'qualified', label: 'Qualificado' },
  { key: 'proposal',  label: 'Proposta'    },
  { key: 'paused',    label: 'Pausado'     },
  { key: 'won',       label: 'Ganho'       },
  { key: 'lost',      label: 'Perdido'     },
  { key: 'discarded', label: 'Descartado'  },
];

// Precisa bater com DISCARD_REASONS do backend (opportunities.service.ts)
const DISCARD_REASONS: { key: string; label: string }[] = [
  { key: 'sem_fit',      label: 'Sem fit com o produto' },
  { key: 'sem_resposta', label: 'Sem resposta'          },
  { key: 'concorrente',  label: 'Foi para concorrente'  },
  { key: 'outro',        label: 'Outro'                 },
];

// F7 (RevOps): registro manual de atividade do vendedor — precisa bater com
// ACTIVITY_TYPES do backend (seller-activity.service.ts).
const ACTIVITY_TYPES: { key: string; label: string }[] = [
  { key: 'call',  label: 'Ligação' },
  { key: 'email', label: 'E-mail'  },
  { key: 'note',  label: 'Nota'    },
];
const CALL_RESULTS: { key: string; label: string }[] = [
  { key: 'atendeu',         label: 'Atendeu'         },
  { key: 'nao_atendeu',     label: 'Não atendeu'     },
  { key: 'agendou_retorno', label: 'Agendou retorno' },
  { key: 'outro',           label: 'Outro'           },
];
const EMAIL_RESULTS: { key: string; label: string }[] = [
  { key: 'enviado',    label: 'Enviado'    },
  { key: 'respondido', label: 'Respondido' },
  { key: 'outro',      label: 'Outro'      },
];

const PAGE = 30;

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtBrl(val: string | number | null | undefined): string {
  if (val === null || val === undefined || val === '') return '—';
  const n = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// ── API ────────────────────────────────────────────────────────────────────────

async function listOpportunities(params: { search?: string; stage?: string; limit: number; offset: number }) {
  const p = new URLSearchParams({ limit: String(params.limit), offset: String(params.offset) });
  if (params.search) p.set('search', params.search);
  if (params.stage) p.set('stage', params.stage);
  const r = await api.get(`/opportunities?${p}`);
  return r.data as { items: Opportunity[]; total: number };
}

async function getOpportunitiesSummary() {
  const r = await api.get('/opportunities/summary');
  return r.data as OppSummaryRow[];
}

// F6+: evolução semanal recebidos × fechados (escopo do usuário vem do JWT no backend)
async function getOpportunitiesEvolution(weeks = 8) {
  const r = await api.get(`/opportunities/evolution?weeks=${weeks}`);
  return r.data as EvolutionPoint[];
}

// ── Form ───────────────────────────────────────────────────────────────────────

interface OppForm {
  name: string; company: string; phone: string;
  value: string; interestScore: string;
  summary: string; assignedTo: string;
}

const EMPTY_FORM: OppForm = {
  name: '', company: '', phone: '',
  value: '', interestScore: '',
  summary: '', assignedTo: '',
};

function formFromOpp(o: Opportunity): OppForm {
  return {
    name: o.name ?? '',
    company: o.company ?? '',
    phone: o.phone ?? '',
    value: o.value != null ? String(o.value) : '',
    interestScore: o.interestScore != null ? String(o.interestScore) : '',
    summary: o.summary ?? '',
    assignedTo: o.assignedTo ?? '',
  };
}

// ── Colunas da tabela ─────────────────────────────────────────────────────────

function buildColumns(
  moveStage: (id: string, stage: OppStage, fromStage: OppStage) => void,
  openEdit: (o: Opportunity) => void,
): DataTableColumn<Opportunity>[] {
  return [
    {
      id: 'name',
      header: 'Oportunidade',
      mobileTitle: true,
      cell: (o) => (
        <div>
          <div className="font-medium text-base-content">{o.name || '—'}</div>
          {o.company && <div className="text-xs text-base-content/50">{o.company}</div>}
          {o.intent && (
            <div className="truncate max-w-[180px] text-xs text-base-content/40" title={o.intent}>
              {o.intent}
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'phone',
      header: 'Contato',
      mobileHidden: true,
      cell: (o) => <span className="text-base-content/70">{o.phone ? displayPhone(o.phone) : '—'}</span>,
    },
    {
      id: 'stage',
      header: 'Estágio',
      cell: (o) => (
        <Select
          value={o.stage}
          onChange={(e) => moveStage(o.id, e.target.value as OppStage, o.stage)}
          className="!h-7 !py-0 text-xs !w-auto"
          title="Mover estágio"
        >
          {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </Select>
      ),
    },
    {
      id: 'score',
      header: 'Score',
      align: 'right',
      mobileHidden: true,
      cell: (o) =>
        o.interestScore != null ? (
          <span
            className={`text-sm font-medium ${
              o.interestScore >= 70 ? 'text-emerald-600' :
              o.interestScore >= 40 ? 'text-amber-600' : 'text-base-content/50'
            }`}
          >
            {o.interestScore}
          </span>
        ) : (
          <span className="text-base-content/30">—</span>
        ),
    },
    {
      id: 'value',
      header: 'Valor',
      align: 'right',
      mobileHidden: true,
      cell: (o) => <span className="font-mono text-sm text-base-content/80">{fmtBrl(o.value)}</span>,
    },
    {
      id: 'assignedTo',
      header: 'Responsável',
      mobileHidden: true,
      cell: (o) => <span className="text-xs text-base-content/60">{o.assignedTo || '—'}</span>,
    },
    {
      id: 'updatedAt',
      header: 'Atualizado',
      mobileHidden: true,
      cell: (o) => <span className="text-xs text-base-content/40">{fmtDate(o.updatedAt)}</span>,
    },
  ];
}

// ── Página principal ──────────────────────────────────────────────────────────

export function OpportunitiesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  // F6+ seller-leads: vendedor vê a página como "Meus leads" (o backend já
  // restringe o escopo pelo JWT — aqui é só apresentação).
  const { user } = useAuth();
  const isSeller = user?.role === 'vendedor';

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce da busca
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  // Modal criar/editar
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Opportunity | null>(null);
  const [form, setForm] = useState<OppForm>(EMPTY_FORM);
  const [formBusy, setFormBusy] = useState(false);

  // Modal pausar/descartar — pausedUntil e discardReason só existem se
  // coletados aqui; o PATCH /:id/stage genérico não pergunta por eles.
  const [stagePrompt, setStagePrompt] = useState<{ id: string; stage: 'paused' | 'discarded' } | null>(null);
  const [pausedUntilInput, setPausedUntilInput] = useState('');
  const [discardReasonInput, setDiscardReasonInput] = useState('');
  const [stageBusy, setStageBusy] = useState(false);

  // Modal "Registrar atividade" (F7 — RevOps): ligação/e-mail/nota manual do vendedor.
  const [activityPrompt, setActivityPrompt] = useState<Opportunity | null>(null);
  const [activityForm, setActivityForm] = useState({ type: 'call', result: '', durationSec: '', notes: '' });
  const [activityBusy, setActivityBusy] = useState(false);

  // Modal "Compartilhar com parceiro" (F7 — RevOps). O consentimento é marcado
  // aqui de propósito: é o vendedor confirmando que o LEAD autorizou, e o
  // backend recusa o compartilhamento sem esse carimbo (LGPD).
  const [sharePrompt, setSharePrompt] = useState<Opportunity | null>(null);
  const [sharePartnerId, setSharePartnerId] = useState('');
  const [shareConsent, setShareConsent] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);

  // ── Queries ──

  const summaryQ = useQuery({
    queryKey: ['opportunities-summary'],
    queryFn: getOpportunitiesSummary,
  });

  // F6+: evolução semanal (gráfico)
  const evolutionQ = useQuery({
    queryKey: ['opportunities-evolution'],
    queryFn: () => getOpportunitiesEvolution(8),
  });

  const listQ = useQuery({
    queryKey: ['opportunities', debouncedSearch, stageFilter, page],
    queryFn: () => listOpportunities({
      search: debouncedSearch || undefined,
      stage: stageFilter || undefined,
      limit: PAGE,
      offset: (page - 1) * PAGE,
    }),
    placeholderData: (prev) => prev,
  });

  // Só busca parceiros quando o modal de compartilhar abre — a maioria das
  // sessões nunca usa essa ação.
  const partnersQ = useQuery({
    queryKey: ['partners'],
    queryFn: () => listPartners(),
    enabled: sharePrompt !== null,
  });
  const activePartners = (partnersQ.data ?? []).filter((p) => p.active);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['opportunities'] });
    qc.invalidateQueries({ queryKey: ['opportunities-summary'] });
    qc.invalidateQueries({ queryKey: ['opportunities-evolution'] });
  }, [qc]);

  // ── Handlers ──

  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(o: Opportunity) {
    setEditTarget(o);
    setForm(formFromOpp(o));
    setModalOpen(true);
  }

  function fieldChange(k: keyof OppForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));
  }

  async function submitForm() {
    if (formBusy) return;
    const payload: Record<string, unknown> = {};
    if (form.name.trim())         payload.name = form.name.trim();
    if (form.company.trim())      payload.company = form.company.trim();
    if (form.phone.trim())        payload.phone = form.phone.trim();
    if (form.assignedTo.trim())   payload.assignedTo = form.assignedTo.trim();
    if (form.summary.trim())      payload.summary = form.summary.trim();
    if (form.value.trim()) {
      const v = parseFloat(form.value.replace(',', '.'));
      if (!isNaN(v)) payload.value = v;
    }
    if (form.interestScore.trim()) {
      const n = parseInt(form.interestScore, 10);
      if (!isNaN(n)) payload.interestScore = Math.min(100, Math.max(0, n));
    }
    setFormBusy(true);
    try {
      if (editTarget) {
        await api.patch(`/opportunities/${editTarget.id}`, payload);
        toast.success('Oportunidade atualizada.');
      } else {
        await api.post('/opportunities', payload);
        toast.success('Oportunidade criada.');
      }
      setModalOpen(false);
      invalidate();
    } catch {
      toast.error('Erro ao salvar. Tente novamente.');
    } finally {
      setFormBusy(false);
    }
  }

  function openActivity(o: Opportunity) {
    setActivityForm({ type: 'call', result: '', durationSec: '', notes: '' });
    setActivityPrompt(o);
  }

  async function submitActivity() {
    if (!activityPrompt || activityBusy) return;
    setActivityBusy(true);
    try {
      const payload: Record<string, unknown> = { opportunityId: activityPrompt.id, type: activityForm.type };
      if (activityForm.result) payload.result = activityForm.result;
      if (activityForm.type === 'call' && activityForm.durationSec.trim()) {
        const d = parseInt(activityForm.durationSec, 10);
        if (!isNaN(d) && d >= 0) payload.durationSec = d;
      }
      if (activityForm.notes.trim()) payload.notes = activityForm.notes.trim();
      await api.post('/seller-activities', payload);
      toast.success('Atividade registrada.');
      setActivityPrompt(null);
    } catch {
      toast.error('Erro ao registrar atividade.');
    } finally {
      setActivityBusy(false);
    }
  }

  function openShare(o: Opportunity) {
    setSharePartnerId('');
    // Consentimento já registrado antes não precisa ser remarcado — o carimbo
    // no banco é a prova, e ele é permanente (o backend não sobrescreve).
    setShareConsent(!!o.partnerConsentAt);
    setSharePrompt(o);
  }

  async function submitShare() {
    if (!sharePrompt || shareBusy || !sharePartnerId || !shareConsent) return;
    setShareBusy(true);
    try {
      // Ordem obrigatória: consentimento primeiro. O backend recusa (400) o
      // compartilhamento se `partnerConsentAt` ainda estiver vazio.
      if (!sharePrompt.partnerConsentAt) {
        await recordPartnerConsent(sharePrompt.id);
      }
      await shareLeadWithPartner(sharePrompt.id, sharePartnerId);
      toast.success('Lead indicado ao parceiro.');
      setSharePrompt(null);
      invalidate();
    } catch (e: any) {
      const m = e?.response?.data?.message;
      toast.error(Array.isArray(m) ? m.join(', ') : m || 'Erro ao compartilhar.');
    } finally {
      setShareBusy(false);
    }
  }

  // Pausado e descartado têm um motivo/data associados (pausedUntil,
  // discardReason) — abre um modal pra coletar em vez de mandar o PATCH direto.
  // Sair de Ganho/Perdido (estágios finais) pelo dropdown inline pede
  // confirmação — um clique errado não deve reverter um negócio fechado.
  function moveStage(id: string, stage: OppStage, fromStage: OppStage) {
    if (stage === 'paused' || stage === 'discarded') {
      setPausedUntilInput('');
      setDiscardReasonInput('');
      setStagePrompt({ id, stage });
      return;
    }
    if ((fromStage === 'won' || fromStage === 'lost') && stage !== fromStage) {
      void confirmLeaveClosedStage(id, stage, fromStage);
      return;
    }
    void applyStage(id, stage, {});
  }

  async function confirmLeaveClosedStage(id: string, stage: OppStage, fromStage: 'won' | 'lost') {
    const fromLabel = fromStage === 'won' ? 'Ganho' : 'Perdido';
    const toLabel = STAGES.find((s) => s.key === stage)?.label ?? stage;
    const ok = await confirm({
      title: 'Reabrir oportunidade',
      message: `Esta oportunidade está marcada como "${fromLabel}". Confirma mudar para "${toLabel}"?`,
      confirmLabel: 'Confirmar',
      variant: 'danger',
    });
    if (!ok) return;
    await applyStage(id, stage, {});
  }

  async function applyStage(id: string, stage: OppStage, extra: { pausedUntil?: string; discardReason?: string }) {
    try {
      await api.patch(`/opportunities/${id}/stage`, { stage, ...extra });
      invalidate();
    } catch {
      toast.error('Erro ao mover estágio.');
    }
  }

  async function confirmStagePrompt() {
    if (!stagePrompt || stageBusy) return;
    setStageBusy(true);
    try {
      const extra: { pausedUntil?: string; discardReason?: string } = {};
      if (stagePrompt.stage === 'paused' && pausedUntilInput) {
        extra.pausedUntil = new Date(pausedUntilInput).toISOString();
      }
      if (stagePrompt.stage === 'discarded' && discardReasonInput) {
        extra.discardReason = discardReasonInput;
      }
      await applyStage(stagePrompt.id, stagePrompt.stage, extra);
      toast.success(stagePrompt.stage === 'paused' ? 'Lead pausado.' : 'Lead descartado.');
      setStagePrompt(null);
    } finally {
      setStageBusy(false);
    }
  }

  async function handleDelete(id: string, name?: string | null) {
    const ok = await confirm({
      title: 'Excluir oportunidade',
      message: `Confirma a exclusão de "${name || 'esta oportunidade'}"? Essa ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/opportunities/${id}`);
      toast.success('Oportunidade excluída.');
      invalidate();
    } catch {
      toast.error('Erro ao excluir.');
    }
  }

  // ── Dados ──

  const summary = summaryQ.data ?? [];
  const summaryByStage = Object.fromEntries(
    summary.map((r) => [r.stage, r]),
  ) as Partial<Record<OppStage, OppSummaryRow>>;
  const totalValue = summary.reduce((acc, r) => acc + (r.value ?? 0), 0);
  const totalCount = summary.reduce((acc, r) => acc + (r.count ?? 0), 0);

  const items = listQ.data?.items ?? [];
  const total = listQ.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE));

  const columns = buildColumns(moveStage, openEdit);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <StandardListPage
        title={isSeller ? 'Meus leads' : 'Oportunidades'}
        breadcrumb={[{ label: 'Vendas' }, { label: isSeller ? 'Meus leads' : 'Oportunidades' }]}
        isLoading={listQ.isLoading && !listQ.isPlaceholderData}
        hasData={items.length > 0}
        error={listQ.error}
        totalItems={total}
        entityName="oportunidades"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por nome, empresa ou telefone…"
        filtersContent={
          <Select
            value={stageFilter}
            onChange={(e) => { setStageFilter(e.target.value); setPage(1); }}
            className="w-44"
          >
            <option value="">Todos os estágios</option>
            {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </Select>
        }
        headerActions={
          <Button onClick={openCreate}>
            <Icon name="plus" className="h-4 w-4" /> Nova oportunidade
          </Button>
        }
        topContent={
          <>
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard label="Total" value={String(totalCount)} sub={fmtBrl(totalValue)} tone="muted" />
              {STAGES.map((s) => {
                const row = summaryByStage[s.key];
                return (
                  <KpiCard
                    key={s.key}
                    label={s.label}
                    value={String(row?.count ?? 0)}
                    sub={fmtBrl(row?.value)}
                    tone={s.key === 'won' ? 'pos' : s.key === 'lost' || s.key === 'discarded' ? 'neg' : 'muted'}
                  />
                );
              })}
            </div>
            {(evolutionQ.data?.some((p) => p.received > 0 || p.won > 0) ?? false) && (
              <div className="mb-5 rounded-xl border border-base-300 bg-base-100 p-4">
                <p className="mb-2 text-sm font-medium text-base-content/70">
                  Evolução semanal — recebidos × fechados
                </p>
                <Suspense fallback={<div className="h-[200px]" />}>
                  <EvolutionChart series={evolutionQ.data ?? []} />
                </Suspense>
              </div>
            )}
          </>
        }
        pagination={{ page, pageCount, onPageChange: setPage }}
      >
        <DataTable
          columns={columns}
          rows={items}
          getRowId={(o) => o.id}
          rowActions={(o) => [
            { label: 'Editar', onClick: () => openEdit(o) },
            { label: 'Registrar atividade', onClick: () => openActivity(o) },
            {
              label: o.sharedWithPartnerId ? 'Indicado a parceiro ✓' : 'Compartilhar com parceiro',
              onClick: () => openShare(o),
            },
            { label: 'Excluir', onClick: () => handleDelete(o.id, o.name), destructive: true },
          ]}
          empty={{
            title: 'Nenhuma oportunidade',
            description: 'Crie a primeira oportunidade ou aguarde que a Lia detecte um lead quente.',
            action: (
              <Button onClick={openCreate}>
                <Icon name="plus" className="h-4 w-4" /> Nova
              </Button>
            ),
          }}
        />
      </StandardListPage>

      {/* Modal criar / editar */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? 'Editar oportunidade' : 'Nova oportunidade'}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1 block">Nome</Label>
              <Input value={form.name} onChange={fieldChange('name')} placeholder="Ex.: Transportadora ABC" />
            </div>
            <div>
              <Label className="mb-1 block">Empresa</Label>
              <Input value={form.company} onChange={fieldChange('company')} placeholder="Razão social" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1 block">Telefone</Label>
              <Input value={form.phone} onChange={fieldChange('phone')} placeholder="(11) 9 9999-9999" />
            </div>
            <div>
              <Label className="mb-1 block">Valor estimado (R$)</Label>
              <Input value={form.value} onChange={fieldChange('value')} placeholder="0,00" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1 block">Score de interesse (0–100)</Label>
              <Input value={form.interestScore} onChange={fieldChange('interestScore')} placeholder="Ex.: 75" />
            </div>
            <div>
              <Label className="mb-1 block">Responsável</Label>
              <Input value={form.assignedTo} onChange={fieldChange('assignedTo')} placeholder="Nome do vendedor" />
            </div>
          </div>
          <div>
            <Label className="mb-1 block">Resumo / observações</Label>
            <Textarea
              value={form.summary}
              onChange={fieldChange('summary')}
              rows={3}
              placeholder="Contexto do lead, intenção, objeções…"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={submitForm} disabled={formBusy}>
              {editTarget ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal pausar / descartar — coleta pausedUntil ou discardReason antes do PATCH */}
      <Modal
        open={stagePrompt !== null}
        onClose={() => setStagePrompt(null)}
        title={stagePrompt?.stage === 'paused' ? 'Pausar oportunidade' : 'Descartar oportunidade'}
      >
        <div className="space-y-4">
          {stagePrompt?.stage === 'paused' && (
            <div>
              <Label className="mb-1 block">Retomar em (opcional)</Label>
              <Input
                type="date"
                value={pausedUntilInput}
                onChange={(e) => setPausedUntilInput(e.target.value)}
              />
            </div>
          )}
          {stagePrompt?.stage === 'discarded' && (
            <div>
              <Label className="mb-1 block">Motivo</Label>
              <Select value={discardReasonInput} onChange={(e) => setDiscardReasonInput(e.target.value)}>
                <option value="">Selecione um motivo…</option>
                {DISCARD_REASONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </Select>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setStagePrompt(null)}>Cancelar</Button>
            <Button
              onClick={confirmStagePrompt}
              disabled={stageBusy || (stagePrompt?.stage === 'discarded' && !discardReasonInput)}
            >
              {stagePrompt?.stage === 'paused' ? 'Pausar' : 'Descartar'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal registrar atividade (F7 — RevOps): POST /seller-activities */}
      <Modal
        open={activityPrompt !== null}
        onClose={() => setActivityPrompt(null)}
        title={`Registrar atividade${activityPrompt?.name ? ` — ${activityPrompt.name}` : ''}`}
      >
        <div className="space-y-4">
          <div>
            <Label className="mb-1 block">Tipo</Label>
            <Select
              value={activityForm.type}
              onChange={(e) => setActivityForm((f) => ({ ...f, type: e.target.value, result: '' }))}
            >
              {ACTIVITY_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </Select>
          </div>
          {activityForm.type !== 'note' && (
            <div>
              <Label className="mb-1 block">Resultado</Label>
              <Select
                value={activityForm.result}
                onChange={(e) => setActivityForm((f) => ({ ...f, result: e.target.value }))}
              >
                <option value="">Selecione (opcional)…</option>
                {(activityForm.type === 'call' ? CALL_RESULTS : EMAIL_RESULTS).map((r) => (
                  <option key={r.key} value={r.key}>{r.label}</option>
                ))}
              </Select>
            </div>
          )}
          {activityForm.type === 'call' && (
            <div>
              <Label className="mb-1 block">Duração (segundos, opcional)</Label>
              <Input
                type="number"
                min={0}
                value={activityForm.durationSec}
                onChange={(e) => setActivityForm((f) => ({ ...f, durationSec: e.target.value }))}
                placeholder="Ex.: 180"
              />
            </div>
          )}
          <div>
            <Label className="mb-1 block">Notas (opcional)</Label>
            <Textarea
              value={activityForm.notes}
              onChange={(e) => setActivityForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              placeholder="O que foi combinado, próximos passos…"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setActivityPrompt(null)}>Cancelar</Button>
            <Button onClick={submitActivity} disabled={activityBusy}>Registrar</Button>
          </div>
        </div>
      </Modal>

      {/* Modal compartilhar com parceiro (F7 — RevOps + LGPD) */}
      <Modal
        open={sharePrompt !== null}
        onClose={() => setSharePrompt(null)}
        title={`Compartilhar com parceiro${sharePrompt?.name ? ` — ${sharePrompt.name}` : ''}`}
      >
        <div className="space-y-4">
          {sharePrompt?.sharedWithPartnerId && (
            <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              Este lead já foi indicado a um parceiro
              {sharePrompt.partnerSharedAt ? ` em ${fmtDate(sharePrompt.partnerSharedAt)}` : ''}.
              Compartilhar de novo troca o parceiro indicado.
            </p>
          )}

          {activePartners.length === 0 ? (
            <p className="rounded-lg bg-base-200 p-3 text-sm text-base-content/70">
              Nenhum parceiro ativo cadastrado. Cadastre a empresa parceira em <b>Vendas → Parceiros</b> antes
              de indicar um lead.
            </p>
          ) : (
            <>
              <div>
                <Label className="mb-1 block">Parceiro</Label>
                <Select value={sharePartnerId} onChange={(e) => setSharePartnerId(e.target.value)}>
                  <option value="">Selecione o parceiro…</option>
                  {activePartners.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
                  ))}
                </Select>
              </div>

              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-base-300 p-3">
                <input
                  type="checkbox"
                  checked={shareConsent}
                  onChange={(e) => setShareConsent(e.target.checked)}
                  disabled={!!sharePrompt?.partnerConsentAt}
                  className="mt-0.5 size-4 accent-brand-500"
                />
                <span className="text-xs text-base-content/70">
                  Confirmo que <b>o lead autorizou</b> o compartilhamento dos dados dele com este parceiro.
                  {sharePrompt?.partnerConsentAt && (
                    <span className="mt-1 block text-emerald-600">
                      Consentimento já registrado em {fmtDate(sharePrompt.partnerConsentAt)}.
                    </span>
                  )}
                </span>
              </label>

              <p className="text-xs text-base-content/40">
                Sem esse aceite o compartilhamento é recusado — a LGPD exige base legal para enviar dado
                pessoal a terceiro. Fica registrado a data e hora da autorização.
              </p>
            </>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setSharePrompt(null)}>Cancelar</Button>
            <Button
              onClick={submitShare}
              disabled={shareBusy || !sharePartnerId || !shareConsent || activePartners.length === 0}
            >
              Compartilhar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
