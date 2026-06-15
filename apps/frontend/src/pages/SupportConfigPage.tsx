import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Button, Textarea, PageContainer, PageHeader, Breadcrumb, Icon } from '@/shared/ui';

/**
 * Config de Suporte — tom/persona da Lia de SUPORTE (separado do Playbook de Vendas).
 * Usa os mesmos endpoints do playbook (GET/PUT /playbook), editando só `supportPersona`.
 */
export function SupportConfigPage() {
  const [persona, setPersona] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

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

          <div className="mt-4 rounded-lg border border-dashed border-base-300 p-4 text-xs text-base-content/50">
            <strong className="text-base-content/60">Importante:</strong> este campo ajusta apenas o tom. As regras
            de segurança do suporte continuam fixas e prevalecem — a Lia responde só com base na Base de Conhecimento
            e no diagnóstico, não inventa, e escala para um humano quando o tema é fiscal/financeiro com baixa confiança.
          </div>
        </>
      )}
    </PageContainer>
  );
}
