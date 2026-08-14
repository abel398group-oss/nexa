import { useState } from 'react';
import { SalesQueuePage } from './SalesQueuePage';
import { SdrWorkbenchPage } from './SdrWorkbenchPage';

export function SdrCockpitPage() {
  const [activeTab, setActiveTab] = useState<'queue' | 'workbench'>('queue');

  return (
    <div className="flex flex-col h-screen bg-base-100">
      {/* Header */}
      <div className="border-b border-base-300 bg-white shadow-sm">
        <div className="flex gap-4 p-4">
          <button
            onClick={() => setActiveTab('queue')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
              activeTab === 'queue'
                ? 'bg-green-100 text-green-700'
                : 'bg-base-200 text-base-content hover:bg-base-300'
            }`}
          >
            📞 Fila de Atendimento
          </button>
          <button
            onClick={() => setActiveTab('workbench')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
              activeTab === 'workbench'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-base-200 text-base-content hover:bg-base-300'
            }`}
          >
            🖥️ Mesa de Trabalho
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'queue' && <SalesQueuePage />}
        {activeTab === 'workbench' && <SdrWorkbenchPage />}
      </div>
    </div>
  );
}
