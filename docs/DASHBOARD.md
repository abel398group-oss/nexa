---
type: dashboard
tags: [dashboard, status]
updated: 2026-07-02
summary: Status em tempo real do projeto Nexa — fases, ADRs e features pendentes.
---
# Dashboard — Nexa

> Para as queries automáticas funcionarem: **Settings → Community plugins → Dataview** (gratuito, roda local).
> Sem ele, as tabelas ficam em branco — o resto do dashboard ainda funciona normalmente.

---

## Status das fases

| Fase | Descrição | Status |
|---|---|---|
| 0–5 | MVP, hardening, backend, TMS, frontend, suporte | ✅ Produção |
| 6 | Monitor Proativo TMS | ✅ Produção |
| 6.1 | Monitor Frota (ADR-030) | ⏳ Doc pronta, impl. pendente |
| 6.2 | Cotação WhatsApp (ADR-031) | ⏳ Doc pronta, impl. pendente |
| 7 | IA Autônoma multi-agente | 🔮 Futuro |
| 8 | Multi-tenant completo + SaaS | 🔮 Futuro |
| 9 | Escala (HNSW, pool WA, API Meta) | 🔮 Futuro |

---

## Pendências imediatas

- [ ] HNSW pgvector (antes de 1.000 itens na KB)
- [ ] Backup automático no Droplet (script local já roda; versão Linux pendente)
- [ ] Monitor externo (UptimeRobot / BetterStack)
- [ ] Implementar Monitor Frota no TMS → [[docs/monitor/squad-tms-frota]]
- [ ] Implementar Cotação WhatsApp → [[docs/features/cotacao-whatsapp/squad-nexa]]

---

## Últimos docs modificados

```dataview
TABLE updated, summary
FROM "docs"
WHERE (type = "note" OR type = "moc" OR type = "dashboard") AND updated != null
SORT updated DESC
LIMIT 10
```

---

## ADRs — todas as decisões de arquitetura

```dataview
TABLE updated
FROM "docs/adr"
WHERE file.name != "README"
SORT file.name ASC
```

---

## Features documentadas

```dataview
LIST summary
FROM "docs/features"
WHERE type = "prd"
SORT file.name ASC
```

---

## Reviews e auditorias

```dataview
TABLE summary
FROM "docs/reviews"
SORT file.name DESC
```
