import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Badge } from '@/components/ui/Badge';

interface Seller {
  id: string;
  name: string;
  phone: string;
  active: boolean;
  assignedCount: number;
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
      const [s, k] = await Promise.all([api.get('/sellers'), api.get('/metrics/sellers')]);
      setItems(s.data);
      setKpis(k.data);
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
        await api.patch(`/sellers/${editId}`, { name: name.trim(), phone: phone.trim() });
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
    setErr('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function cancelEdit() {
    setEditId(null); setName(''); setPhone(''); setErr('');
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
    <div className="h-full overflow-auto bg-zinc-50 p-8">
      <h1 className="mb-1 text-xl font-bold text-zinc-800">Vendedores</h1>
      <p className="mb-6 text-xs text-zinc-400">Leads quentes são distribuídos (round-robin) e notificados no WhatsApp</p>

      {/* ===== KPIs de desempenho ===== */}
      <div className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-zinc-600">Desempenho de vendas</h2>
        {loading ? (
          <SkeletonList rows={2} />
        ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-zinc-50 text-left text-xs uppercase text-zinc-400">
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
              {kpis.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-zinc-400">Sem dados ainda.</td></tr>}
              {kpis.map((k) => (
                <tr key={k.id} className="border-b last:border-0">
                  <td className="px-4 py-2.5 font-medium text-zinc-700">{k.name}</td>
                  <td className="px-4 py-2.5 text-zinc-600">{k.leads}</td>
                  <td className="px-4 py-2.5 text-zinc-600">{k.emAndamento}</td>
                  <td className="px-4 py-2.5"><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">{k.ganhos}</span></td>
                  <td className="px-4 py-2.5"><span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">{k.perdidos}</span></td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-100">
                        <div className="h-full bg-brand-500" style={{ width: `${k.taxaConversao}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-zinc-700">{k.taxaConversao}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>

      <form onSubmit={add} className="mb-6 rounded-xl bg-white p-4 shadow-sm">
        <div className="mb-2 flex flex-wrap gap-2">
          <input className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm" placeholder="Nome do vendedor" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm" placeholder="WhatsApp (5511...)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {!editId && (
            <>
              <input className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm" placeholder="E-mail de login (opcional)" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input type="password" className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm" placeholder="Senha (mín. 6)" value={password} onChange={(e) => setPassword(e.target.value)} />
            </>
          )}
          <button disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50">
            {editId ? 'Salvar' : '+ Adicionar'}
          </button>
          {editId && (
            <button type="button" onClick={cancelEdit} className="rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100">
              Cancelar
            </button>
          )}
        </div>
        <p className="text-xs text-zinc-400">
          {editId ? 'Editando vendedor — altere o nome/WhatsApp e salve.' : 'Preencha e-mail + senha para o vendedor ter login próprio (vê só a carteira dele).'}
        </p>
      </form>
      {err && <p className="mb-4 text-sm text-red-500">{err}</p>}

      {loading ? (
        <SkeletonList rows={3} />
      ) : items.length === 0 ? (
        <EmptyState icon="🧑‍💼" title="Nenhum vendedor cadastrado" description="Adicione um vendedor no formulário acima — ele recebe os leads quentes." />
      ) : (
      <table className="w-full overflow-hidden rounded-xl bg-white text-sm shadow-sm">
        <thead className="border-b bg-zinc-50 text-left text-xs uppercase text-zinc-400">
          <tr>
            <th className="px-4 py-3">Nome</th>
            <th className="px-4 py-3">WhatsApp</th>
            <th className="px-4 py-3">Leads recebidos</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-400">Nenhum vendedor. Adicione um acima.</td></tr>}
          {items.map((s) => (
            <tr key={s.id} className="border-b last:border-0">
              <td className="px-4 py-3 font-medium text-zinc-700">{s.name}</td>
              <td className="px-4 py-3 text-zinc-600">{s.phone}</td>
              <td className="px-4 py-3 text-zinc-600">{s.assignedCount}</td>
              <td className="px-4 py-3">
                <Badge variant={s.active ? 'success' : 'neutral'}>{s.active ? 'ativo' : 'inativo'}</Badge>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-1">
                  <button onClick={() => toggle(s)} className="rounded-lg border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-50">
                    {s.active ? 'Desativar' : 'Ativar'}
                  </button>
                  <button onClick={() => openEdit(s)} title="Editar" className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-100">✏️</button>
                  <button onClick={() => del(s)} title="Excluir" className="rounded-md px-2 py-1 text-red-500 hover:bg-red-50">🗑️</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      )}
    </div>
  );
}
