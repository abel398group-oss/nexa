# Estratégia de Memória — Nexa (Lia)

> O que a Lia lembra, por quanto tempo e sob quais regras. Liga ADR 005
> (retenção/LGPD), ADR 006 (KB) e ADR 011 (Source of Truth).

## Camadas de memória

| Camada | O que guarda | Onde | Escopo |
|---|---|---|---|
| **Curto prazo (conversa)** | últimas mensagens + resumo do diálogo atual | `ai_conversations` / `ai_messages` | uma conversa |
| **Médio prazo (contato)** | `customer_context`: estágio, último passo de onboarding, preferências | tabelas de contato/contexto | um contato/tenant |
| **Longo prazo (conhecimento)** | KB aprovada e versionada | `ai_knowledge_base` / `_versions` | tenant/produto |

A KB **não é memória de conversa** — é conhecimento curado (ver
`rag-architecture.md`). Conversa e `customer_context` são memória; KB é referência.

## Source of truth (ADR 011)

Cada dado tem um dono. A Lia **não** é dona de billing, contrato ou status do
cliente — isso vive no produto (HiperTMS), lido via Connector (read-only). A Lia é
dona apenas do histórico conversacional e do contexto comercial/atendimento. Nunca
duplicar dado que o produto já é fonte de verdade.

## Retenção (ADR 005 D5)

- **Mensagens**: 24 meses.
- **Auditoria**: 60 meses.
- **Financeiro**: conforme legislação.
- Após o prazo → anonimizar ou expurgar (`audit_retention`).

## LGPD (ADR 005 D4)

Conversas, memória e health score são **dado pessoal**. Suporta:
direito de exclusão, exportação, consentimento e anonimização. Memória de um
contato é isolada por tenant e nunca exposta a outro tenant ou a terceiros.

## Como a memória entra no contexto

Não se reenvia o histórico bruto a cada turno. O agente recebe um **resumo + as
últimas N mensagens** e o recorte relevante de `customer_context` (ver
`context-engineering.md`). Conversas longas são resumidas para caber no orçamento
de tokens.

## Relacionados

- ADR 005 — Segurança/Permissões (retenção, LGPD) · ADR 011 — Source of Truth
- `docs/ai/context-engineering.md` · `docs/ai/rag-architecture.md`
- `docs/security/security-overview.md`
