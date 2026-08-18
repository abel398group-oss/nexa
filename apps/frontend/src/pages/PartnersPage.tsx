/**
 * PartnersPage — Parceiros de INDICAÇÃO (/partners).
 *
 * "Parceiro" virou palavra ambígua: aqui é quem RECEBE lead nosso, e no módulo
 * de vendas o Abel chama de parceiro o produto que a gente VENDE (o HiperTMS,
 * que no banco é um market). Sentidos opostos, mesma palavra — por isso o menu
 * diz "Parceiros de indicação" e não só "Parceiros".
 *
 * F7 (RevOps): cadastro das empresas parceiras EXTERNAS que recebem lead
 * qualificado por indicação (ex.: fornecedor de pneus para a base de
 * transportadoras). Parceiro NÃO é um tenant — não acessa o Nexa, não tem
 * login; é só o destinatário de uma indicação auditada.
 *
 * O compartilhamento em si acontece na tela de Oportunidades (ação
 * "Compartilhar com parceiro"), porque o consentimento é do LEAD, não do
 * parceiro — ver OpportunitiesPage.
 */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/app/providers/ToastContext';
import { useConfirm } from '@/app/providers/ConfirmContext';
import { Button, Input, Icon, Badge } from '@/shared/ui';
import { useUnsavedGuard } from '@/shared/lib/useUnsavedGuard';
import {
  type Partner,
  listPartners,
  createPartner,
  updatePartner,
  togglePartnerActive,
  deletePartner,
} from '@/entities/partner';
import { StandardListPage } from '@/components/shared/StandardListPage';
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable';

const partnerSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da empresa'),
  type: z.string().trim().min(2, 'Informe o segmento (ex.: pneus)'),
  contactEmail: z.string().trim().email('E-mail invalido').optional().or(z.literal('')),
  contactPhone: z.string().trim().optional().or(z.literal('')),
});
type PartnerForm = z.infer<typeof partnerSchema>;
const emptyForm: PartnerForm = { name: '', type: '', contactEmail: '', contactPhone: '' };

