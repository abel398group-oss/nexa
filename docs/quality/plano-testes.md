# Plano de Testes — Nexa

> Versão: 1.0 | Junho 2026

---

## 1. Estratégia Geral

```
Pirâmide de testes:
         ┌───────────────┐
         │  E2E (Playwright) ← fluxos críticos de ponta a ponta
         ├───────────────────────┤
         │  Integração (Vitest + banco real em staging)
         ├───────────────────────────────────────┤
         │  Unitários (Vitest) ← base da pirâmide
         └───────────────────────────────────────────────────┘
```

---

## 2. Estado Atual dos Testes

| Tipo | Status | Localização | Quantidade |
|------|--------|-------------|-----------|
| Unitários backend | ✅ Parcial | `*.spec.ts` ao lado dos serviços | 19 arquivos |
| Integração backend | ⚠️ Mínimo | Sem setup de banco em memória | — |
| Unitários frontend | ❌ Ausente | Não existe | 0 |
| E2E (Playwright) | ❌ Ausente | Não há `apps/e2e` | 0 |

### Arquivos de teste existentes (backend)

```
application/actions/action-policy.spec.ts
application/admin/tenants.service.spec.ts
application/agents/case-classifier-agent.service.spec.ts
application/agents/diagnostic-agent.service.spec.ts
application/agents/escalation-agent.service.spec.ts
application/agents/resolution-agent.service.spec.ts
application/agents/router-agent.service.spec.ts
application/contacts/contacts.service.spec.ts
application/knowledge/knowledge.service.spec.ts
application/metrics/metrics.service.spec.ts
application/opportunities/opportunities.service.spec.ts
application/portal/portal-session.guard.spec.ts
application/portal/portal-session.service.spec.ts
application/portal/portal-tickets.service.spec.ts
application/sender/sender.service.spec.ts
shared/auth/platform-admin.guard.spec.ts
shared/config/validate-env.spec.ts
shared/tenant/effective-tenant.interceptor.spec.ts
shared/utils/phone.util.spec.ts
```

---

## 3. Cobertura Mínima Exigida

| Camada | Mínimo | Bloqueante para deploy |
|--------|--------|----------------------|
| Agentes da IA (router, supervisor, sales, support) | 80% | Sim |
| Action Policy (ações irreversíveis) | 100% | Sim |
| Auth (login, refresh, permissões) | 90% | Sim |
| Contacts (opt-out, LGPD) | 80% | Sim |
| Knowledge (retrieve semântico/textual) | 70% | Não |
| Metrics (cálculos de KPI) | 70% | Não |
| Campanhas / Sender | 60% | Não |
| Frontend componentes | 50% | Não |
| E2E fluxos críticos | Fluxos da seção 4 | Sim (antes Scale) |

---

## 4. Fluxos E2E Prioritários (Playwright — pendente implementação)

| ID | Fluxo | Prioridade |
|----|-------|-----------|
| E2E-01 | Login → Dashboard → Inbox → Resposta manual em conversa | 🔴 |
| E2E-02 | Criar campanha → Adicionar contatos → Iniciar → Verificar status | 🔴 |
| E2E-03 | Importar lista CSV de contatos → Verificar criação | 🔴 |
| E2E-04 | Criar artigo na KB → Verificar que Lia usa no contexto | 🔴 |
| E2E-05 | Criar usuário operador → Verificar permissões restritas | 🟡 |
| E2E-06 | Platform Admin → Selecionar tenant → Verificar isolamento | 🟡 |
| E2E-07 | Opt-out via WhatsApp → Verificar que campanha não envia | 🟡 |
| E2E-08 | Configurar canal e-mail → Enviar e-mail de teste | 🟢 |

---

## 5. Como Rodar os Testes

```bash
# Backend — todos os testes
cd apps/backend
pnpm test
# equivale a: pnpm exec vitest run

# Watch mode (durante desenvolvimento)
pnpm exec vitest

# Com cobertura
pnpm exec vitest run --coverage

# Arquivo específico
pnpm exec vitest run src/application/agents/router-agent.service.spec.ts
```

---

## 6. Padrão de Escrita de Testes

```typescript
// Exemplo: router-agent.service.spec.ts
import { Test } from '@nestjs/testing';
import { RouterAgentService } from './router-agent.service';
import { AnthropicService } from '@/shared/ai/anthropic.service';

describe('RouterAgentService', () => {
  let service: RouterAgentService;
  let ai: jest.Mocked<AnthropicService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RouterAgentService,
        { provide: AnthropicService, useValue: { completeJson: jest.fn() } },
      ],
    }).compile();
    service = module.get(RouterAgentService);
    ai = module.get(AnthropicService);
  });

  it('roteia para vendas quando lead pergunta sobre preço', async () => {
    ai.completeJson.mockResolvedValue({ agent: 'sales', confidence: 0.9 });
    const result = await service.route({ message: 'quanto custa?' });
    expect(result.agent).toBe('sales');
  });
});
```

---

## 7. Critérios de Aceite para Pull Requests

- [ ] Nenhum teste existente quebrou (`pnpm test` passa no CI)
- [ ] Novos serviços têm ao menos 1 spec file com casos básicos
- [ ] `action-policy.spec.ts` passa 100% (crítico — ações irreversíveis)
- [ ] Cobertura não regrediu abaixo dos mínimos da seção 3

---

## 8. Roadmap de Implementação

| Prioridade | Item | Esforço estimado |
|-----------|------|-----------------|
| 🔴 Alta | Configurar Playwright + estrutura `apps/e2e` | 4h |
| 🔴 Alta | E2E-01 a E2E-04 (fluxos críticos) | 2 dias |
| 🟡 Média | Testes unitários: SupervisorAgent, EmailService, FollowUpService | 1 dia |
| 🟡 Média | E2E-05 a E2E-07 | 1 dia |
| 🟢 Baixa | Testes de componentes React (Vitest + Testing Library) | 2 dias |
| 🟢 Baixa | Setup de banco em memória para testes de integração | 1 dia |
