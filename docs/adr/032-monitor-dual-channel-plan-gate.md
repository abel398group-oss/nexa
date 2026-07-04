# ADR 032 — Monitor Proativo: Dual-Channel, Auto-Fill e Plan Gate

- **Status:** Aceito
- **Data:** 2026-07-04
- **Autores:** Time Nexa
- **Relacionado:** ADR 028 (Monitor Proativo TMS)

---

## Contexto

O Monitor Proativo (ADR 028) envia alertas do TMS por WhatsApp. Após uso em produção, surgiram três necessidades:

1. **Canal dual**: muitos clientes preferem e-mail para alertas operacionais — WhatsApp é bom para urgências, e-mail para consulta posterior e arquivamento.
2. **UX de configuração**: o usuário precisava digitar telefone e e-mail manualmente mesmo tendo-os no cadastro.
3. **Gating por plano**: o Monitor é uma feature avançada que justifica planos maiores; clientes free/starter não devem ter acesso.

---

## Decisões

### D1 — Canal dual por setor (WhatsApp + E-mail)

Cada setor (`fiscal`, `logistic`, `frota`, `finance`) aceita dois campos de destinatário:
- `phone`: WhatsApp (E.164 sem `+`)
- `email`: endereço de e-mail (opcional)

Ambos são persistidos em `sectorConfig` (campo `Json` já existente em `TenantNotificationConfig`). Não requer migration de schema para adicionar o campo — apenas mudança no tipo documentado.

O `ConsolidationService` verifica `sc.phone` e `sc.email` independentemente: envia WhatsApp se `phone` preenchido, e-mail se `email` preenchido. Se ambos estiverem preenchidos, envia nos dois canais.

O e-mail usa `EmailReplyService.sendAlertEmail()` — método novo sem opt-out link, adequado para notificações operacionais admin-para-admin.

### D2 — Auto-fill a partir do cadastro

Novo endpoint `GET /monitor/prefill` retorna:
- `email`: e-mail do primeiro usuário `admin` do tenant
- `phone`: telefone do primeiro seller ativo do tenant

O frontend exibe um botão "Usar dados do meu cadastro" que preenche todos os setores com esses valores (apenas campos vazios são preenchidos — preserva configurações existentes).

### D3 — Default Dom-Sáb

O padrão de `sendDays` para novos tenants e novos setores muda de "dias úteis" (Seg-Sex) para "todos os dias" (Dom-Sáb). Razão: alertas CRITICAL (ex: CT-e rejeitado) não respeitam finais de semana — o cliente prefere ser notificado imediatamente.

Configs existentes com `sendDays` já gravado não são afetadas (preservação backward-compat).

### D4 — Plan gate com override de admin

**Gate:** O Monitor só é habilitável em planos `pro` ou `enterprise` (e aliases `profissional`, `corporativo`). A lógica vive no backend:

- `GET /monitor/config` retorna `planAllowed: boolean` (calculado via `PlanLimit.plan`)
- `PUT /monitor/config` com `enabled: true` retorna 403 se plano não autorizado e sem override
- O frontend exibe banner informativo e desabilita o botão "Salvar" quando `!planAllowed`

**Override por tenant:** Um platform admin pode desbloquear o Monitor para qualquer tenant independentemente do plano via `POST /monitor/config/override` com `{ enabled: boolean }`. O override é persistido em `TenantNotificationConfig.monitorOverride` (nova coluna `monitor_override BOOLEAN DEFAULT false`).

A migration é aditiva e não-destrutiva.

---

## Consequências

- `EmailModule` precisa exportar `EmailReplyService` para uso pelo `ConsolidationService`
- `MonitorModule` importa `EmailModule`
- O `processPerSector` do `ConsolidationService` dispara no máximo 2 envios por setor/tick
- `UpdateConfigDto` não expõe `monitorOverride` — o campo só é alterável via endpoint dedicado
- Tenants existentes sem `PlanLimit` têm `plan = null` → `planAllowed = false` (safe default)
- O gate não bloqueia a leitura de alertas — clientes em qualquer plano podem ver os alertas já criados

---

## Alternativas descartadas

**Gate via middleware separado**: Criar um guard dedicado. Descartado — lógica simples demais para justificar guard; verificação inline no service é mais legível.

**E-mail via serviço separado (AlertEmailService)**: Criar um novo serviço de e-mail apenas para alertas. Descartado — `EmailReplyService` já tem toda a lógica SMTP; adicionar `sendAlertEmail()` a ele é mais DRY.

**Override via interface admin separada**: Criar tela de admin para gerenciar overrides. Descartado para MVP — platform admin opera via atuação direta no tenant (`x-acting-tenant-id`) e vê o toggle na própria página do Monitor.
