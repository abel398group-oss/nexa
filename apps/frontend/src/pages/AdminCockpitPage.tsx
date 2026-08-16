import { useState } from 'react';
import { MarketsPage } from './MarketsPage';
import { LeadBatchesPage } from './LeadBatchesPage';
import { CampaignsPage } from './CampaignsPage';
import { PlaybookMessagesTab } from './PlaybookMessagesTab';
// Parceiros está fora da tela por ora (ver bloco comentado no fim das abas).
// import { PartnersPage } from './PartnersPage';
import { NumberHealthPage } from './NumberHealthPage';
import { AbuseGuardPage } from './AbuseGuardPage';
import { SellersPage } from './SellersPage';
import { NewMarketModal } from '@/components/NewMarketModal';

type AdminTab = 'markets' | 'playbook' | 'batches' | 'campaigns' | 'health';

export function AdminCockpitPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>('markets');
  const [newMarketOpen, setNewMarketOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-base-100">
      <div className="border-b border-base-300 bg-white shadow-sm">
        <div className="flex gap-2 flex-wrap p-4">
          <button
            onClick={() => setActiveTab('markets')}
            className={`px-4 py-2 rounded-lg font-medium text-sm ${activeTab === 'markets' ? 'bg-purple-100 text-purple-700' : 'bg-base-200'}`}
          >
            📊 Markets
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
          <div>
            <div className="bg-base-50 p-6 border-b">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-2xl font-bold">Markets</h2>
                <button
                  onClick={() => setNewMarketOpen(true)}
                  className="px-4 py-2 bg-brand-600 text-white rounded-lg font-medium text-sm hover:bg-brand-700 transition"
                >
                  + Criar Novo Market
                </button>
              </div>
              <p className="text-sm text-base-content/60">
                Cada market é um cliente ou produto que opera independentemente no Nexa. Configure sua operação por market: roteiros, disparos, números e times de vendas.
              </p>
            </div>
            <MarketsPage />
            {/* O modal invalida a query ['markets'] no sucesso — a lista da MarketsPage
                se atualiza sozinha, sem estado paralelo aqui. */}
            <NewMarketModal open={newMarketOpen} onClose={() => setNewMarketOpen(false)} />
          </div>
        )}
        {/* Parceiros desativado temporariamente — simplificar interface (20/08/2026) */}
        {/* {activeTab === 'markets' && (
          <div className="border-t">
            <h2 className="text-lg font-semibold p-4">Parceiros</h2>
            <PartnersPage />
          </div>
        )} */}
        {activeTab === 'playbook' && <PlaybookMessagesTab />}
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
