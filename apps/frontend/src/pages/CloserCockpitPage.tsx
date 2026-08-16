import { useState } from 'react';
import { CloserTodayPage } from './CloserTodayPage';
import { VendasRelatorio } from './VendasRelatorio';
import { OpportunitiesPage } from './OpportunitiesPage';

type CloserTab = 'today' | 'opportunities' | 'reports';

export function CloserCockpitPage() {
  const [activeTab, setActiveTab] = useState<CloserTab>('today');

  return (
    <div className="flex flex-col h-screen bg-base-100">
      <div className="border-b border-base-300 bg-white shadow-sm">
        <div className="flex gap-4 flex-wrap p-4">
          <button
            onClick={() => setActiveTab('today')}
            className={`px-4 py-2 rounded-lg font-medium text-sm ${activeTab === 'today' ? 'bg-emerald-100 text-emerald-700' : 'bg-base-200'}`}
          >
            📅 Agenda de Hoje
          </button>
          <button
            onClick={() => setActiveTab('opportunities')}
            className={`px-4 py-2 rounded-lg font-medium text-sm ${activeTab === 'opportunities' ? 'bg-emerald-100 text-emerald-700' : 'bg-base-200'}`}
          >
            💼 Minha Carteira
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`px-4 py-2 rounded-lg font-medium text-sm ${activeTab === 'reports' ? 'bg-emerald-100 text-emerald-700' : 'bg-base-200'}`}
          >
            📊 Relatório de Vendas
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {activeTab === 'today' && <CloserTodayPage />}
        {activeTab === 'opportunities' && <OpportunitiesPage />}
        {activeTab === 'reports' && <VendasRelatorio />}
      </div>
    </div>
  );
}
