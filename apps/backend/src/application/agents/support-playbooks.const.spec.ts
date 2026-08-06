import { getPlaybook } from './support-playbooks.const';
import { TicketCategory } from './case-classifier-agent.service';

// F11 (auditoria KB 2026-08-06): garante que TODA categoria do classificador
// tem um playbook — regressão específica pro achado "integracoes/api sem
// nenhuma cobertura" e "cadastro caindo no genérico de treinamento".
const ALL_CATEGORIES: TicketCategory[] = [
  'fiscal', 'cte', 'mdfe', 'frete', 'financeiro', 'cadastro',
  'frota', 'usuarios', 'integracoes', 'api', 'erro_sistema', 'treinamento',
];

describe('support-playbooks.const — getPlaybook()', () => {
  it.each(ALL_CATEGORIES)('categoria "%s" tem playbook definido', (category) => {
    expect(getPlaybook(category)).toBeDefined();
  });

  it('cadastro tem playbook PRÓPRIO, não mais o alias genérico de treinamento', () => {
    const pb = getPlaybook('cadastro');
    expect(pb?.name).toBe('cadastro-registros');
    expect(pb?.name).not.toBe('duvida-operacional');
  });

  it('integracoes tem playbook próprio', () => {
    expect(getPlaybook('integracoes')?.name).toBe('integracao-diagnostico');
  });

  it('api tem playbook próprio', () => {
    expect(getPlaybook('api')?.name).toBe('api-uso');
  });

  it('categoria desconhecida retorna undefined (sem alias silencioso)', () => {
    expect(getPlaybook('categoria-que-nao-existe')).toBeUndefined();
  });
});
