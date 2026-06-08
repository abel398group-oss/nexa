import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { SkeletonList } from '@/components/ui/Skeleton';

interface Objection { objection: string; guidance: string }
interface Playbook {
  persona: string;
  objections: Objection[];
  ctaCold: string;
  ctaWarm: string;
  ctaHot: string;
}

export function PlaybookPage() {
  const [pb, setPb] = useState<Playbook | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  async function load() {
    setLoading(true);
    try {
      const r = await api.get('/playbook');
      setPb(r.data);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  function set<K extends keyof Playbook>(k: K, v: Playbook[K]) {
    setPb((p) => (p ? { ...p, [k]: v } : p));
  }
  function setObj(i: number, k: keyof Objection, v: string) {
    setPb((p) => {
      if (!p) return p;
      const objections = p.objections.map((o, idx) => (idx === i ? { ...o, [k]: v } : o));
      return { ...p, objections };
    });
  }
  function addObj() {
    setPb((p) => (p ? { ...p, objections: [...p.objections, { objection: '', guidance: '' }] } : p));
  }
  function removeObj(i: number) {
    setPb((p) => (p ? { ...p, objections: p.objections.filter((_, idx) => idx !== i) } : p));
  }

  async function save() {
    if (!pb) return;
    setSaving(true);
    try {
      const r = await api.put('/playbook', pb);
      setPb(r.data);
      toast.success('Playbook salvo! A Lia já usa as novas instruções.');
    } catch {
      toast.error('Erro ao salvar o playbook.');
    } finally {
      setSaving(false);
    }
  }
  async function reset() {
    const ok = await confirm({
      title: 'Restaurar playbook',
      message: 'Restaurar o playbook de fábrica? Suas edições serão perdidas.',
      variant: 'warning',
      confirmLabel: 'Restaurar',
    });
    if (!ok) return;
    setSaving(true);
    try {
      const r = await api.post('/playbook/reset');
      setPb(r.data);
      toast.info('Playbook restaurado para o padrão.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-lg font-bold text-base-content">Playbook de Vendas da Lia</h1>
        <p className="text-xs text-base-content/50">
          Edite como a Lia conduz a venda — sem mexer no código. As mudanças valem na próxima resposta dela.
        </p>
      </div>

      {loading || !pb ? (
        <SkeletonList rows={5} />
      ) : (
        <>
          {/* Tom / persona */}
          <section className="card space-y-2 p-5">
            <h2 className="text-sm font-semibold text-base-content">Tom e estilo (opcional)</h2>
            <p className="text-xs text-base-content/50">
              Instrução extra de personalidade. Ex.: "Seja calorosa e use linguagem simples de transportador."
            </p>
            <textarea
              className="input h-20 w-full text-sm"
              placeholder="(opcional) Como a Lia deve soar..."
              value={pb.persona}
              onChange={(e) => set('persona', e.target.value)}
            />
          </section>

          {/* Objeções */}
          <section className="card space-y-3 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-base-content">Biblioteca de objeções</h2>
                <p className="text-xs text-base-content/50">O que o cliente diz × como a Lia deve responder.</p>
              </div>
              <button onClick={addObj} className="rounded-lg border border-base-300 px-3 py-1.5 text-xs hover:bg-base-100">
                + Objeção
              </button>
            </div>
            <div className="space-y-3">
              {pb.objections.map((o, i) => (
                <div key={i} className="rounded-lg border border-base-200 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs font-medium text-base-content/50">Cliente diz:</span>
                    <input
                      className="input flex-1 text-sm"
                      placeholder='Ex.: "Tá caro"'
                      value={o.objection}
                      onChange={(e) => setObj(i, 'objection', e.target.value)}
                    />
                    <button onClick={() => removeObj(i)} title="Remover" className="rounded px-2 py-1 text-red-500 hover:bg-red-50">
                      ✕
                    </button>
                  </div>
                  <textarea
                    className="input h-16 w-full text-sm"
                    placeholder="Como a Lia deve contornar essa objeção..."
                    value={o.guidance}
                    onChange={(e) => setObj(i, 'guidance', e.target.value)}
                  />
                </div>
              ))}
              {pb.objections.length === 0 && (
                <p className="text-center text-xs text-base-content/40">Nenhuma objeção — clique em "+ Objeção".</p>
              )}
            </div>
          </section>

          {/* CTAs por temperatura */}
          <section className="card space-y-3 p-5">
            <h2 className="text-sm font-semibold text-base-content">Próximo passo (CTA) por temperatura do lead</h2>
            {([
              ['ctaCold', '🧊 Lead FRIO (score < 40)', 'Ainda explorando — o que a Lia deve fazer?'],
              ['ctaWarm', '🌤️ Lead MORNO (40–69)', 'Tem interesse — como avançar?'],
              ['ctaHot', '🔥 Lead QUENTE (≥ 70)', 'Pronto pra fechar — qual o CTA forte?'],
            ] as const).map(([key, label, hint]) => (
              <div key={key}>
                <label className="mb-1 block text-xs font-medium text-base-content/70">{label}</label>
                <p className="mb-1 text-[11px] text-base-content/40">{hint}</p>
                <textarea
                  className="input h-16 w-full text-sm"
                  value={pb[key]}
                  onChange={(e) => set(key, e.target.value)}
                />
              </div>
            ))}
          </section>

          {/* ações */}
          <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-base-200 bg-base-100/80 py-3 backdrop-blur">
            <button onClick={reset} disabled={saving} className="rounded-lg px-4 py-2 text-sm text-base-content/60 hover:bg-base-200 disabled:opacity-50">
              ↩️ Restaurar padrão
            </button>
            <div className="flex items-center gap-3">
              <button onClick={save} disabled={saving} className="btn-primary px-5 py-2 text-sm disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar playbook'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
