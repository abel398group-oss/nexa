# ADR 033 — IntegrationsModule: Sincronização de Planos TMS → Nexa

- **Status**: Aceito (implementado)
- **Data**: 2026-07
- **Relacionados**: ADR 022 (Botão TMS-Lia), ADR 032 (Monitor dual-channel + gate por plano)

---

## Contexto

O Nexa precisa saber quais planos cada tenant tem no HiperTMS para:

1. **Gate de features**: funcionalidades do Monitor Proativo (ADR 028/032) são
   liberadas por plano (ex: plano `basic` → apenas WhatsApp; plano `pro` → email + WhatsApp).
2. **Personalização da Lia**: a Lia pode adaptar o discurso de vendas e suporte
   com base no plano atual do cliente.

O HiperTMS é a fonte de verdade de planos e assinaturas (ADR 011). O Nexa não
replica a tabela de planos integralmente — recebe notificações push quando há mudança.

---

## Decisão

Criar um módulo `integrations/` no backend do Nexa com um único endpoint inicial:

```
POST /api/integrations/plan-sync
Authorization: Bearer <TMS_SYNC_SECRET>
Body: { tmsTenantId, planId, planName, features[] }
```

**Autenticação**: `TmsSyncGuard` valida o header Bearer contra `TMS_SYNC_SECRET`
(variável de ambiente, obrigatória em produção via `validateEnv`).

**Lógica**: upsert no `TenantNotificationConfig` do tenant resolvido via
`TMS_TENANT_ID_<SLUG>` (mesmo mecanismo do ADR 022/032) — atualiza `plan` e `features`.

O TMS chama este endpoint sempre que um tenant muda de plano (evento de billing).
O Nexa responde de forma idempotente: chamadas repetidas com os mesmos dados não
geram efeito colateral.

---

## Alternativas consideradas

| Alternativa | Rejeição |
|---|---|
| Polling periódico (Nexa consulta TMS) | Aumenta acoplamento e latência; push é mais simples |
| Replicar tabela de planos no Nexa | Violaria ADR 011 (TMS é a fonte de verdade de billing) |
| Leitura direta do banco TMS (`TMS_DB_URL`) | Acoplamento estrutural perigoso; já usado apenas para lookup de contatos, não para planos |

---

## Consequências

- `TMS_SYNC_SECRET` deve ser definido em produção (já adicionado ao `validateEnv`).
- O TMS precisa chamar `POST /api/integrations/plan-sync` ao criar/alterar assinatura.
- Módulo é extensível: próximos endpoints do handoff TMS↔Nexa entram aqui
  (ex.: sync de contratos, cancelamentos).
- O gate de features do Monitor (ADR 032) lê o campo `plan` do `TenantNotificationConfig`
  populado por este endpoint.
