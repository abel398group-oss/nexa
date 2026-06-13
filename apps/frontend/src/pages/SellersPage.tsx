import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Button, Input, PageContainer, PageHeader, Breadcrumb } from '@/shared/ui';
import { Badge } from '@/components/ui/Badge';

interface Seller {
  id: string;
  name: string;
  phone: string;
  active: boolean;
  assignedCount: number;
  loginEmail?: string | null;
}
interface Kpi { id: string; name: string; leads: number; emAndamento: number; ganhos: number; perdidos: number; taxaConversao: number; }

export function SellersPage() {
  const [items, setItems] = useState<Seller[]>([]);
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  async function load() {
    setLoading(true);
    try {
      const [s, k] = await Promise.allSettled([api.get('/sellers'), api.get('/metrics/sellers')]);
      if (s.status === 'fulfilled') setItems(s.value.data);
      if (k.status === 'fulfilled') setKpis(k.value.data);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      if (editId) {
        await api.patch(`/sellers/${editId}`, {
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          password: password.trim() || undefined,
        });
        toast.success('Vendedor atualizado!');
      } else {
        await api.post('/sellers', {
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          password: password.trim() || undefined,
        });
        toast.success('Vendedor adicionado!');
      }
      setName(''); setPhone(''); setEmail(''); setPassword(''); setEditId(null);
      await load();
    } catch (e: any) {
      const m = e?.response?.data?.message;
      const txt = Array.isArray(m) ? m.join(', ') : m || 'Erro';
      setErr(txt);
      toast.error(txt);
    } finally {
      setBusy(false);
    }
  }

  function openEdit(s: Seller) {
    setEditId(s.id);
    setName(s.name);
    setPhone(s.phone);
    setEmail(s.loginEmail || '');
    setPassword('');
    setErr('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function cancelEdit() {
    setEditId(null); setName(''); setPhone(''); setEmail(''); setPassword(''); setErr('');
  }
  async function del(s: Seller) {
    const ok = await confirm({
      title: 'Excluir vendedor',
      message: `Excluir ${s.name}? As conversas dele ficam sem responsável e o login (se houver) é desvinculado.`,
      variant: 'danger',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await api.delete(`/sellers/${s.id}`);
      toast.success('Vendedor excluído.');
      await load();
    } catch {
      toast.error('Erro ao excluir.');
    }
  }

  async function toggle(s: Seller) {
    await api.patch(`/sellers/${s.id}/active`, { active: !s.active });
    await load();
  }

  return (
    <PageContainer>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Início', to: '/dashboard' }, { label: 'Vendedores' }]} />}
        title="Vendedores"
        subtitle="Leads quentes são distribuídos (round-robin) e notificados no WhatsApp"
      />

      {/* ===== KPIs de desempenho ===== */}
      <div className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-base-content/70">Desempenho de vendas</h2>
        {loading ? (
          <SkeletonList rows={2} />
        ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              <tr>
                <th className="px-4 py-2.5">Vendedor</th>
                <th className="px-4 py-2.5">Leads</th>
                <th className="px-4 py-2.5">Em andamento</th>
                <th className="px-4 py-2.5">Ganhos</th>
                <th className="px-4 py-2.5">Perdidos</th>
                <th className="px-4 py-2.5">Conversão</th>
              </tr>
            </thead>
            <tbody>
              {kpis.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-base-content/40">Sem dados ainda.</td></tr>}
              {kpis.map((k) => (
                <tr key={k.id} className="border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-4 py-2.5 font-medium text-base-content">{k.name}</td>
                  <td className="px-4 py-2.5 text-base-content/70">{k.leads}</td>
                  <td className="px-4 py-2.5 text-base-content/70">{k.emAndamento}</td>
                  <td className="px-4 py-2.5"><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">{k.ganhos}</span></td>
                  <td className="px-4 py-2.5"><span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">{k.perdidos}</span></td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-base-200">
                        <div className="h-full bg-brand-500" style={{ width: `${k.taxaConversao}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-base-content">{k.taxaConversao}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>

      <form onSubmit={add} className="card mb-6 p-4">
        <div className="mb-2 flex flex-wrap gap-2">
          <Input className="flex-1" placeholder="Nome do vendedor" value={name} onChange={(e) => setName(e.target.value)} />
          <Input className="flex-1" placeholder="WhatsApp (5511...)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Input className="flex-1" placeholder={editId ? 'E-mail de login' : 'E-mail de login (opcional)'} value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input type="password" className="flex-1" placeholder={editId ? 'Nova senha (vazio = manter)' : 'Senha (mín. 6)'} value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button loading={busy}>
            {editId ? 'Salvar' : '+ Adicionar'}
          </Button>
          {editId && (
            <Button type="button" variant="ghost" onClick={cancelEdit}>
              Cancelar
            </Button>
          )}
        </div>
        <p className="text-xs text-base-content/40">
          {editId
            ? 'Editando — altere nome/WhatsApp. Pra dar/trocar login: preencha e-mail + senha. Pra só resetar a senha: deixe o e-mail e digite a nova senha.'
            : 'Preencha e-mail + senha para o vendedor ter login próprio (vê só a carteira dele).'}
        </p>
      </form>
      {err && <p className="mb-4 text-sm text-red-500">{err}</p>}

      {loading ? (
        <SkeletonList rows={3} />
      ) : items.length === 0 ? (
        <EmptyState icon="🧑‍💼" title="Nenhum vendedor cadastrado" description="Adicione um vendedor no formulário acima — ele recebe os leads quentes." />
      ) : (
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">WhatsApp</th>
              <th className="px-4 py-3">Leads recebidos</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-base-content/40">Nenhum vendedor. Adicione um acima.</td></tr>}
            {items.map((s) => (
              <tr key={s.id} className="border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                <td className="px-4 py-3 font-medium text-base-content">
                  {s.name}
                  <div className="text-[11px] font-normal text-base-content/40">{s.loginEmail ? `🔑 ${s.loginEmail}` : 'sem login'}</div>
                </td>
                <td className="px-4 py-3 text-base-content/70">{s.phone}</td>
                <td className="px-4 py-3 text-base-content/70">{s.assignedCount}</td>
                <td className="px-4 py-3">
                  <Badge variant={s.active ? 'success' : 'neutral'}>{s.active ? 'ativo' : 'inativo'}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="outline" size="sm" onClick={() => toggle(s)}>
                      {s.active ? 'Desativar' : 'Ativar'}
                    </Button>
                    <button onClick={() => openEdit(s)} title="Editar" className="rounded-md px-2 py-1 text-base-content/50 hover:bg-base-200">✏️</button>
                    <button onClick={() => del(s)} title="Excluir" className="rounded-md px-2 py-1 text-red-500 hover:bg-red-50">🗑️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </PageContainer>
  );
}
