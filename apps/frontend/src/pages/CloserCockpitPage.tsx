import { useState } from 'react';
import { CloserTodayPage } from './CloserTodayPage';
import { VendasRelatorio } from './VendasRelatorio';

export function CloserCockpitPage() {
  const [activeTab, setActiveTab] = useState<'today' | 'reports'>('today');
  return (
    <div className="flex flex-col h-screen bg-base-100">
      <div className="border-b border-base-300 bg-white shadow-sm">
        <div className="flex gap-4 p-4">
          <button onClick={() => setActiveTab('today')} className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'today' ? 'bg-emerald-100 text-emerald-700' : 'bg-base-200'}`}>📅 Agenda de Hoje</button>
          <button onClick={() => setActiveTab('reports')} className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'reports' ? 'bg-emerald-100 text-emerald-700' : 'bg-base-200'}`}>📊 Relatório de Vendas</button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {activeTab === 'today' && <CloserTodayPage />}
        {activeTab === 'reports' && <VendasRelatorio />}
      </div>
    </div>
  );
}
