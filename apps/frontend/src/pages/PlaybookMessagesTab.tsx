import { useState } from 'react';
import { PlaybookPage } from './PlaybookPage';
import { MessageTemplatesPage } from './MessageTemplatesPage';
import { useAuth } from '@/app/providers/AuthContext';
import { temPerm } from '@/shared/lib/perms';

type SubTab = 'playbook' | 'messages';

/**
 * As duas sub-abas têm donos diferentes: o playbook é da Lia (`ai_control`) e os modelos
 * de mensagem são de quem dispara (`campaigns`). Quem tem uma e não a outra vê só a sua.
 */
export function PlaybookMessagesTab() {
  const { user } = useAuth();
  const podePlaybook = temPerm(user, 'ai_control');
  const podeMensagens = temPerm(user, 'campaigns');
  // Mensagens é a primeira aba e o padrão (19/08/2026): é a tela de trabalho do dia a
  // dia — escrever, testar e salvar modelo. O playbook é configuração da Lia, mexida
  // de vez em quando. Aba que abre por padrão deve ser a mais usada.
  const [subTab, setSubTab] = useState<SubTab>(podeMensagens ? 'messages' : 'playbook');
  const ativa: SubTab = subTab === 'playbook' && !podePlaybook ? 'messages'
    : subTab === 'messages' && !podeMensagens ? 'playbook'
    : subTab;

  return (
    <div className="flex flex-col h-full bg-base-100">
      {/* Sub-abas — só aparecem quando há as duas para escolher */}
      {podePlaybook && podeMensagens && (
        <div className="border-b border-base-200 bg-white px-6 py-3">
          <div className="flex gap-4">
            <button
              onClick={() => setSubTab('messages')}
              className={`px-4 py-2 rounded-md font-medium text-sm transition ${
                ativa === 'messages'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-base-100 text-base-content hover:bg-base-200'
              }`}
            >
              ✉️ Modelos de Mensagens
            </button>
            <button
              onClick={() => setSubTab('playbook')}
              className={`px-4 py-2 rounded-md font-medium text-sm transition ${
                ativa === 'playbook'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-base-100 text-base-content hover:bg-base-200'
              }`}
            >
              🤖 Playbook da IA
            </button>
          </div>
        </div>
      )}

      {/* Conteúdo */}
      <div className="flex-1 overflow-auto">
        {ativa === 'playbook' && podePlaybook && <PlaybookPage />}
        {ativa === 'messages' && podeMensagens && <MessageTemplatesPage />}
      </div>
    </div>
  );
}
