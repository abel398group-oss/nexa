# ADR 011 — Source of Truth (dono de cada informação)

**Status:** Aceito · **Data:** 2026-06

## Contexto
Com plataforma independente (ADR 009) + conectores (ADR 010) + MVP n8n rodando, há risco de
**ambiguidade de propriedade dos dados**: quem é o dono de cada informação? Sem isso definido,
sincronização vira dor (divergência, duplicidade).

## Decisão
Cada entidade tem **UM dono** (source of truth). Os demais têm cópia/referência read-only.

### Matriz de propriedade
| Entidade | Dono (source of truth) | Quem mais lê |
|---|---|---|
| **Lead/Contato** | **Plataforma Leads** | — |
| **Conversa/Mensagem** | **Plataforma Leads** | — |
| **Classificação IA / Auditoria** | **Plataforma Leads** | — |
| **Knowledge Base** | **Plataforma Leads** (conteúdo do produto importado) | — |
| **Plano / Preço** | **Produto (TMS)** via `getPlans()` | Plataforma (read-only) |
| **Assinatura / Cobrança** | **Produto (TMS / Asaas)** | Plataforma (rastreio local em ai_billing_requests) |
| **Tenant / Acesso** | **Produto (TMS)** | Plataforma (external_tenant_id) |
| **Customer Health Score** | **Plataforma Leads** (calcula) — inputs podem vir do produto | — |
| **Dados de uso do produto** (CT-e emitido, login) | **Produto (TMS)** | Plataforma (read via Connector) |

### Regras
- **Plataforma é dona da relação comercial** (lead, conversa, venda-em-andamento)
- **Produto é dono do que é dele** (plano, preço, assinatura, acesso, uso)
- Nunca duas fontes escrevem o mesmo dado. Cópia é sempre read-only + `external_id`
- Health Score: a Plataforma **calcula** (dona do score), mas os **inputs** (último login,
  emissões) vêm do Produto via Connector (`getCustomerData()`)

## Consequências
- (+) Elimina ambiguidade e conflito de escrita
- (+) Sincronização vira "puxar do dono", não "reconciliar dois donos"
- (−) Plataforma depende do Connector para dados do produto (tratado com cache + healthCheck)

## Relação
- Conecta ADR 009 (plataforma), 010 (conectores), 008 (billing do produto)
- Base para o MIGRATION_PLAN (quem assume a escrita quando a plataforma nascer)
