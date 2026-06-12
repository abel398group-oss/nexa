# Guardrails da IA — Nexa (Lia)

> Limites operacionais da Lia. Formaliza a seção de governança da `ia-autonoma`
> e os ADR 005 (Segurança/Permissões) e ADR 012 (Segurança da IA & Prompt
> Injection). Implementação em `application/actions/action-policy.ts` e
> `shared/governance/autonomy.service.ts`.

## Regra de ouro

**A IA conversa e recomenda; o backend valida identidade, tenant, perfil e
executa.** Nenhuma decisão crítica (financeira, contratual, exclusão de dados)
nasce na IA.

## 1. Action policy — o que a IA pode pedir

A IA nunca executa; ela **solicita** uma ação e o backend a valida contra a
política antes de executar (`ACTION_POLICY` em `action-policy.ts`):

| Ação | Exige backend | Exige humano |
|---|---|---|
| `consult_plan` | sim | não |
| `create_payment` | sim | não |
| `update_context` | sim | não |
| `escalate` | sim | não |
| `cancel_payment` | sim | **sim** |
| `refund` | sim | **sim** |
| `cancel_subscription` | sim | **sim** |
| `delete_customer` | sim | **sim** |
| `alter_contract` | sim | **sim** |

Toda ação **irreversível** exige um humano no loop. Ação fora da policy é
rejeitada por padrão (allowlist, não denylist).

## 2. Kill switch de autonomia

`AutonomyService` (`shared/governance/`) é um botão de pânico em runtime. O
default vem de `AI_AUTONOMY_ENABLED` (env) e pode ser ligado/desligado por um
admin a qualquer momento — desligado, a IA não age autonomamente e tudo cai para
o humano. Toda mudança é logada (`KILL SWITCH: ... por <quem>`).

## 3. Validação de entrada (prompt injection)

O Supervisor valida toda mensagem **antes** de processar (ADR 012):

- Tentativas de sobrescrever instruções ("ignore as regras", "você agora é…").
- Pedidos para revelar prompt de sistema, credenciais ou dados de outro tenant.
- Palavras de risco jurídico (processo, advogado, Procon) → escala humano.
- O conteúdo do lead é **dado não confiável** — nunca vira instrução nem fonte de
  `tenantId`.

## 4. Validação de saída (anti-alucinação / LGPD / tom)

O Supervisor valida toda resposta **antes** de enviar:

- **Anti-alucinação**: se não há conteúdo **aprovado** na KB que responda, a Lia
  diz "não encontrei, vou encaminhar" — nunca inventa (ADR 006 D5).
- **LGPD**: não expõe dado pessoal de terceiros nem de outro tenant.
- **Tom**: respeita o tom de marca; sem promessas comerciais não autorizadas
  (desconto, prazo, condição especial → escala).

## 5. Confiança mínima

`confidence < 0.60` → o Router pede esclarecimento ou escala. A IA não "chuta"
em decisão de roteamento ou ação.

## 6. Isolamento por tenant

`tenantId` vem **sempre** do contexto autenticado, nunca do corpo da requisição
ou da fala do lead (ADR 005 D2). Toda query é filtrada por tenant.

## 7. Limites de dados sensíveis

Nunca logar JWT, chaves, credenciais ou payloads sensíveis (ADR 005 D6). Memória,
conversas e health score são dado pessoal sob LGPD (ver `docs/ai/memory-strategy.md`).

## Relacionados

- ADR 005 — Segurança e Permissões · ADR 012 — Segurança da IA & Prompt Injection
- `docs/ai/ai-review-process.md` · `docs/security/security-overview.md`
- `application/actions/action-policy.ts` · `shared/governance/autonomy.service.ts`
