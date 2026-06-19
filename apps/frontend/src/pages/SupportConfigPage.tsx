import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/lib/api';
import { useToast } from '@/app/providers/ToastContext';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Button, Textarea, PageContainer, PageHeader, Breadcrumb, Icon } from '@/shared/ui';

interface SupportPlaybook {
  category: string;
  name: string;
  steps: string[];
  escalate: string[];
}

const CATEGORY_LABEL: Record<string, string> = {
  cte:          'CT-e (emissão / rejeição)',
  mdfe:         'MDF-e (encerramento)',
  fiscal:       'Fiscal (certificado digital)',
  precificacao: 'Precificação / Frete',
  treinamento:  'Treinamento / Como faço',
  financeiro:   'Financeiro (contas / faturas)',
  frota:        'Frota (veículos / motoristas)',
  bug:          'Bug / Erro de sistema',
  acesso:       'Acesso / Usuários',
};

/**
 * Config de Suporte — tom/persona da Lia de SUPORTE + visualizador de playbooks.
 * Usa os mesmos endpoints do playbook (GET/PUT /playbook), editando só `supportPersona`.
 */
export function SupportConfigPage() {
  const [persona, setPersona] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const toast = useToast();

  // Playbooks determinísticos (read-only — definidos em código no backend)
  const { data: playbooks = [] } = useQuery<SupportPlaybook[]>({
    queryKey: ['support-playbooks'],
    queryFn: () => api.get('/playbook/support-playbooks').then((r) => r.data),
    staleTime: Infinity, // estáticos — não mudam sem deploy
  });

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get('/playbook');
        setPersona(r.data?.supportPersona ?? '');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    try {
      await api.put('/playbook', { supportPersona: persona });
      toast.success('Config de suporte salva! A Lia de suporte já usa o novo tom.');
    } catch {
      toast.error('Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Início', to: '/dashboard' }, { label: 'Suporte' }, { label: 'Config de Suporte' }]} />}
        title="Config de Suporte"
        subtitle="Tom e estilo da Lia no atendimento de suporte (clientes ativos). Separado do Playbook de Vendas."
        actions={<Button onClick={save} loading={saving} disabled={loading}><Icon name="check" className="h-4 w-4" /> Salvar</Button>}
      />

      {loading ? (
        <SkeletonList />
      ) : (
        <>
          {/* Tom / persona */}
          <section className="card space-y-2 p-5">
            <h2 className="text-sm font-semibold text-base-content">Tom e estilo (opcional)</h2>
            <p className="text-xs text-base-content/50">
              Instrução extra de personalidade para o suporte. Ex.: "Seja empática e confirme que entendeu o
              problema antes de propor a solução; use linguagem simples de transportador."
            </p>
            <Textarea
              className="h-32"
              placeholder="(opcional) Como a Lia deve soar no suporte..."
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
            />
          </section>

          <div className="mt-2 rounded-lg border border-dashed border-base-300 p-4 text-xs text-base-content/50">
            <strong className="text-base-content/60">Importante:</strong> este campo ajusta apenas o tom. As regras
            de segurança do suporte continuam fixas e prevalecem — a Lia responde só com base na Base de Conhecimento
            e no diagnóstico, não inventa, e escala para um humano quando o tema é fiscal/financeiro com baixa confiança.
          </div>

          {/* Playbooks de diagnóstico */}
          {playbooks.length > 0 && (
            <section className="mt-6 space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-base-content">Fluxos de diagnóstico (playbooks)</h2>
                <p className="mt-0.5 text-xs text-base-content/50">
                  Sequências determinísticas que a Lia segue ao diagnosticar chamados por categoria.
                  Definidas em código — garantem consistência e auditabilidade sem improvisação da IA.
                </p>
              </div>

              <div className="space-y-2">
                {playbooks.map((pb) => (
                  <div key={pb.category} className="overflow-hidden rounded-xl border border-base-200 bg-[var(--surface)]">
                    {/* header clicável */}
                    <button
                      className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-base-100"
                      onClick={() => setExpanded(expanded === pb.category ? null : pb.category)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-600">
                          {pb.category}
                        </span>
                        <span className="text-sm font-medium text-base-content">
                          {CATEGORY_LABEL[pb.category] ?? pb.name}
                        </span>
                      </div>
                      <Icon
                        name="chevronDown"
                        className={`h-4 w-4 text-base-content/40 transition-transform ${expanded === pb.category ? 'rotate-180' : ''}`}
                      />
                    </button>

                    {/* passos expandidos */}
                    {expanded === pb.category && (
                      <div className="border-t border-base-200 px-4 pb-4 pt-3">
                        <ol className="space-y-1.5">
                          {pb.steps.map((step, i) => (
                            <li key={i} className="flex gap-2 text-xs text-base-content/70">
                              <span className="mt-px shrink-0 font-medium text-brand-500">{i + 1}.</span>
                              <span>{step.replace(/^\d+\.\s*/, '')}</span>
                            </li>
                          ))}
                        </ol>
                        {pb.escalate.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-red-500">
                              Escalar se detectar:
                            </span>
                            {pb.escalate.map((kw) => (
                              <span key={kw} className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] text-red-600">
                                {kw}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </PageContainer>
  );
}
