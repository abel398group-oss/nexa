# Auditoria — Docs vs Código (2026-06-26)

> Comparação direta entre o que existe no repositório e o que está documentado.
> Metodologia: leitura do código (`apps/backend/src`, `apps/frontend/src`) + cruzamento com docs.

---

## 🔴 CRÍTICO — Caminhos errados em toda a documentação

**Problema:** docs referenciam `src/...` mas a estrutura real é `apps/backend/src/...`.

| Doc | Caminho errado | Caminho correto |
|---|---|---|
| `reviews/2026-06-20-auditoria-implementacao-nexa.md` | `src/presentation/ws/conversations.gateway.ts` | `apps/backend/src/presentation/ws/conversations.gateway.ts` |
| Todos os NEXA-01→08 | `src/application/...` | `apps/backend/src/application/...` |
| `IMPLEMENTATION_ROADMAP.md` | `src/application/monitor/` | `apps/backend/src/application/monitor/` |

**Impacto:** squad não encontra os arquivos quando segue a documentação.

---

## 🔴 CRÍTICO — `PROGRESS.md` completamente desatualizado

O arquivo ainda fala de:
- n8n rodando em paralelo ("ATENÇÃO: n8n AINDA responde em paralelo") — stale
- "Deploy DigitalOcean — Pendente" — sistema está em produção com CI/CD desde 2026-06
- Sprints 1-13 como referência — essa é a fase de construção inicial, não o estado atual

**Ação:** marcar como arquivo histórico no topo. Não é fonte de verdade do estado atual.

---

## 🔴 CRÍTICO — `BACKLOG.md` com itens de infra marcados como pendentes

| Item | Status no BACKLOG | Realidade |
|---|---|---|
| INFRA-1: Deploy DigitalOcean | ❌ Pendente | ✅ Em produção com CI/CD |
| INFRA-2: Hardening de segurança | ❌ Pendente | ✅ Feito (NEXA-01→08 auditoria 2026-06-20) |

---

## 🔴 CRÍTICO — `CHANGELOG.md` com duplicatas e inconsistências

| Problema | Detalhe |
|---|---|
| "Exportação de dados de contato (LGPD)" em Não lançado | NEXA-04 na v1.0.0 já lista `GET /contacts/:id/export` como implementado |
| "Monitoramento externo (UptimeRobot)" aparece 2x | Duplicata na seção "Não lançado" |
| "Índice HNSW do pgvector" aparece 2x | Duplicata na seção "Não lançado" |
| ADRs 029/030/031 (WhatsApp Status, Monitor Frota, Cotação WA) não aparecem | Criados nesta sessão, não refletidos no CHANGELOG |

---

## 🟡 DESATUALIZADO — `IMPLEMENTATION_ROADMAP.md`

| Problema | Detalhe |
|---|---|
| Seção final diz "Próximo foco: Monitor Proativo TMS" | Monitor já implementado (audit 2026-06-20, `apps/backend/src/application/monitor/`) |
| Fase 6 lista Monitor como pendente | Já feito |
| Fase 7 "Multi-tenant (virar SaaS)" listada como futura | Sistema já é multi-tenant desde o início |

---

## 🟡 NÃO DOCUMENTADO — módulo `proactive-engine` nativo do Nexa

**Existe em:** `apps/backend/src/application/proactive-engine/`

```
proactive-detector.service.ts   — detecta violações de regras
proactive-executor.service.ts   — executa ações para eventos detectados
proactive-engine.cron.ts        — cron a cada 15min + digest diário às 18h BRT
proactive-rule-config.service.ts — configuração de regras por tenant
proactive-detector.service.spec.ts
proactive-executor.service.spec.ts
```

**Este módulo é DIFERENTE do `monitor/`:**
- `monitor/` = consome eventos do TMS via polling (Monitor Proativo TMS)
- `proactive-engine/` = motor proativo NATIVO do Nexa (regras internas, digest diário)

**Não existe documentação** explicando este módulo, suas regras ou como configurar.

---

## 🟡 NÃO DOCUMENTADO — páginas do frontend

| Página | Arquivo | Documentada? |
|---|---|---|
| Saúde dos números WhatsApp | `NumberHealthPage.tsx` | ❌ |
| Tokens de desenvolvimento | `DevTokensPage.tsx` | ❌ |
| Configuração de suporte | `SupportConfigPage.tsx` | ❌ (parcial) |
| Clientes do suporte | `SupportClientsPage.tsx` | ❌ |
| Dashboard de suporte | `SupportDashboardPage.tsx` | ❌ |

---

## ✅ CONFIRMADO — O que está correto

| Item | Status no código | Status nos docs |
|---|---|---|
| Monitor Proativo (`application/monitor/` — 7 arquivos) | ✅ Implementado | ✅ Correto |
| Backup automático (`scripts/backup.ps1` + 14 arquivos em `backups/`) | ✅ Rodando | ⚠️ CHANGELOG diz pendente (confunde local vs Droplet) |
| NEXA-01→08 todos implementados | ✅ Confirmado | ✅ Auditoria 2026-06-20 |
| Frontend `MonitorConfigPage.tsx` | ✅ Existe | ✅ Documentado |
| `application/webhooks/` | ✅ Existe | ✅ Documentado (NEXA-06) |
| `shared/email-crypto/` | ✅ Existe | ✅ Documentado (NEXA-02) |
| `shared/guards/plan-quota.guard.ts` | ✅ Existe | ✅ Documentado (NEXA-07) |

---

## Resumo executivo

| Categoria | Qtd |
|---|---|
| 🔴 Crítico (bloqueia o squad) | 3 |
| 🟡 Importante (causa confusão) | 3 |
| ✅ Correto | 8 |

**Ação imediata recomendada:**
1. Corrigir CHANGELOG.md (duplicatas + inconsistência LGPD)
2. Corrigir IMPLEMENTATION_ROADMAP.md (Monitor já feito)
3. Adicionar aviso de arquivo histórico no PROGRESS.md
4. Documentar `proactive-engine` nativo
5. Corrigir caminhos `src/` → `apps/backend/src/` nos docs críticos
