---
tags:
  - adr
status: accepted
---

# ADR 036 — Digest do Monitor: throttle por severidade + assimetria de canal

| Campo | Valor |
|------|-------|
| **Status** | Aceito (implementado) |
| **Data** | 2026-07-20 |
| **Autores** | Abel + squad Nexa |
| **Versão** | 1.0 |
| **Escopo** | `apps/backend` (monitor) — contrato TMS↔Nexa INTOCADO |
| **Dependências** | Standby do imediato (docs/STANDBY.md); severidade já trafega no ingest |

## Contexto

Regras de alto volume do TMS (shipment.*, quote.*, installment.due_soon) geram
um evento por documento — o digest do WhatsApp fica longo, a pessoa para de
ler e perde também o que importa. A alternativa "cliente marca quais regras
quer" foi descartada: exigiria o usuário entender 23 regras. Inspiração: o
cron de certificados do TMS (`handleExpiringCertificateCron`) já modula a
FREQUÊNCIA pela urgência sem pedir nada a ninguém.

Durante a análise foi encontrado um gap: o digest unificado excluía CRITICAL
(assumindo o canal imediato ativo — `consolidation.service.ts`), mas o
imediato está em standby desde 20/07 → crítico não saía em canal nenhum.

## Decisão

- **D1 — Throttle por severidade, só no WhatsApp:** CRITICAL e OVERDUE em todo
  digest; DUE_SOON no máximo a cada 7 dias; INFO a cada 28. Limiares num único
  lugar (`digest-throttle.const.ts`), com override por env
  (`DIGEST_THROTTLE_DUE_SOON_DAYS` / `DIGEST_THROTTLE_INFO_DAYS`).
- **D2 — Assimetria de canal:** e-mail recebe SEMPRE o conjunto completo (ler
  e-mail é barato; WhatsApp interrompe). Texto e HTML do e-mail são montados a
  partir do conjunto cheio — nunca reaproveitar a mensagem do WhatsApp.
- **D3 — Ciclo POR CONTATO, não calendário global:** cada contato tem seus
  próprios horários/dias (`sendTimes`/`sendDays`) — janela fixa tipo "só
  segunda" nunca alcançaria quem não recebe às segundas. Estado em
  `ContactRecipient.lastBandInclude` (JSON — sem migration), preservado em
  edições do TMS pelo `sanitizeContacts` (mesmo princípio de `lastDigestDate`).
- **D4 — O throttle gruda na FAIXA, nunca no evento:** o filtro lê a
  severidade ATUAL do `AlertState` na montagem, e o sync atualiza severidade a
  cada ingest (`monitor.service.ts` upsert). DUE_SOON que agrava para OVERDUE
  no meio da semana sobe de faixa e sai no próximo digest.
- **D5 — Dono do CRITICAL é decidido pelo flag do imediato** (correção do gap):
  `MONITOR_IMMEDIATE_ALERTS=true` → imediato envia, digest exclui; standby
  (default) → digest INCLUI CRITICAL no topo (`monitor-flags.const.ts`).
- **D6 — Semana não gasta à toa:** o ciclo de uma faixa só é consumido quando
  a faixa teve alerta INCLUÍDO num WhatsApp efetivamente enviado; e-mail não
  consome ciclo. Tudo suprimido e sem e-mail → slot não é reivindicado.
- **D7 — Alerta só conta como notificado (arquivamento) se saiu em algum
  canal** — suprimido no WhatsApp de contato sem e-mail não entra no ciclo de
  `ARCHIVE_AFTER_NOTIFICATIONS`.

## Alternativas consideradas

- **A1 — Opt-in por regra na UI** (rejeitada): empurra 23 decisões pro
  cliente; "certificado vence em 45 dias" não precisa de decisão, precisa de
  frequência certa.
- **A2 — Filtrar no TMS** (rejeitada): o TMS não sabe o canal de cada contato;
  filtrar lá some o evento dos DOIS canais, inclusive do e-mail completo.
- **A3 — Calendário global (segunda/dia 1º, como o cron do TMS)** (rejeitada):
  quebra com horários/dias por contato — ver D3.

## Contrato

Nenhum campo novo no TMS↔Nexa: a severidade já viaja no evento do
`/monitor/ingest`. `lastBandInclude` é estado interno do Nexa dentro do JSON
de contatos, nunca enviado pelo TMS e preservado em qualquer PUT.
