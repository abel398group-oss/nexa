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

---

## Adendo — Contrato de Leitura do TMS (a preencher quando Uelder entregar)

**Data:** 2026-06-10

A integração de leitura com o TMS — usada pelo enriquecimento de contato (ADR 020)
e pelo diagnóstico de suporte (ADR 015) — consome uma API ou conexão fornecida pelo
Uelder. Este adendo registra o contrato acordado.

> **⚠️ PREENCHER quando os endpoints/campos forem entregues pelo Uelder.**
> Enquanto não chega: `lookupCustomer()` e demais métodos de diagnóstico continuam
> com a implementação atual — retornam `null` quando `TMS_API_BASE_URL` não estiver
> configurado (fallback seguro, sem quebrar o fluxo).

### Requisitos de segurança da conexão (não-negociáveis)

1. **Credencial somente-leitura** — `SELECT` apenas. Nunca usuário com permissão de
   escrita. Zero `INSERT`/`UPDATE`/`DELETE` no banco do TMS.
2. **Preferir read-replica**, não o banco primário de produção do TMS (evita carga
   extra no operacional).
3. **Credencial/URL em secret criptografado** (`.env` / secret manager) — fora do
   repo, fora do browser, jamais em texto claro em código-fonte.
4. **Sempre atrás da interface `Connector`** — a implementação é trocável sem
   refatorar o pipeline (ADR 010).
5. **Timeout + circuit breaker** — falha ou lentidão do TMS não derruba o Nexa.
   Degrada graciosamente: enriquecimento pulado, diagnóstico sem dados externos,
   suporte continua via KB.

### Métodos de leitura esperados (confirmar contrato com Uelder)

| Método `Connector` | Retorno esperado | Consumido por |
|---|---|---|
| `lookupCustomer(phone)` | `{ externalId, name, email?, plan?, status, registeredAt? }` | Router (ADR 015) · Enriquecimento (ADR 020) |
| `getDocumentStatus(tipo, numero)` | `{ status, ambiente, rejeicao? }` (CT-e / MDF-e) | DiagnosticAgent (ADR 015) |
| `getRejectionInfo(codigo)` | `{ codigo, descricao, causa, correcao }` | DiagnosticAgent · Playbooks (ADR 017) |
| `getContractStatus(externalId)` | `{ plano, status, expiresAt?, docsUsed?, docsLimit? }` | DiagnosticAgent (ADR 015) |
| *(outros a confirmar)* | — | — |

### Campos disponíveis via API do Uelder — checklist (PREENCHER)

- [ ] `name` (razão social / nome do responsável)
- [ ] `email`
- [ ] `plan` (código do plano: basico / essencial / profissional)
- [ ] `status` (active / suspended / trial / cancelled)
- [ ] `registeredAt` (data de cadastro)
- [ ] Status de CT-e por número/chave
- [ ] Código de rejeição SEFAZ e descrição
- [ ] Status de contrato / documentos consumidos no mês
- [ ] *(listar campos adicionais conforme entrega)*
