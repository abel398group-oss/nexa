# ADR 010 — Arquitetura de Conectores (multi-produto)

**Status:** Aprovado · **Data:** 2026-06

## Contexto
O ADR 009 definiu que a plataforma de leads é independente e vende **qualquer produto
conectado** (HiperTMS hoje, CRM e outros SaaS no futuro). Falta formalizar **como** um
produto se conecta.

## Decisão
Cada produto é integrado via um **Connector** que implementa uma interface comum.
A plataforma fala com a interface, nunca com o produto direto.

### Interface Connector
```typescript
interface Connector {
  getPlans()              // catálogo de planos do produto
  createPaymentRequest()  // inicia cobrança
  getPaymentStatus()      // consulta status (reconciliação)
  provisionAccess()       // libera acesso após pagamento
  suspendAccess()         // suspende (inadimplência/cancelamento)
  getKnowledgeBase()      // conteúdo de suporte do produto
  getCustomerData()       // dados do cliente no produto (read-only)
  healthCheck()           // conector/produto está disponível?
}
```
> A interface completa é o alvo; implementar incremental (começar por getPlans +
> createPaymentRequest + provisionAccess + healthCheck).

### Fallback quando o conector está indisponível (regra)
Antes de vender/cobrar/suportar, checar `healthCheck()`. Se indisponível:
```
- NÃO criar cobrança
- NÃO prometer liberação de acesso
- emitir evento connector_unavailable (catálogo ADR 007)
- escalar para humano OU responder fallback ("já te retorno")
```
Liga com o circuit breaker (ADR 004).

### Credenciais por produto (criptografadas)
Cada produto tem API própria → credenciais por produto/tenant, **sempre criptografadas**:
```
product_connector_credentials:
  id, tenant_id, product_id, credential_type, encrypted_secret, status, created_at
```
> Nunca em texto puro. Service account dedicada por produto.

### Implementações
- `HiperTmsConnector` → via API do TMS (Asaas, SubscriptionsService, KB do TMS) — 1º
- `CrmConnector` (futuro) → para o próximo SaaS

### Registry de produtos
Tabela `products` — a IA precisa saber **qual produto está vendendo**:
```
products: id, code, name, connector, status
  hipertms · Hipervias TMS · HiperTmsConnector · active
  crm      · Hipervias CRM · CrmConnector       · active (futuro)
```

### Identidade entre plataforma e produto
- `tenant_id` → pertence à **plataforma de leads**
- `external_tenant_id` → pertence ao **produto conectado**
```
Plataforma:  tenant_id = lead_001
HiperTMS:    external_tenant_id = tms_123
CRM futuro:  external_tenant_id = crm_999
```

## Segurança (ganho do modelo)
A plataforma **NÃO acessa o banco do produto**. Acessa só a **API** do produto via
**service account** (credencial dedicada). Isolamento real entre plataforma e produtos.

## Consequências
- (+) Adicionar novo produto = criar novo Connector (sem mexer no core)
- (+) Plataforma agnóstica ao produto; reutilizável
- (+) Segurança: API + service account, sem acesso direto a banco alheio
- (−) Cada produto exige implementar/manter seu Connector

## Relação
- Decorre do ADR 009 (plataforma independente)
- ADR 008 (billing TMS) = parte do `HiperTmsConnector` (createPaymentRequest/getPaymentStatus)
- Tabela `products` no data-model/schema

## Pendências
- Detalhar contrato de cada método (payloads) ao implementar a Fase 3
- Definir biblioteca de criptografia das credenciais (KMS/secret manager)
