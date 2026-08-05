# ADR 009 — Sistema de Leads como Plataforma Independente (não módulo do TMS)

**Status:** Aceito · **Data:** 2026-06

## Contexto
Ficou em aberto (ADR 002/008) se o sistema de automação de leads/IA seria um **módulo
dentro do HiperTMS** ou um **serviço separado**. A visão do dono define a resposta: o
sistema deve **virar um produto**, e haverá **outros SaaS** (ex: CRM) no futuro.

## Decisão
O sistema de leads/IA é uma **PLATAFORMA INDEPENDENTE**, não um módulo do TMS.
Ele vende/atende/cobra para **qualquer produto conectado** — o HiperTMS é apenas o
**primeiro conector**, não a regra fixa.

```
        ┌─────────────────────────────┐
        │  Plataforma de IA / Leads   │  (produto próprio)
        │  vende · atende · cobra      │
        └──────────────┬──────────────┘
                       │ conecta via API (conectores)
        ┌──────────────┼──────────────┐
   ┌────┴────┐    ┌────┴────┐    ┌────┴────┐
   │ HiperTMS│    │   CRM   │    │ outro   │
   │ (1º)    │    │(futuro) │    │ SaaS    │
   └─────────┘    └─────────┘    └─────────┘
```

### Princípios
- **Produto próprio:** deploy, time, banco, auth e evolução independentes do TMS
- **Conectores plugáveis:** cada produto vendido é um conector (billing, provisionamento,
  base de conhecimento). O HiperTMS é o conector inicial.
- **A plataforma não conhece o produto:** ela vende "o produto conectado", não o TMS
  hardcoded. Trocar/adicionar produto = adicionar conector.
- **Multi-tenant desde o início:** já previsto no schema e ADRs.

### O que isso confirma (sem retrabalho)
Tudo que já foi documentado **já assumia** desacoplamento e multi-tenant:
- Schema com `id` (local) + `external_*_id` (ref do produto/TMS)
- ADR 008 (billing TMS) → vira **um conector de billing**, não a regra
- Event bus, correlationId, governança → agnósticos ao produto

### Conceito de Conector (a generalizar na implementação)
Um conector encapsula a integração com um produto:
```
Connector (interface):
  - getPlans()              → catálogo de planos do produto
  - createPaymentRequest()  → inicia cobrança
  - provisionAccess()       → libera acesso após pagamento
  - getKnowledgeBase()      → conteúdo de suporte do produto
```
- `HiperTmsConnector` → implementa via API do TMS (Asaas, SubscriptionsService)
- `CrmConnector` (futuro) → implementa para o próximo SaaS

## Consequências
**Positivas**
- Vira produto vendável e reutilizável em vários SaaS
- Independência operacional (TMS cair não derruba os leads)
- Liberdade técnica e de roadmap
- O esforço de hoje (vender o TMS) é reaproveitado para os próximos produtos

**Negativas / custos**
- Precisa de auth próprio (não reusa o do TMS)
- Precisa de credencial de serviço para chamar a API de cada produto
- Banco próprio (o schema que já desenhamos)
- Mais trabalho de integração inicial vs ser módulo

## Impacto nos documentos existentes
- **ADR 002 (frontend):** stack própria (já previsto), reusando padrões do TMS como referência
- **ADR 008 (billing):** reinterpretado — o TMS é o **primeiro conector de billing**, não a regra
- **data-model / schema:** `tenant_id` é da plataforma; `external_*_id` referencia cada produto
- **roadmap:** mantém-se; a "decisão módulo vs serviço" fica **RESOLVIDA = serviço/plataforma**

## Pendências de implementação

Verificado 2026-08-05 — as três já estão resolvidas no código:

- [x] Interface `Connector` em detalhe → `application/connectors/connector.interface.ts`,
  implementada por `HiperTmsConnector`.
- [x] Auth próprio da plataforma → JWT + cookie HttpOnly (`shared/auth/`) e
  módulo `users` — não reusa login do TMS.
- [x] Credencial de serviço para a API do TMS → `TMS_INTERNAL_TOKEN`/`TMS_SERVICE_TOKEN`,
  enviada como `Authorization: Bearer` em toda chamada (`hipertms.connector.ts`).

## Nota
Decisão estratégica do dono (visão de produto + múltiplos SaaS). Não reabrir sem mudança
de visão de negócio.
