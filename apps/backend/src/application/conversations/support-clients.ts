// Cruza os chamados de suporte com a base de clientes do TMS — puro, testável sem banco.
//
// A conversa de suporte guarda o `externalId` da PESSOA que abriu o chamado
// (`tenant_core_user.id`, confirmado em produção em 17/08/2026), e a base de clientes é
// de EMPRESAS (`system_core_tenant`). O caminho é pessoa → empresa, e é isso que este
// módulo faz. Sem ele, a tela "Clientes" só sabia listar quem abriu chamado.

export interface ChamadoParaCruzar {
  /// Id da pessoa no TMS. Null em conversa de suporte antiga, sem o campo preenchido.
  externalId: string | null;
  aberto: boolean;
  /// Momento da última atividade, em milissegundos.
  em: number;
}

export interface ResumoDeChamados {
  chamados: number;
  abertos: number;
  ultimoEm: number;
}

export interface CruzamentoDeChamados {
  porEmpresa: Map<string, ResumoDeChamados>;
  /**
   * Chamados que NÃO chegaram a uma empresa: sem `externalId`, ou com um id que não
   * existe mais no TMS (usuário removido).
   *
   * Sai no resultado de propósito. Se ficasse escondido, a soma dos chamados por empresa
   * seria menor que o total de chamados e a tela pareceria estar perdendo atendimento —
   * o operador confere a conta antes de confiar no painel, e ela precisa fechar.
   */
  semEmpresa: number;
}

export function cruzarChamadosPorEmpresa(
  chamados: readonly ChamadoParaCruzar[],
  empresaDoUsuario: ReadonlyMap<string, string>,
): CruzamentoDeChamados {
  const porEmpresa = new Map<string, ResumoDeChamados>();
  let semEmpresa = 0;

  for (const c of chamados) {
    const empresa = c.externalId ? empresaDoUsuario.get(c.externalId) : undefined;
    if (!empresa) {
      semEmpresa += 1;
      continue;
    }
    const atual = porEmpresa.get(empresa);
    if (atual) {
      atual.chamados += 1;
      if (c.aberto) atual.abertos += 1;
      if (c.em > atual.ultimoEm) atual.ultimoEm = c.em;
    } else {
      porEmpresa.set(empresa, { chamados: 1, abertos: c.aberto ? 1 : 0, ultimoEm: c.em });
    }
  }

  return { porEmpresa, semEmpresa };
}

export interface ClienteComChamados {
  id: string;
  name: string;
  ativo: boolean | null;
  chamados: number;
  abertos: number;
  ultimoEm: number | null;
}

/**
 * Junta a base do TMS com o cruzamento. A base manda na LISTA: cliente que nunca abriu
 * chamado aparece com zero, que é o ponto todo desta tela.
 *
 * Ordem: quem tem chamado aberto primeiro, depois quem falou mais recentemente, depois o
 * resto por nome. Quem precisa de atenção sobe sozinho sem o operador ordenar nada.
 */
export function juntarClientesComChamados(
  clientes: readonly { id: string; name: string; ativo: boolean | null }[],
  cruzamento: CruzamentoDeChamados,
): ClienteComChamados[] {
  return clientes
    .map((c) => {
      const r = cruzamento.porEmpresa.get(c.id);
      return {
        ...c,
        chamados: r?.chamados ?? 0,
        abertos: r?.abertos ?? 0,
        ultimoEm: r?.ultimoEm ?? null,
      };
    })
    .sort((a, b) => {
      if ((b.abertos > 0 ? 1 : 0) !== (a.abertos > 0 ? 1 : 0)) {
        return (b.abertos > 0 ? 1 : 0) - (a.abertos > 0 ? 1 : 0);
      }
      if ((b.ultimoEm ?? 0) !== (a.ultimoEm ?? 0)) return (b.ultimoEm ?? 0) - (a.ultimoEm ?? 0);
      return a.name.localeCompare(b.name, 'pt-BR');
    });
}
