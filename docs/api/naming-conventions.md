# Convenções de Nomenclatura — Nexa

> Nomes consistentes em rotas, arquivos, DTOs, eventos e banco. Complementa
> `api-standards.md`.

## Rotas (REST)

- Recursos no **plural, kebab-case** sob `/api`: `/contacts`, `/conversations`,
  `/email-channel`.
- Sub-recursos aninhados: `/conversations/:id/messages`.
- Ações que não são CRUD usam verbo explícito no caminho quando necessário:
  `POST /contacts/import`. Preferir REST sempre que possível.
- IDs como path params: `:id`.

## JSON

- Campos em **camelCase** (`externalPaymentId`, `correlationId`).
- Booleanos com prefixo claro (`approved`, `requiresHuman`).
- Datas em ISO 8601 (string).

## Arquivos e símbolos (backend)

| Tipo | Padrão | Exemplo |
|---|---|---|
| Módulo | `<feature>.module.ts` | `agents.module.ts` |
| Serviço | `<feature>.service.ts` | `conversations.service.ts` |
| Controller | `<feature>.controller.ts` | `contacts.controller.ts` |
| Agente | `<papel>-agent.service.ts` | `router-agent.service.ts` |
| DTO | `<acao>-<entidade>.dto.ts` | `create-contact.dto.ts` |
| Spec | `<arquivo>.spec.ts` | `router-agent.service.spec.ts` |
| Pasta de feature | `application/<feature>/` | `application/knowledge/` |

Classes em `PascalCase` (`PaginationQueryDto`, `PermissionsGuard`); variáveis e
funções em `camelCase`; constantes de configuração em `UPPER_SNAKE` (`ACTION_POLICY`,
`AI_MODEL`).

## Banco de dados

- Tabelas do domínio de IA com prefixo `ai_` (`ai_conversations`, `ai_messages`,
  `ai_knowledge_base`, `ai_knowledge_versions`, `ai_actions`, `ai_escalations`).
- Migrações com timestamp + descrição em snake_case:
  `20260610010000_email_channel` (ver `docs/infra/prisma-migrations.md`).
- Colunas em snake_case no banco; o Prisma mapeia para camelCase no código.

## Eventos (ADR 004 / 007)

- Nome no passado, `dominio.evento`: `payment.confirmed`, `conversation.escalated`.
- Sempre carregam `correlationId` e `tenantId` no envelope.

## Tipos de ação (action policy)

snake_case alinhado à `ACTION_POLICY`: `create_payment`, `cancel_subscription`,
`alter_contract`.

## Relacionados

- `docs/api/api-standards.md` · `docs/architecture/codebase-structure.md`
- ADR 007 — Event Catalog · `docs/schema/`
