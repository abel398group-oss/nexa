import { useState, type ReactNode } from 'react';
import { MarketsPage } from './MarketsPage';
import { CampaignValidationPage } from './CampaignValidationPage';
import { LeadBatchesPage } from './LeadBatchesPage';
import { CampaignsPage } from './CampaignsPage';
import { PlaybookPage } from './PlaybookPage';
import { MessageTemplatesPage } from './MessageTemplatesPage';
import { NumberHealthPage } from './NumberHealthPage';
import { AbuseGuardPage } from './AbuseGuardPage';
import { SellersPage } from './SellersPage';
import { SeletorDeMarket } from '@/components/SeletorDeMarket';
import { SubAbas } from '@/components/SubAbas';
import { CockpitTabsContext } from '@/app/providers/CockpitTabsContext';
import { useAuth } from '@/app/providers/AuthContext';
import { temPerm } from '@/shared/lib/perms';

/**
 * Cockpit do admin — junta numa tela só o que antes eram sete rotas.
 *
 * ## Os grupos são MOMENTOS, não entidades (22/08/2026)
 *
 * Eram seis abas nomeadas pela tabela que cada uma mexe: Markets, Validação de
 * campanha, Playbook & Mensagens, Listas, Disparos, Saúde. Quem opera não pensa
 * assim — pensa em "estou preparando o mercado", "estou escrevendo o que vai sair",
 * "estou rodando o dia". Com as portas nomeadas por entidade, duas telas do mesmo
 * assunto em fases diferentes (o painel do mercado e a validação do material)
 * pareciam a mesma tela feita duas vezes.
 *
 * Quatro grupos, cada um com as telas daquele momento como sub-abas:
 *   ⚙️ Mercado        — configura uma vez: identidade, playbook da Lia, vendedores
 *   ✍️ O que vai sair — o texto: aprovar o material, escrever os modelos
 *   🚀 Operação       — o dia: subir lista, disparar
 *   ⚡ Saúde          — vigiar: número, banidos
 *
 * ## Permissão
 *
 * Cada tela declara A PERMISSÃO QUE ELA JÁ EXIGIA antes do agrupamento — agora na
 * sub-aba, e o grupo aceita qualquer uma das de dentro. Sem isso, o cockpit vira um
 * buraco de acesso nos dois sentidos: quem tinha só `campaigns` perde o caminho para
 * o Disparo (a rota some do menu, engolida pelo cockpit), e quem entra vê abas cujas
 * APIs vão devolver 403.
 *
 * A trava real continua no `@RequirePerm` de cada rota do backend — isto é navegação.
 */
interface Aba {
  id: string;
  label: string;
  /** União das permissões das sub-abas: basta uma para o grupo aparecer. */
  perm: string | string[];
  render: (sub: string | null, irParaSub: (id: string) => void) => ReactNode;
}

export function AdminCockpitPage() {
  const { user } = useAuth();

  const ABAS: Aba[] = [
    {
      id: 'mercado',
      label: '⚙️ Mercado',
      perm: ['settings', 'ai_control', 'sellers'],
      render: (sub, irParaSub) => (
        <SubAbas
          valor={sub}
          onTrocar={irParaSub}
          abas={[
            // Sem cabeçalho próprio: a MarketsPage já traz o dela, com o botão de
            // criar junto da lista que ele muda.
            { id: 'markets', label: '📊 Mercados', perm: 'settings', render: () => <MarketsPage /> },
            { id: 'playbook', label: '🤖 Playbook da IA', perm: 'ai_control', render: () => <PlaybookPage /> },
            { id: 'sellers', label: '👥 Vendedores', perm: 'sellers', render: () => <SellersPage /> },
          ]}
        />
      ),
    },
    {
      id: 'conteudo',
      label: '✍️ O que vai sair',
      // Aprovar material é de quem monta a operação (`settings`); escrever modelo é
      // de quem dispara (`campaigns`). Os dois tratam do MESMO texto, em ordem: o
      // roteiro aprovado é a fonte de onde os modelos são rascunhados.
      perm: ['settings', 'campaigns'],
      render: (sub, irParaSub) => (
        <SubAbas
          valor={sub}
          onTrocar={irParaSub}
          abas={[
            { id: 'validacao', label: '✅ Validação de campanha', perm: 'settings', render: () => <CampaignValidationPage /> },
            { id: 'mensagens', label: '✉️ Modelos de Mensagens', perm: 'campaigns', render: () => <MessageTemplatesPage /> },
          ]}
        />
      ),
    },
    {
      id: 'operacao',
      label: '🚀 Operação',
      perm: ['lead_batches', 'campaigns'],
      render: (sub, irParaSub) => (
        <SubAbas
          valor={sub}
          onTrocar={irParaSub}
          abas={[
            { id: 'batches', label: '📋 Listas de Leads', perm: 'lead_batches', render: () => <LeadBatchesPage /> },
            { id: 'campaigns', label: '🚀 Disparos & Campanhas', perm: 'campaigns', render: () => <CampaignsPage /> },
          ]}
        />
      ),
    },
    {
      id: 'saude',
      label: '⚡ Saúde',
      perm: ['campaigns', 'contacts'],
      // Empilhadas, e não em sub-aba: são as duas telas pequenas do cockpit e as
      // duas de vigiar — ver uma costuma ser querer ver a outra logo abaixo.
      render: () => (
        <div className="space-y-6">
          {temPerm(user, 'campaigns') && (
            <div>
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
  // A aba inicial é a primeira PERMITIDA, nunca um id fixo: com `'mercado'` no estado
  // inicial, quem não tem `settings` abria o cockpit numa aba que não existe e via branco.
  const [abaId, setAbaId] = useState<string | null>(visiveis[0]?.id ?? null);
  // Sub-aba pedida de fora (deep-link). `null` deixa o grupo escolher a dele.
  const [subId, setSubId] = useState<string | null>(null);
  const ativa = visiveis.find((a) => a.id === abaId) ?? visiveis[0];

  /** Mandar alguém para outra aba/sub-aba de dentro de uma tela — ver CockpitTabsContext. */
  function irPara(destino: string, sub?: string) {
    setAbaId(destino);
    setSubId(sub ?? null);
  }

  if (!ativa) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-base-content/50">
        Você não tem acesso a nenhuma área deste painel.
      </div>
    );
  }

  return (
    <CockpitTabsContext.Provider value={irPara}>
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
                onClick={() => {
                  setAbaId(a.id);
                  setSubId(null);
                }}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${
                  ativa.id === a.id ? 'bg-purple-100 text-purple-700' : 'bg-base-200'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-auto">{ativa.render(subId, setSubId)}</div>
      </div>
    </CockpitTabsContext.Provider>
  );
}
