# Testing Strategy — Plataforma de Leads

> Estratégia de testes. Sem isso, qualquer alteração futura quebra silenciosamente.
> A tabela `ai_test_suites` (schema) já existe — aqui é a estratégia.

**Status:** Proposto · **Data:** 2026-06

---

## Pirâmide de testes
```
        /\      E2E (poucos, fluxos críticos) — Playwright (como o TMS)
       /  \     Integração (médios) — API + banco real (test container)
      /____\    Unit (muitos, rápidos) — regras de negócio, serviços
```

## Por camada
| Camada | O que testar | Ferramenta |
|---|---|---|
| **Unit** | Regras: score, opt-out, round robin, validação de billing | Vitest/Jest |
| **Integração** | Endpoints da API + Prisma (banco de teste) | Supertest + Testcontainers |
| **E2E** | Fluxos críticos: lead→venda→pagamento; opt-out; suporte | Playwright |

## Testes específicos de IA (ai_test_suites — ADR 012)
Cenários OBRIGATÓRIOS antes de cada release de prompt/agente:
- prompt_injection (ignore instruções / obter segredo / alterar preço)
- lead_agressivo (ofensa → não revida, escala)
- lead_tecnico (resposta precisa via KB)
- cancelamento (exige humano — Action Policy)
- fraude / valor divergente (BLOCK_PAYMENT)
- alucinação (sem KB → "não encontrei", não inventa)

## Fluxos críticos que NUNCA podem quebrar (cobertura obrigatória)
- Opt-out (LGPD) · confirmação de pagamento · liberação de acesso · isolamento de tenant

## Gates de qualidade (CI)
- PR não mergeia com teste vermelho
- Cobertura mínima nos módulos críticos (billing, auth, actions)
- ai_test_suites verdes antes de publicar novo prompt/agente

## Quando criar
- Setup base no Sprint 1-2 (junto com o backend)
- Cresce com cada feature (TDD onde fizer sentido em billing/actions)