export function PartnersPage() {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<PartnerForm>({ resolver: zodResolver(partnerSchema), defaultValues: emptyForm });

  // Perder um cadastro meio preenchido por F5 ou por fechar a aba sem querer.
  // `isDirty` do react-hook-form volta a false depois do `reset()` que o submit
  // faz, entao o aviso some sozinho assim que salva.
  useUnsavedGuard(isDirty && !isSubmitting);
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data: items = [], isLoading: loading } = useQuery({
    queryKey: ['partners', debouncedSearch],
    queryFn: () => listPartners(debouncedSearch),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['partners'] });

  const onSubmit = async (data: PartnerForm) => {
    const payload = {
      name: data.name,
      type: data.type,
      contactEmail: data.contactEmail || undefined,
      contactPhone: data.contactPhone || undefined,
    };
    try {
      if (editId) {
        await updatePartner(editId, payload);
        toast.success('Parceiro atualizado!');
      } else {
        await createPartner(payload);
        toast.success('Parceiro cadastrado!');
      }
      reset(emptyForm);
      setEditId(null);
      await invalidate();
    } catch (e: any) {
      const m = e?.response?.data?.message;
      const txt = Array.isArray(m) ? m.join(', ') : m || 'Erro ao salvar.';
      setError('root', { message: txt });
      toast.error(txt);
    }
  };

  function openEdit(p: Partner) {
    setEditId(p.id);
    reset({
      name: p.name,
      type: p.type,
      contactEmail: p.contactEmail ?? '',
      contactPhone: p.contactPhone ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function cancelEdit() {
    setEditId(null);
    reset(emptyForm);
  }

  async function toggle(p: Partner) {
    try {
      await togglePartnerActive(p.id, !p.active);
      toast.success(p.active ? `${p.name} desativado.` : `${p.name} reativado.`);
      await invalidate();
    } catch {
      toast.error('Erro ao alterar status.');
    }
  }

  /**
   * Excluir de verdade — só enquanto o parceiro não carrega histórico.
   *
   * Até 13/08/2026 a regra era "parceiro não se exclui, se desativa", e a rota
   * nem existia. O motivo era bom (o parceiro fica referenciado nas
   * oportunidades já compartilhadas, e apagar apagaria esse rastro) mas valia
   * para TODO parceiro — inclusive o que foi cadastrado errado e nunca recebeu
   * indicação nenhuma. Esse não tinha rastro a proteger e ficava na lista para
   * sempre.
   *
   * Quem decide é o servidor: sem indicação, apaga; com indicação, devolve 409
   * com a frase pronta explicando que é para desativar. O texto do erro é
   * exibido como veio, porque ele é que diz QUANTAS indicações existem.
   */
  async function remove(p: Partner) {
    const ok = await confirm({
      title: 'Excluir parceiro',
      message: `Excluir "${p.name}"? Esta ação não pode ser desfeita. Se ele já recebeu indicação de lead, a exclusão será recusada — nesse caso, desative.`,
      variant: 'danger',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await deletePartner(p.id);
      toast.success(`${p.name} excluído.`);
      await invalidate();
    } catch (e: any) {
      const m = e?.response?.data?.message;
      toast.error(Array.isArray(m) ? m.join(', ') : m || 'Erro ao excluir o parceiro.');
    }
  }

  const columns: DataTableColumn<Partner>[] = [
    {
      id: 'name',
      header: 'Parceiro',
      mobileTitle: true,
      cell: (p) => <span className="font-medium text-base-content">{p.name}</span>,
    },
    {
      id: 'type',
      header: 'Segmento',
      mobileLabel: 'Segmento',
      cell: (p) => <span className="text-base-content/70">{p.type}</span>,
    },
    {
      id: 'contact',
      header: 'Contato',
      mobileHidden: true,
      cell: (p) => (
        <div className="text-xs text-base-content/60">
          {p.contactEmail && <div>{p.contactEmail}</div>}
          {p.contactPhone && <div>{p.contactPhone}</div>}
          {!p.contactEmail && !p.contactPhone && <span className="text-base-content/30">—</span>}
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      mobileLabel: 'Status',
      cell: (p) => <Badge variant={p.active ? 'success' : 'neutral'}>{p.active ? 'ativo' : 'inativo'}</Badge>,
    },
  ];

  return (
    <StandardListPage
      title="Parceiros de indicação"
      breadcrumb={[{ label: 'Vendas' }, { label: 'Parceiros de indicação' }]}
      description="Empresas externas que recebem indicação de lead (cross-sell). Compartilhar exige consentimento do lead — LGPD"
      isLoading={loading}
      hasData={items.length > 0}
      entityName="parceiro(s)"
      topContent={
        <form onSubmit={handleSubmit(onSubmit)} className="card mb-6 p-4">
          <div className="mb-2 flex flex-wrap items-start gap-2">
            <div className="flex-1">
              <Input placeholder="Nome da empresa" {...register('name')} />
              {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <div className="flex-1">
              <Input placeholder="Segmento (ex.: pneus)" {...register('type')} />
              {errors.type && <p className="mt-1 text-xs text-red-500">{errors.type.message}</p>}
            </div>
          </div>
          <div className="mb-2 flex flex-wrap items-start gap-2">
            <div className="flex-1">
              <Input placeholder="E-mail de contato (opcional)" {...register('contactEmail')} />
              {errors.contactEmail && <p className="mt-1 text-xs text-red-500">{errors.contactEmail.message}</p>}
            </div>
            <div className="flex-1">
              <Input placeholder="Telefone de contato (opcional)" {...register('contactPhone')} />
            </div>
            <Button loading={isSubmitting}>{editId ? 'Salvar' : '+ Adicionar'}</Button>
            {editId && (
              <Button type="button" variant="ghost" onClick={cancelEdit}>
                Cancelar
              </Button>
            )}
          </div>
          {errors.root && <p className="mb-2 text-sm text-red-500">{errors.root.message}</p>}
          <p className="text-xs text-base-content/40">
            O parceiro não acessa o Nexa — ele só recebe a indicação do lead. Para indicar, use a ação
            "Compartilhar com parceiro" na tela de Oportunidades.
          </p>
        </form>
      }
      extraToolbar={
        <Input
          className="!w-64"
          placeholder="Buscar parceiro..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      }
    >
      <DataTable
        columns={columns}
        rows={items}
        getRowId={(p) => p.id}
        rowActions={(p) => [
          { label: 'Editar', onClick: () => openEdit(p) },
          { label: p.active ? 'Desativar' : 'Ativar', onClick: () => toggle(p) },
          { label: 'Excluir', onClick: () => remove(p), destructive: true },
        ]}
        empty={{
          icon: <Icon name="building" className="h-9 w-9" />,
          title: 'Nenhum parceiro cadastrado',
          description: 'Cadastre a empresa parceira no formulário acima para poder indicar leads a ela.',
        }}
      />
    </StandardListPage>
  );
}
