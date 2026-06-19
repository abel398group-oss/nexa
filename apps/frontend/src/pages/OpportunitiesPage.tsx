/**
 * OpportunitiesPage — Pipeline de vendas (/opportunities).
 *
 * Lista as oportunidades do tenant com:
 *   - Cards de resumo por estágio (GET /opportunities/summary)
 *   - Lista com busca, filtro por estágio e paginação (GET /opportunities)
 *   - Criar/editar via modal (POST / PATCH /:id)
 *   - Mover estágio inline (PATCH /:id/stage)
 *   - Excluir com confirmação (DELETE /:id)
 *
 * Segue o padrão canônico de listas do Nexa (ContactsPage / CampaignsPage).
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/lib/api';
import { useToast } from '@/app/providers/ToastContext';
import { useConfirm } from '@/app/providers/ConfirmContext';
import {
  Button, Card, Input, Select, Modal, Label, Textarea,
  PageContainer, PageHeader, Breadcrumb, Icon,
  SkeletonList, EmptyState, ErrorState, Pagination, KpiCard,
} from '@/shared/ui';
import { displayPhone } from '@/shared/lib/phone';

// ── Tipos ──────────────────────────────────────────────────────────────────────

type OppStage = 'new' | 'qualified' | 'proposal' | 'won' | 'lost';

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
}

interface OppSummaryRow { stage: OppStage; count: number; value: number }

// ── Constantes ─────────────────────────────────────────────────────────────────

const STAGES: { key: OppStage; label: string; badgeCls: string }[] = [
  { key: 'new',       label: 'Novo',        badgeCls: 'bg-base-200 text-base-content/70' },
  { key: 'qualified', label: 'Qualificado', badgeCls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' },
  { key: 'proposal',  label: 'Proposta',    badgeCls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  { key: 'won',       label: 'Ganho',       badgeCls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  { key: 'lost',      label: 'Perdido',     badgeCls: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300' },
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
  // Backend: [{ stage, count, value }] — mapeado pelo service antes de retornar
  return r.data as OppSummaryRow[];
}

// ── Form (create / edit) ───────────────────────────────────────────────────────

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

// ── Página principal ──────────────────────────────────────────────────────────

export function OpportunitiesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

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

  // ── Queries ──

  const summaryQ = useQuery({
    queryKey: ['opportunities-summary'],
    queryFn: getOpportunitiesSummary,
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

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['opportunities'] });
    qc.invalidateQueries({ queryKey: ['opportunities-summary'] });
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
    const payload: Record<string, any> = {};
    if (form.name.trim())          payload.name = form.name.trim();
    if (form.company.trim())       payload.company = form.company.trim();
    if (form.phone.trim())         payload.phone = form.phone.trim();
    if (form.assignedTo.trim())    payload.assignedTo = form.assignedTo.trim();
    if (form.summary.trim())       payload.summary = form.summary.trim();
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

  async function moveStage(id: string, stage: OppStage) {
    try {
      await api.patch(`/opportunities/${id}/stage`, { stage });
      invalidate();
    } catch {
      toast.error('Erro ao mover estágio.');
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

  // ── Resumo ──

  const summary = summaryQ.data ?? [];
  const summaryByStage = Object.fromEntries(
    summary.map((r) => [r.stage, r]),
  ) as Partial<Record<OppStage, OppSummaryRow>>;
  const totalValue = summary.reduce((acc, r) => acc + (r.value ?? 0), 0);
  const totalCount = summary.reduce((acc, r) => acc + (r.count ?? 0), 0);

  // ── Lista ──

  const items = listQ.data?.items ?? [];
  const total = listQ.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE));

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <PageContainer>
      <PageHeader
        title="Oportunidades"
        breadcrumb={<Breadcrumb items={[{ label: 'Vendas' }, { label: 'Oportunidades' }]} />}
        actions={
          <Button onClick={openCreate}>
            <Icon name="plus" className="h-4 w-4" /> Nova oportunidade
          </Button>
        }
      />

      {/* ── Resumo do funil ────────────────────────────────────────────────── */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label="Total"
          value={String(totalCount)}
          sub={fmtBrl(totalValue)}
          tone="muted"
        />
        {STAGES.map((s) => {
          const row = summaryByStage[s.key];
          return (
            <KpiCard
              key={s.key}
              label={s.label}
              value={String(row?.count ?? 0)}
              sub={fmtBrl(row?.value)}
              tone={s.key === 'won' ? 'pos' : s.key === 'lost' ? 'neg' : 'muted'}
            />
          );
        })}
      </div>

      {/* ── Filtros ────────────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar por nome, empresa ou telefone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={stageFilter}
          onChange={(e) => { setStageFilter(e.target.value); setPage(1); }}
          className="w-44"
        >
          <option value="">Todos os estágios</option>
          {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </Select>
      </div>

      {/* ── Lista ──────────────────────────────────────────────────────────── */}
      {listQ.isLoading && <SkeletonList rows={6} />}
      {listQ.isError && <ErrorState title="Erro ao carregar oportunidades." />}

      {!listQ.isLoading && !listQ.isError && items.length === 0 && (
        <EmptyState
          icon={<Icon name="dollar" className="h-9 w-9" />}
          title="Nenhuma oportunidade"
          description="Crie a primeira oportunidade ou aguarde que a Lia detecte um lead quente."
          action={<Button onClick={openCreate}><Icon name="plus" className="h-4 w-4" /> Nova</Button>}
        />
      )}

      {!listQ.isLoading && items.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-base-200 bg-base-100 text-xs font-semibold uppercase tracking-wide text-base-content/50">
                  <th className="px-4 py-3 text-left">Oportunidade</th>
                  <th className="px-4 py-3 text-left hidden sm:table-cell">Contato</th>
                  <th className="px-4 py-3 text-left">Estágio</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">Score</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">Valor</th>
                  <th className="px-4 py-3 text-left hidden lg:table-cell">Responsável</th>
                  <th className="px-4 py-3 text-left hidden lg:table-cell">Atualizado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {items.map((o) => (
                  <tr key={o.id} className="border-b border-base-200 hover:bg-base-100/60 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-base-content">{o.name || '—'}</div>
                      {o.company && <div className="text-xs text-base-content/50">{o.company}</div>}
                      {o.intent && (
                        <div className="text-xs text-base-content/40 truncate max-w-[180px]" title={o.intent}>
                          {o.intent}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-base-content/70">
                      {o.phone ? displayPhone(o.phone) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {/* Mover estágio inline via Select */}
                      <Select
                        value={o.stage}
                        onChange={(e) => moveStage(o.id, e.target.value as OppStage)}
                        className="!h-7 !py-0 text-xs !w-auto"
                        title="Mover estágio"
                      >
                        {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </Select>
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell">
                      {o.interestScore != null ? (
                        <span
                          className={`text-sm font-medium ${
                            o.interestScore >= 70 ? 'text-emerald-600' :
                            o.interestScore >= 40 ? 'text-amber-600' : 'text-base-content/50'
                          }`}
                        >
                          {o.interestScore}
                        </span>
                      ) : <span className="text-base-content/30">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell font-mono text-sm text-base-content/80">
                      {fmtBrl(o.value)}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-base-content/60 text-xs">
                      {o.assignedTo || '—'}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-base-content/40 text-xs">
                      {fmtDate(o.updatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(o)}
                          className="rounded p-1.5 text-base-content/40 hover:bg-base-200 hover:text-base-content"
                          title="Editar"
                        >
                          <Icon name="edit" className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(o.id, o.name)}
                          className="rounded p-1.5 text-base-content/40 hover:bg-red-50 hover:text-red-600"
                          title="Excluir"
                        >
                          <Icon name="trash" className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {pageCount > 1 && (
        <div className="mt-4 flex justify-center">
          <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
        </div>
      )}

      {/* ── Modal criar / editar ──────────────────────────────────────────── */}
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
    </PageContainer>
  );
}
