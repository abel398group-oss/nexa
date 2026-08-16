import { useState } from 'react';
import { PlaybookPage } from './PlaybookPage';
import { MessageTemplatesPage } from './MessageTemplatesPage';

type SubTab = 'playbook' | 'messages';

export function PlaybookMessagesTab() {
  const [subTab, setSubTab] = useState<SubTab>('playbook');

  return (
    <div className="flex flex-col h-full bg-base-100">
      {/* Sub-abas */}
      <div className="border-b border-base-200 bg-white px-6 py-3">
        <div className="flex gap-4">
          <button
            onClick={() => setSubTab('playbook')}
            className={`px-4 py-2 rounded-md font-medium text-sm transition ${
              subTab === 'playbook'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-base-100 text-base-content hover:bg-base-200'
            }`}
          >
            🤖 Playbook da IA
          </button>
          <button
            onClick={() => setSubTab('messages')}
            className={`px-4 py-2 rounded-md font-medium text-sm transition ${
              subTab === 'messages'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-base-100 text-base-content hover:bg-base-200'
            }`}
          >
            ✉️ Modelos de Mensagens
          </button>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-auto">
        {subTab === 'playbook' && <PlaybookPage />}
        {subTab === 'messages' && <MessageTemplatesPage />}
      </div>
    </div>
  );
}
