import { useQuery, useQueryClient } from '@tanstack/react-query';
import { displayPhone } from '@/shared/lib/phone';
import { Button, Card, PageContainer, PageHeader, Breadcrumb, Icon } from '@/shared/ui';
import { listBannedContacts, unbanContact, type BannedContact } from '@/entities/contact';
import { useToast } from '@/app/providers/ToastContext';
import { useConfirm } from '@/app/providers/ConfirmContext';

/**
 * Rótulos em português dos tipos de violação registrados por
 * shared/governance/output-guard.ts. Se um tipo novo aparecer aqui sem estar
 * no mapa, cai no fallback (a própria string) — nunca quebra a tela.
 */
const VIOLATION_LABEL: Record<string, string> = {
  preco_nao_autorizado: 'Preço fora do catálogo',
  vazamento_de_prompt: 'Tentou extrair as instruções da Lia',
  linguagem_ofensiva: 'Linguagem ofensiva',
  vazamento_de_dados: 'Tentou extrair dado sensível',
};

function violationLabels(raw: string | null): string {
  if (!raw) return '—';
  return raw
    .split(',')
    .map((v) => VIOLATION_LABEL[v.trim()] ?? v.trim())
    .join(', ');
}

export function AbuseGuardPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

  const { data: items = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['abuse-banned'],
    queryFn: listBannedContacts,
  });

  async function handleUnban(item: BannedContact) {
    // Desbanir é reversível pelo próprio sistema (o número pode ser banido de
    // novo se voltar a tentar manipular a Lia) — mas ainda assim pede
    // confirmação: é uma decisão de "confio que foi engano do filtro".
    const ok = await confirm({
      title: 'Desbanir número',
      message:
        `Desbanir ${displayPhone(item.phone)}? A Lia volta a responder este número. ` +
        `Se ele tentar manipular a Lia de novo, o banimento automático se aplica outra vez.`,
      confirmLabel: 'Desbanir',
      variant: 'warning',
    });
    if (!ok) return;

    try {
      await unbanContact(item.phone);
      toast.success(`${displayPhone(item.phone)} desbanido.`);
      await qc.invalidateQueries({ queryKey: ['abuse-banned'] });
    } catch {
      toast.error('Erro ao desbanir o número.');
    }
  }

  return (
    <PageContainer>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Início', to: '/dashboard' }, { label: 'Números banidos' }]} />}
        title="Números banidos"
        subtitle={
          'Banimento automático "3 strikes": um número que tenta manipular a Lia 3 vezes ' +
          '(preço inventado, vazamento de dado, ofensa) é silenciado sozinho. Aqui você reverte se for engano do filtro.'
        }
        actions={
          <Button variant="outline" onClick={() => refetch()}>
            <Icon name="refresh" className="h-4 w-4" /> Atualizar
          </Button>
        }
      />

      {isLoading ? (
        <p className="py-10 text-center text-sm text-base-content/40">Carregando…</p>
      ) : isError ? (
        <Card className="p-8 text-center">
          <p className="text-sm font-medium text-base-content">Erro ao carregar os números banidos.</p>
          {(error as Error)?.message && (
            <p className="mt-1 text-xs text-base-content/50">{(error as Error).message}</p>
          )}
          <Button variant="outline" className="mt-3" onClick={() => refetch()}>
            <Icon name="refresh" className="h-4 w-4" /> Tentar novamente
          </Button>
        </Card>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="mb-2 flex justify-center text-base-content/30">
            <Icon name="check" className="h-9 w-9" />
          </div>
          <p className="text-sm font-medium text-base-content">Nenhum número banido</p>
          <p className="mt-1 text-xs text-base-content/50">
            Quando alguém tentar manipular a Lia 3 vezes, o número aparece aqui.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Icon name="ban" className="h-4 w-4 text-red-500" />
                    <span className="font-semibold text-base-content">{displayPhone(item.phone)}</span>
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">
                      {item.strikeCount} tentativa{item.strikeCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-base-content/60">
                    Motivo: {violationLabels(item.lastViolation)}
                  </p>
                  {item.lastDetail && (
                    <p className="mt-0.5 text-[11px] text-base-content/40">{item.lastDetail}</p>
                  )}
                  <p className="mt-1 text-[11px] text-base-content/40">
                    Banido em {new Date(item.bannedAt).toLocaleString('pt-BR')}
                  </p>
                </div>
                <Button variant="outline" onClick={() => handleUnban(item)}>
                  <Icon name="check" className="h-4 w-4" /> Desbanir
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
