import { useState } from 'react';
import { MarketsPage } from './MarketsPage';
import { LeadBatchesPage } from './LeadBatchesPage';
import { CampaignsPage } from './CampaignsPage';
import { PlaybookPage } from './PlaybookPage';
import { MessageTemplatesPage } from './MessageTemplatesPage';
import { PartnersPage } from './PartnersPage';
import { NumberHealthPage } from './NumberHealthPage';
import { AbuseGuardPage } from './AbuseGuardPage';
import { SellersPage } from './SellersPage';

type AdminTab = 'markets' | 'playbook' | 'batches' | 'campaigns' | 'health';

export function AdminCockpitPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>('markets');

  return (
    <div className="flex flex-col h-screen bg-base-100">
      <div className="border-b border-base-300 bg-white shadow-sm">
        <div className="flex gap-2 flex-wrap p-4">
          <button
            onClick={() => setActiveTab('markets')}
            className={`px-4 py-2 rounded-lg font-medium text-sm ${activeTab === 'markets' ? 'bg-purple-100 text-purple-700' : 'bg-base-200'}`}
          >
            📊 Mercados & Parceiros
          </button>
          <button
            onClick={() => setActiveTab('playbook')}
            className={`px-4 py-2 rounded-lg font-medium text-sm ${activeTab === 'playbook' ? 'bg-purple-100 text-purple-700' : 'bg-base-200'}`}
          >
            📖 Playbook & Mensagens
          </button>
          <button
            onClick={() => setActiveTab('batches')}
            className={`px-4 py-2 rounded-lg font-medium text-sm ${activeTab === 'batches' ? 'bg-purple-100 text-purple-700' : 'bg-base-200'}`}
          >
            📋 Listas de Leads
          </button>
          <button
            onClick={() => setActiveTab('campaigns')}
            className={`px-4 py-2 rounded-lg font-medium text-sm ${activeTab === 'campaigns' ? 'bg-purple-100 text-purple-700' : 'bg-base-200'}`}
          >
            🚀 Disparos & Campanhas
          </button>
          <button
            onClick={() => setActiveTab('health')}
            className={`px-4 py-2 rounded-lg font-medium text-sm ${activeTab === 'health' ? 'bg-purple-100 text-purple-700' : 'bg-base-200'}`}
          >
            ⚡ Saúde & WhatsApp
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {activeTab === 'markets' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold p-4">Mercados</h2>
              <MarketsPage />
            </div>
            <div className="border-t">
              <h2 className="text-lg font-semibold p-4">Parceiros</h2>
              <PartnersPage />
            </div>
          </div>
        )}
        {activeTab === 'playbook' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold p-4">Playbook</h2>
              <PlaybookPage />
            </div>
            <div className="border-t">
              <h2 className="text-lg font-semibold p-4">Mensagens</h2>
              <MessageTemplatesPage />
            </div>
          </div>
        )}
        {activeTab === 'batches' && <LeadBatchesPage />}
        {activeTab === 'campaigns' && <CampaignsPage />}
        {activeTab === 'health' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold p-4">Vendedores</h2>
              <SellersPage />
            </div>
            <div className="border-t">
              <h2 className="text-lg font-semibold p-4">Saúde dos Números</h2>
              <NumberHealthPage />
            </div>
            <div className="border-t">
              <h2 className="text-lg font-semibold p-4">Números Banidos</h2>
              <AbuseGuardPage />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
