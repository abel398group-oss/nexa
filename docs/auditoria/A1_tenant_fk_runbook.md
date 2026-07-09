# A1 — Runbook: `tenantId` String → Foreign Key

> Referência: [`AUDITORIA_2026-07-08.md`](./AUDITORIA_2026-07-08.md) (finding A1)
> Status: **NÃO executado** — migration destrutiva em banco de produção ao vivo exige staging.

## O problema

`tenantId` é `String` solto em ~20+ tabelas, sem FK para `tenants(id)`. Consequências:
- Sem integridade referencial: nada impede um `tenantId` inexistente/digitado errado.
- Excluir um tenant deixa **órfãos espalhados** (sem `ON DELETE`).
- Relatórios/billing por tenant ficam expostos a lixo silencioso.

## Por que ainda não foi feito

Criar as FKs numa base **em produção com dados reais** é arriscado:
1. Se existir **qualquer órfão** (`tenant_id` sem `Tenant` correspondente), a criação da FK **falha**.
2. O lock de validação em tabelas grandes (`ai_messages`) pode travar escrita.

Por isso este item **exige um ambiente de staging** e uma sequência controlada.

## Sequência segura (quando houver staging)

1. **Detectar órfãos (read-only):** rodar [`scripts/check-tenant-orphans.sql`](../../scripts/check-tenant-orphans.sql)
   na cópia de produção. Ele lista, por tabela, quantas linhas têm `tenant_id` sem `Tenant`.
   - Se sair **só `ok:`** → seguir para o passo 3.
   - Se aparecer **`ORFAOS:`** → passo 2 primeiro.
2. **Limpar/religar órfãos:** para cada tabela com órfãos, decidir caso a caso —
   criar o `Tenant` que falta, reatribuir ao tenant correto, ou arquivar/apagar as linhas.
   Rodar o script de novo até dar tudo `ok:`.
3. **Escrever a migration de FK** (uma tabela por vez, ou em lote), no formato:
   ```sql
   ALTER TABLE "contacts"
     ADD CONSTRAINT "contacts_tenant_id_fkey"
     FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
     ON DELETE RESTRICT;   -- ou CASCADE, decidir por tabela
   ```
   Em tabelas grandes, usar `NOT VALID` + `VALIDATE CONSTRAINT` em passo separado
   para não travar escrita durante a validação:
   ```sql
   ALTER TABLE "ai_messages"
     ADD CONSTRAINT "ai_messages_tenant_id_fkey"
     FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") NOT VALID;
   -- depois, fora do horário de pico:
   ALTER TABLE "ai_messages" VALIDATE CONSTRAINT "ai_messages_tenant_id_fkey";
   ```
4. **Refletir no schema.prisma:** trocar `tenantId String` por `tenant Tenant @relation(...)`
   nas models (mudança grande — revisar cada uso do campo).
5. **Testar em staging** (build + suíte + fluxo real) antes de aplicar em produção.
6. **Aplicar em produção** em janela de baixo tráfego, com backup recente.

## Decisão de `ON DELETE` por tabela (rascunho)

| Tabela | Sugestão | Motivo |
|--------|----------|--------|
| contacts, ai_conversations, ai_messages, campaigns, opportunities | `RESTRICT` | não apagar dado comercial junto com o tenant sem intenção explícita |
| sessions*, processed_messages*, notification_logs | `CASCADE` | efêmero/derivado (*sessions é por userId, não tenantId) |
| plan_limits, sender_settings, sales_playbook, email_channels | `CASCADE` | config 1:1 do tenant |

> Ajustar conforme a regra de negócio de exclusão de tenant (hoje não há fluxo de exclusão).
