# Padrões de API — Nexa

> Padrões transversais da API (NestJS). O contrato por recurso vive em
> `docs/api-contract.md`; aqui ficam as regras que valem para todos os endpoints.

## Princípios

- A API é a **autoridade do domínio** (validações e invariantes vivem aqui).
- **Multi-tenancy obrigatório**: endpoints protegidos derivam `tenantId` do
  contexto autenticado, nunca do body ou da fala do lead.
- **Backend decide; a IA solicita** — ações partem de endpoints validados (action
  policy, ADR 012), não da camada conversacional.
- Erros têm forma consistente e não vazam dados sensíveis (ver `error-handling.md`).

## Convenções gerais

- **Base URL**: prefixo global `/api` (`setGlobalPrefix('api')`).
- **Auth**: JWT em **cookie HttpOnly** (mesmo padrão do HiperTMS).
- **JSON**: `camelCase` nos campos.
- **correlationId**: presente em headers de operações de fluxo (rastreio fim-a-fim).
- **Validação**: `ValidationPipe` global com `whitelist + forbidNonWhitelisted`
  (campos não declarados no DTO são rejeitados → anti mass-assignment).

## Estrutura por módulo

Cada feature tende a ter:

- `presentation/http/<feature>/*.controller.ts` — boundary HTTP (REST).
- `application/<feature>/*.service.ts` — regras de negócio.
- `dto/` — validação/contratos (class-validator).

WebSocket (inbox em tempo real) em `presentation/ws/` (socket.io).

## Paginação

Padrão `PaginationQueryDto` (`shared/dto/pagination.dto.ts`):

```
?limit=50&offset=0&search=texto
```

- `limit`: default **50**, mín 1, máx **100**.
- `offset`: default **0**, mín 0.
- `search`: opcional.

Resposta de lista (`Paginated<T>`):

```json
{ "items": [ /* ... */ ], "total": 123 }
```

## Autorização

Rotas protegidas usam `@RequirePerm('<recurso>')` + `PermissionsGuard`. `admin`
passa sempre; demais perfis precisam da permissão explícita. Sem decorator → rota
sem exigência de permissão (ainda sujeita à autenticação quando aplicável).
Rotas exclusivas da plataforma usam `PlatformAdminGuard` (somente `tenantId === null`).

### Atuação multi-tenant (acting-as)

O `EffectiveTenantInterceptor` resolve o tenant efetivo de cada request:

- Cliente comum: tenant vem do token; headers de atuação são ignorados.
- Platform admin: atua num cliente via header `x-acting-tenant-id` (validado).
  Ações irreversíveis (DELETE, disparar campanha) exigem `x-acting-override`.

Ver `docs/security/security-overview.md` e `docs/features/platform-admin/`.

## Rate limiting

`@nestjs/throttler` global: **100 req/min por IP**. Endpoints sensíveis podem
endurecer o limite por rota.

## Documentação (OpenAPI)

Swagger em `/api/docs` (dev/staging), gerado por `@nestjs/swagger`, com
`addCookieAuth('access_token')`. **Desativado em produção.** O `api-contract.md`
deve evoluir para um `openapi.yaml` formal.

## Relacionados

- `docs/api/error-handling.md` · `docs/api/naming-conventions.md`
- `docs/api-contract.md` · `docs/security/security-overview.md`
- `shared/dto/pagination.dto.ts` · `shared/auth/permissions.guard.ts`
