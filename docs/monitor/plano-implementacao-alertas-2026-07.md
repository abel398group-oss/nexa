# Plano de implementação — Alertas em escala (SQUAD NEXA)

> **Para o agente/dev:** leia `REGRAS-SQUAD.md` antes de qualquer mudança.
> Base: `avaliacao-alertas-escala-2026-07.md` (mesmo diretório). Execute na
> ordem (A1 → A5), um commit por tarefa, checklist do REGRAS-SQUAD.md ao
> concluir cada uma. O TMS tem plano espelho que DEPENDE deste (a tela de
> Automação consome o shape novo) — receptor primeiro, emissor depois.

## A1 — Múltiplos destinatários por setor (G1)

`TenantNotificationConfig.sectorConfig` é JSON — evoluir o shape SEM migration:

```jsonc
// shape novo (retrocompatível)
{
  "fiscal": {
    "sendHour": 15, "sendMinute": 30, "sendDays": [1,2,3,4,5],
    "recipients": [
      { "label": "Abel",   "contact": "5511917747429",             "channel": "whatsapp" },
      { "label": "Abel",   "contact": "abel.ramos@hipervias.com.br","channel": "email" },
      { "label": "Fiscal 2","contact": "5511988887777",            "channel": "whatsapp" }
    ],
    // legado — continua aceito na LEITURA (prioridade menor que recipients)
    "phone": "5511917747429", "email": "abel.ramos@hipervias.com.br"
  }
}
```

1. `consolidation.service.ts#processPerSector`: resolver destinatários do setor
   como `recipients[]` se existir; senão cair no par `phone`/`email` legado.
   Enviar para TODOS os destinatários do canal correspondente.
2. `monitor-ingest.controller.ts` (`GET/PUT external-config`): aceitar e
   devolver o shape novo; PUT com shape legado continua funcionando (a tela
   antiga do TMS não pode quebrar — Regra 1 do REGRAS-SQUAD.md).
3. Validação: máx. 10 destinatários por setor; telefone normalizado
   (`normalizePhone`, ≥12 dígitos); e-mail validado.
4. Tela do Monitor no Nexa (`MonitorConfigPage`): lista de destinatários por
   setor (adicionar/remover), mantendo o layout atual.

**Aceite:** testes — shape novo, shape legado, misto, e PUT legado não apaga
`recipients` existentes.

## A2 — Todo envio passa pela abstração de canal (G2)

1. Ampliar `NotificationChannel`:
   `send(tenantId: string, to: string, message: string): Promise<{ sent: boolean; reason?: string }>`.
2. `WahaNotificationChannel` implementa o novo contrato (a resolução de phones
   do modo legado sai do channel e vai para quem chama — channel só ENVIA).
3. `monitor-notification.service.ts#notifyPhone`: remover `waha.sendText`
   direto; usar o channel injetado.
4. Grep final: nenhum `waha.sendText` fora de `WahaNotificationChannel` dentro
   do módulo monitor.

**Aceite:** testes existentes verdes + teste de que notifyPhone usa o channel
(mock). Comportamento externo idêntico.

## A3 — Retenção do notificationLog + token unificado (G6 + G5)

1. Janitor: expurgo de `notificationLog` com `NOTIFICATION_LOG_RETENTION_DAYS`
   (default 90), no bloco diário de purge (padrão A2 existente).
2. `ServiceTokenGuard`: aceitar `TMS_SERVICE_TOKEN` (atual) e, TEMPORARIAMENTE,
   `NEXA_SERVICE_TOKEN` como alias — se autenticar pelo alias, logar
   `warn('NEXA_SERVICE_TOKEN está deprecado — use TMS_SERVICE_TOKEN')`.
   Documentar a deprecação em `docs/api/api-contract.md`.

**Aceite:** teste do guard com os dois tokens + teste do purge.

## A4 — Fila de envio com retry e rate-limit (G4)

1. Adicionar fila BullMQ (`monitor-dispatch`) — Redis já existe no stack.
2. `consolidation` (tick de 5min) passa só a AGENDAR jobs
   (`{ tenantId, sector, recipient, message }`) com jitter de até 2min para
   espalhar horários populares; quem envia é o worker.
3. Worker: concorrência 5, retry 3x com backoff exponencial (30s/2min/10min),
   rate-limit configurável (`DISPATCH_MAX_PER_MINUTE`, default 30).
4. Falha após retries → `notificationLog` com erro + notificação interna ao
   admin da plataforma (padrão MON-006).
5. Idempotência: jobId determinístico `tenant:sector:recipient:data-hora` — o
   tick pode rodar 2x sem duplicar envio.

**Aceite:** testes do scheduler (agenda 1x por janela) e do worker (retry,
rate-limit). `pnpm build` + suíte verde.

## A5 — Esqueleto do canal Cloud API (G3 — fase 2, atrás de flag)

1. `whatsapp-cloud-channel.ts` implementando `NotificationChannel`:
   POST `graph.facebook.com/v20.0/{phoneNumberId}/messages` com **template**
   (`WA_CLOUD_TOKEN`, `WA_CLOUD_PHONE_ID`, `WA_CLOUD_TEMPLATE_DIGEST` nas envs).
2. Payload do digest vira template com variáveis: setor, quantidade de alertas
   e link do painel (o conteúdo completo fica no e-mail/painel — mensagem
   proativa na API oficial é template aprovado, não texto livre).
3. Seleção de canal por env `MONITOR_WA_PROVIDER=waha|cloud` (default `waha`).
   NADA muda em produção até a conta Meta + template estarem aprovados.
4. Documentar em `docs/monitor/` o que o Abel precisa providenciar: conta
   WhatsApp Business, número verificado, template submetido à Meta.

**Aceite:** testes unitários do channel (fetch mockado); com
`MONITOR_WA_PROVIDER=waha` o comportamento atual fica intocado.

## Regras transversais

- Shape legado de `sectorConfig` NUNCA quebra (tela velha do TMS no ar).
- Sem migration de banco em A1 (JSON); A4 não altera schema.
- Gates: build + testes antes de cada commit. Sem push sem autorização.
- Ao concluir A1: avisar o Abel para liberar o plano do TMS (tela).
