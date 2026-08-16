import { useState, type ReactNode } from 'react';
import { CloserTodayPage } from './CloserTodayPage';
import { VendasRelatorio } from './VendasRelatorio';
import { OpportunitiesPage } from './OpportunitiesPage';
import { useAuth } from '@/app/providers/AuthContext';
import { temPerm } from '@/shared/lib/perms';

/**
 * Cockpit do closer — agenda, carteira e relatório.
 *
 * Separado do cockpit do SDR por permissão desde 16/08/2026: `closer` abre esta tela,
 * `sdr` não. Antes os dois dividiam `telemarketing` e a separação era só visual.
 */
interface Aba {
  id: string;
  label: string;
  perm: string | string[];
  render: () => ReactNode;
}

export function CloserCockpitPage() {
  const { user } = useAuth();

  const ABAS: Aba[] = [
    { id: 'today', label: '📅 Agenda de Hoje', perm: 'closer', render: () => <CloserTodayPage /> },
    // A carteira é o funil — mesma tela e mesma permissão de /opportunities.
    { id: 'opportunities', label: '💼 Minha Carteira', perm: 'opportunities', render: () => <OpportunitiesPage /> },
    { id: 'reports', label: '📊 Relatório de Vendas', perm: 'metrics', render: () => <VendasRelatorio /> },
  ];

  const visiveis = ABAS.filter((a) => temPerm(user, a.perm));
  const [abaId, setAbaId] = useState<string | null>(visiveis[0]?.id ?? null);
  const ativa = visiveis.find((a) => a.id === abaId) ?? visiveis[0];

  if (!ativa) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-base-content/50">
        Você não tem acesso a nenhuma área do painel do closer.
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-base-100">
      <div className="border-b border-base-300 bg-white shadow-sm">
        <div className="flex flex-wrap gap-4 p-4">
          {visiveis.map((a) => (
            <button
              key={a.id}
              onClick={() => setAbaId(a.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                ativa.id === a.id ? 'bg-emerald-100 text-emerald-700' : 'bg-base-200'
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
