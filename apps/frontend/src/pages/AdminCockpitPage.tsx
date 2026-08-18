import { useState, type ReactNode } from 'react';
import { MarketsPage } from './MarketsPage';
import { LeadBatchesPage } from './LeadBatchesPage';
import { CampaignsPage } from './CampaignsPage';
import { PlaybookMessagesTab } from './PlaybookMessagesTab';
import { NumberHealthPage } from './NumberHealthPage';
import { AbuseGuardPage } from './AbuseGuardPage';
import { SellersPage } from './SellersPage';
import { SeletorDeMarket } from '@/components/SeletorDeMarket';
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

  const ABAS: Aba[] = [
    {
      id: 'markets',
      label: '📊 Markets',
      perm: 'settings', // era /markets
      // Sem cabeçalho próprio: a MarketsPage já traz o dela, com o botão de criar
      // junto da lista que ele muda. Enquanto os dois existiam, a aba abria com
      // dois títulos empilhados ("Markets" e "Mercados") dizendo a mesma coisa com
      // palavras diferentes.
      render: () => <MarketsPage />,
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
        {/* O market fica AQUI, e não dentro de cada aba, porque ele é a dimensão que
            corta todas elas — mensagem, lista de lead e disparo são todos de um
            market. Com um seletor por aba a escolha derivava entre elas. */}
        <div className="flex flex-wrap items-center gap-2 border-b border-base-200 px-4 py-2">
          <SeletorDeMarket />
        </div>
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
