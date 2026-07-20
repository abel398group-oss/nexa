# Standby do alerta imediato — implementação (2026-07-20)

> Decisão do Abel no brainstorm de alertas de 20/07/2026: o Monitor é
> **informativo** — o digest agendado basta. O alerta imediato fora do ciclo
> fica em standby até decidirmos o alcance do CRITICAL (backlog A) e o gate de
> inbound. Registro central: [docs/STANDBY.md](../STANDBY.md).

## O que mudou

| Arquivo | Mudança |
|---|---|
| `apps/backend/src/application/monitor/monitor.service.ts` | Novo helper `isImmediateAlertsEnabled()` (lê `MONITOR_IMMEDIATE_ALERTS` a cada chamada) + early-return no topo de `sendAlertsToAdmins()` com `logger.log` explicando o motivo (REGRA 3: nenhum descarte silencioso). |
| `apps/backend/src/application/monitor/monitor.service.spec.ts` | Flag forçado `true` no topo do spec (os testes G3/G4/H1/janela exercitam o fluxo imediato de propósito) + describe novo "STANDBY flag" com 3 casos: default desligado, valor ≠ `true` desligado, `true` religa. |
| `apps/backend/.env.example` | `MONITOR_IMMEDIATE_ALERTS=false` documentado no bloco do Monitor. |

## Comportamento

- **Flag ausente ou ≠ `true` (default):** `sendAlertsToAdmins()` retorna 0 sem
  enviar nem enfileirar. Log em nível `log`:
  `"Monitor: N evento(s) novo(s) NÃO enviados imediatamente — alerta imediato em standby"`.
- **Flag `true`:** comportamento anterior integral — filtro `immediateSeverity`
  por tenant, janela de envio com hold (`immediate-hold`), agrupamento por
  (telefone, setor).

## O que NÃO mudou

- `syncAlertStates()` continua sincronizando tudo no `AlertState` — os eventos
  aparecem normalmente no digest agendado e no painel.
- O campo `immediateSeverity` do config/DTO continua aceito (Regra 1 — nunca
  quebrar o emissor TMS); fica inerte enquanto o standby estiver ativo.
- Digest agendado, closing report e e-mail: intocados.
- Nenhuma migration — mudança 100% de código + env.

## Produção

Nenhuma ação necessária no droplet: a variável **ausente** já significa
desligado. Basta o deploy normal do backend. Para reativar no futuro:
`MONITOR_IMMEDIATE_ALERTS=true` no `/root/nexa/.env` (conferir antes com
`cat /root/nexa/.env` — REGRAS-SQUAD) + restart do backend.
