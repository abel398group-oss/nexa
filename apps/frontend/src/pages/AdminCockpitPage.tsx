import { useState, type ReactNode } from 'react';
import { MarketsPage } from './MarketsPage';
import { LeadBatchesPage } from './LeadBatchesPage';
import { CampaignsPage } from './CampaignsPage';
import { PlaybookMessagesTab } from './PlaybookMessagesTab';
import { NumberHealthPage } from './NumberHealthPage';
import { AbuseGuardPage } from './AbuseGuardPage';
import { SellersPage } from './SellersPage';
import { NewMarketModal } from '@/components/NewMarketModal';
import { useAuth } from '@/app/providers/AuthContext';
import { temPerm } from '@/shared/lib/perms';

/**
 * Cockpit do admin — junta numa tela só o que antes eram sete rotas.
 *
 * Cada aba declara A PERMISSÃO QUE A TELA DELA JÁ EXIGIA antes do agrupamento. Sem isso,
 * o cockpit vira um buraco de acesso nos dois sentidos: quem tinha só `campaigns` perde o
 * caminho para o Disparo (a rota some do menu, engolida pelo cockpit), e quem entra vê
 * abas cujas APIs vão devolver 403.
 *
 * A trava real continua no `@RequirePerm` de cada rota do backend — isto é navegação.
 */
interface Aba {
  id: string;
  label: string;
  /** Mesma permissão da rota original. Lista = qualquer uma serve. */
  perm: string | string[];
  render: () => ReactNode;
}

export function AdminCockpitPage() {
  const { user } = useAuth();
  const [newMarketOpen, setNewMarketOpen] = useState(false);

  const ABAS: Aba[] = [
    {
      id: 'markets',
      label: '📊 Markets',
      perm: 'settings', // era /markets
      render: () => (
        <div>
          <div className="bg-base-50 border-b p-6">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-2xl font-bold">Markets</h2>
              <button
                onClick={() => setNewMarketOpen(true)}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
              >
                + Criar Novo Market
              </button>
            </div>
            <p className="text-sm text-base-content/60">
              Cada market é um cliente ou produto que opera independentemente no Nexa.
              Configure sua operação por market: roteiros, disparos, números e times de vendas.
            </p>
          </div>
          <MarketsPage />
          <NewMarketModal open={newMarketOpen} onClose={() => setNewMarketOpen(false)} />
        </div>
      ),
    },
    {
      id: 'playbook',
      label: '📖 Playbook & Mensagens',
      // Duas telas com donos diferentes: o playbook é `ai_control`, os modelos são
      // `campaigns`. As sub-abas se filtram por conta própria lá dentro.
      perm: ['ai_control', 'campaigns'],
      render: () => <PlaybookMessagesTab />,
    },
    { id: 'batches', label: '📋 Listas de Leads', perm: 'lead_batches', render: () => <LeadBatchesPage /> },
    { id: 'campaigns', label: '🚀 Disparos & Campanhas', perm: 'campaigns', render: () => <CampaignsPage /> },
    {
      id: 'health',
      label: '⚡ Saúde & WhatsApp',
      perm: ['sellers', 'campaigns', 'contacts'],
      render: () => (
        <div className="space-y-6">
          {temPerm(user, 'sellers') && (
            <div>
              <h2 className="p-4 text-lg font-semibold">Vendedores</h2>
              <SellersPage />
            </div>
          )}
          {temPerm(user, 'campaigns') && (
            <div className="border-t">
              <h2 className="p-4 text-lg font-semibold">Saúde dos Números</h2>
              <NumberHealthPage />
            </div>
          )}
          {temPerm(user, 'contacts') && (
            <div className="border-t">
              <h2 className="p-4 text-lg font-semibold">Números Banidos</h2>
              <AbuseGuardPage />
            </div>
          )}
        </div>
      ),
    },
  ];

  const visiveis = ABAS.filter((a) => temPerm(user, a.perm));
  // A aba inicial é a primeira PERMITIDA, nunca um id fixo: com `'markets'` no estado
  // inicial, quem não tem `settings` abria o cockpit numa aba que não existe e via branco.
  const [abaId, setAbaId] = useState<string | null>(visiveis[0]?.id ?? null);
  const ativa = visiveis.find((a) => a.id === abaId) ?? visiveis[0];

  if (!ativa) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-base-content/50">
        Você não tem acesso a nenhuma área deste painel.
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-base-100">
      <div className="border-b border-base-300 bg-white shadow-sm">
        <div className="flex flex-wrap gap-2 p-4">
          {visiveis.map((a) => (
            <button
              key={a.id}
              onClick={() => setAbaId(a.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                ativa.id === a.id ? 'bg-purple-100 text-purple-700' : 'bg-base-200'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-auto">{ativa.render()}</div>
    </div>
  );
}
