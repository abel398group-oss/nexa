import { useState, type ReactNode } from 'react';
import { useAuth } from '@/app/providers/AuthContext';
import { temPerm } from '@/shared/lib/perms';

export interface SubAba {
  id: string;
  label: string;
  /** Mesma permissão da tela original. Lista = qualquer uma serve. */
  perm: string | string[];
  render: () => ReactNode;
}

/**
 * Sub-abas de um grupo do cockpit (22/08/2026).
 *
 * O cockpit tinha seis abas nomeadas pela ENTIDADE de cada tela (Markets, Validação,
 * Playbook & Mensagens, Listas, Disparos, Saúde). Quem opera não pensa por entidade,
 * pensa por momento: configurar o mercado, escrever o que vai sair, rodar o dia,
 * vigiar o número. Com seis portas técnicas, duas telas que tratam do mesmo assunto
 * em fases diferentes pareciam a mesma tela repetida.
 *
 * Os grupos passaram a ser quatro, e o que era aba virou sub-aba dentro do seu
 * momento. Empilhar não servia: só "Disparos" tem 2.600 linhas, e uma página com
 * ela mais as Listas viraria dezenas de alturas de tela de rolagem.
 *
 * Barra some com uma sub-aba só: quem tem permissão para uma tela apenas não precisa
 * de uma barra de escolha com um botão.
 *
 * Funciona controlado (`valor` + `onTrocar`, para o cockpit conseguir mandar alguém
 * direto para uma sub-aba) ou solto, guardando a escolha por conta própria.
 */
export function SubAbas({
  abas,
  valor,
  onTrocar,
}: {
  abas: SubAba[];
  valor?: string | null;
  onTrocar?: (id: string) => void;
}) {
  const { user } = useAuth();
  const [interno, setInterno] = useState<string | null>(null);

  const visiveis = abas.filter((a) => temPerm(user, a.perm));
  const escolhido = valor ?? interno;
  // Cai na primeira PERMITIDA, nunca num id fixo: a sub-aba pedida pode ser
  // justamente a que este usuário não enxerga.
  const ativa = visiveis.find((a) => a.id === escolhido) ?? visiveis[0];

  if (!ativa) return null;

  return (
    <div className="flex h-full flex-col bg-base-100">
      {visiveis.length > 1 && (
        <div className="border-b border-base-200 bg-white px-6 py-3">
          <div className="flex flex-wrap gap-2">
            {visiveis.map((a) => (
              <button
                key={a.id}
                onClick={() => {
                  setInterno(a.id);
                  onTrocar?.(a.id);
                }}
                className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                  ativa.id === a.id
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-base-100 text-base-content hover:bg-base-200'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex-1 overflow-auto">{ativa.render()}</div>
    </div>
  );
}
