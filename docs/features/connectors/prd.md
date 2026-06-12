# PRD — Conectores (Integração com Produtos)

## Visão geral

Conectores são a camada de integração entre a Nexa e produtos externos. Cada produto (ex: HiperTMS) implementa a interface `Connector` e expõe planos, conhecimento e operações de cliente.

## Interface Connector

```typescript
Connector {
  readonly productCode: string

  // disponibilidade, catálogo e conhecimento
  healthCheck(): Promise<{ ok, detail }>
  getPlans(): Promise<Plan[]>
  getKnowledge(): Promise<KnowledgeItem[]>

  // cobrança / acesso (a IA solicita; o backend executa)
  createPaymentRequest(input): Promise<PaymentRequestResult>
  getPaymentStatus(id): Promise<{ status }>
  provisionAccess(input): Promise<{ ok }>
  suspendAccess(input): Promise<{ ok }>

  // identificação do contato
  lookupCustomer(phone): Promise<TmsCustomer | null>

  // diagnóstico de suporte — read-only (ADR 015 D3)
  getDocumentStatus(externalId, type): Promise<DocumentStatus | null>
  getRejectionInfo(code): Promise<RejectionInfo | null>
  getContractStatus(externalId): Promise<ContractStatus | null>
}
```

## Conector HiperTMS

Produto: sistema de gestão de transporte para transportadoras.

| Método | Status | Descrição |
|---|---|---|
| `healthCheck()` | ✅ | Verifica se TMS_API_BASE_URL está configurado |
| `getPlans()` | ✅ stub | Retorna 3 planos (Básico/Essencial/Profissional) |
| `getKnowledge()` | ✅ real | ~20 artigos extraídos dos PRDs oficiais do TMS |
| `lookupCustomer()` | ✅ | Busca cliente por telefone na API do TMS |
| `createPaymentRequest()` | ⏳ stub | Aguarda integração real com Uelder |
| `getPaymentStatus()` | ⏳ stub | Aguarda integração real |
| `provisionAccess()` | ⏳ stub | Aguarda integração real |
| `suspendAccess()` | ⏳ stub | Aguarda integração real |
| `getRejectionInfo()` | ✅ real | Tabela local de rejeições SEFAZ comuns (diagnóstico offline) |
| `getDocumentStatus()` | ⏳ stub | Aguarda API fiscal real do TMS |
| `getContractStatus()` | ⏳ stub | Aguarda API real do TMS |

## Acesso direto ao banco TMS (TmsLookupService)

Para campanhas e roteamento inbound, o Nexa consulta diretamente o PostgreSQL do HiperTMS (read-only).

**Regra absoluta: NUNCA escreve no banco TMS. Apenas SELECT.**

- Tabelas consultadas: `tenant_core_user`, `tenant_company`
- Configuração: `TMS_DB_URL` no `.env`
- Fail-open: se TMS indisponível, retorna vazio sem erro

## Configuração (env)

```
TMS_API_BASE_URL=  # URL base da API do TMS (aguardando Uelder)
TMS_SERVICE_TOKEN= # Token interno de autenticação
TMS_DB_URL=postgresql://...  # Conexão direta ao banco (read-only)
```

> Lista canônica de todas as variáveis em
> [`docs/security/secrets-management.md`](../../security/secrets-management.md).

## Referências

- Interface: `apps/backend/src/application/connectors/connector.interface.ts`
- HiperTMS Connector: `apps/backend/src/application/connectors/hipertms.connector.ts`
- TMS Lookup: `apps/backend/src/infra/tms/tms-lookup.service.ts`
