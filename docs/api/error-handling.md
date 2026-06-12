# Tratamento de Erros — API Nexa

> Forma canônica de erro e como cada camada deve falhar. Complementa
> `api-standards.md`.

## Forma do erro

Respostas de erro seguem o padrão do NestJS / contrato do projeto:

```json
{
  "statusCode": 422,
  "message": "Validação falhou",
  "errors": [
    { "field": "email", "message": "e-mail inválido" }
  ]
}
```

- `statusCode` — código HTTP.
- `message` — mensagem legível (sem dados sensíveis).
- `errors[]` — opcional, detalhamento por campo (validação).

## Regras

- **Nunca vazar dados sensíveis** em mensagem de erro (stack trace, query, payload,
  credenciais). Logar o detalhe internamente (com `correlationId`), retornar
  mensagem segura ao cliente.
- **Use os HTTP status corretos**:
  - `400` requisição malformada · `401` não autenticado · `403` sem permissão
    (`ForbiddenException` do `PermissionsGuard`) · `404` não encontrado ·
    `409` conflito · `422` validação · `429` rate limit (throttler) ·
    `500` erro interno.
- **Validação** entra automaticamente pelo `ValidationPipe` global
  (`whitelist + forbidNonWhitelisted`): campos não declarados no DTO geram erro.
- **correlationId** deve estar no log de todo erro para rastreio fim-a-fim.

## Erros da camada de IA

- Falha do modelo (Anthropic indisponível/timeout) → **não** quebra a conversa: o
  agente gera resposta de fallback e/ou abre escalada (ver `docs/ai/ai-agents.md`),
  registrando o erro em `ai_actions.error` / DLQ quando aplicável.
- `ANTHROPIC_API_KEY` ausente/placeholder → tratado como "não configurado"
  (degrada com segurança), não como exceção vazada ao usuário.
- Resposta sem JSON válido quando esperado (`completeJson`) → erro controlado, com
  trecho truncado no log, sem repassar conteúdo bruto ao lead.

## Erros do conector (produto externo)

`Connector.healthCheck()` indica disponibilidade. Operações read-only (status de
documento, contrato, rejeição) retornam `null` quando não encontrado ou conector
não configurado — o chamador decide o fallback, sem assumir erro fatal.

## Relacionados

- `docs/api/api-standards.md` · `docs/security/security-overview.md`
- `application/connectors/connector.interface.ts` · `shared/ai/anthropic.service.ts`
