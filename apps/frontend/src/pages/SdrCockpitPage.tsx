import { useState, type ReactNode } from 'react';
import { SalesQueuePage } from './SalesQueuePage';
import { SdrWorkbenchPage } from './SdrWorkbenchPage';
import { SalesScriptPage } from './SalesScriptPage';
import { useAuth } from '@/app/providers/AuthContext';
import { temPerm } from '@/shared/lib/perms';

/**
 * Cockpit do SDR — fila, mesa e roteiro.
 *
 * `sdr` e `closer` deixaram de ser a mesma permissão (16/08/2026): antes, quem podia
 * trabalhar a fila abria também o painel do closer, e vice-versa. A separação vale aqui
 * e no `@RequirePerm` das rotas — esta tela só esconde o que a API já recusa.
 */
interface Aba {
  id: string;
  label: string;
  cor: string;
  perm: string | string[];
  render: () => ReactNode;
}

export function SdrCockpitPage() {
  const { user } = useAuth();

  const ABAS: Aba[] = [
    // A fila é do funil (`opportunities`), não da mesa: é a mesma tela que o vendedor
    // já usava em /fila antes do cockpit existir.
    { id: 'queue', label: '📞 Fila de Atendimento', cor: 'bg-green-100 text-green-700', perm: 'opportunities', render: () => <SalesQueuePage /> },
    { id: 'workbench', label: '🖥️ Mesa de Trabalho', cor: 'bg-blue-100 text-blue-700', perm: 'sdr', render: () => <SdrWorkbenchPage /> },
    // Ler o roteiro é `sdr`; editar continua `settings`, dentro da própria tela.
    { id: 'script', label: '📖 Roteiro', cor: 'bg-orange-100 text-orange-700', perm: 'sdr', render: () => <SalesScriptPage /> },
  ];

  const visiveis = ABAS.filter((a) => temPerm(user, a.perm));
  const [abaId, setAbaId] = useState<string | null>(visiveis[0]?.id ?? null);
  const ativa = visiveis.find((a) => a.id === abaId) ?? visiveis[0];

  if (!ativa) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-base-content/50">
        Você não tem acesso a nenhuma área da mesa do SDR.
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
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                ativa.id === a.id ? a.cor : 'bg-base-200 text-base-content hover:bg-base-300'
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
