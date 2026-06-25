# Monitor Proativo TMS

> **Status:** Escopo aprovado — aguardando implementação  
> **Módulo:** Nexa (motor de alertas) + TMS (fonte de dados)  
> **Canal:** WhatsApp (WAHA → WhatsApp Business API) + E-mail

---

## O que é

O Monitor Proativo é um módulo do Nexa que observa continuamente o banco de dados do TMS em busca de situações que precisam de atenção — uma manutenção chegando, um CT-e não enviado, uma fatura vencida — e avisa o cliente antes que o problema vire prejuízo ou multa.

O aviso chega de forma consolidada (um resumo por dia, não uma mensagem por problema), respeitando horário comercial e o limite de custo por mensagem. Se o cliente resolver o problema, o sistema percebe e para de avisar. Se quiser adiar, responde pelo próprio WhatsApp e o sistema respeita.

---

## O que monitora

### 🔴 Fiscal
| Evento | Gatilho | Canal |
|--------|---------|-------|
| CT-e emitido sem retorno SEFAZ | Sem autorização após 2h | WhatsApp |
| CT-e rejeitado pelo SEFAZ | Imediato ao detectar rejeição | WhatsApp |
| MDF-e aberto sem encerramento | Viagem encerrada há +12h | WhatsApp |
| NF-e importada sem CT-e vinculado | Sem vínculo após 24h | Resumo diário |

### 🚛 Logística
| Evento | Gatilho | Canal |
|--------|---------|-------|
| Embarque com entrega atrasada | Data prevista ultrapassada | Resumo diário |
| Embarque sem motorista/veículo | Partida em menos de 24h | WhatsApp |
| Viagem sem encerramento | Iniciada há +X dias sem status | Resumo diário |
| Cotação aceita sem embarque gerado | Sem embarque após 24h | Resumo diário |

### 🔧 Frota
| Evento | Antecedência | Canal |
|--------|-------------|-------|
| Vencimento de CNH do motorista | 30d → semanal / 7d → diário | WhatsApp |
| Vencimento de CRLV/Licenciamento | 30d → semanal / 7d → diário | WhatsApp |
| Vencimento de seguro do veículo | 30d → semanal / 15d → diário | WhatsApp |
| Manutenção preventiva (km ou data) | 500km ou 7d antes | Resumo diário |
| Manutenção corretiva em aberto | Aberta há +3 dias | Resumo diário |
| Tacógrafo com calibração vencida | 30d antes | WhatsApp |

### 💰 Financeiro
| Evento | Gatilho | Canal |
|--------|---------|-------|
| Conta a pagar vencendo amanhã | D-1 | Resumo diário |
| Conta a pagar vencida em aberto | Diário enquanto aberta | Resumo diário |
| Fatura de cliente vencida | Diário enquanto aberta | Resumo diário |
| Aviso de fechamento contábil | Dia 28 de cada mês | E-mail |
| Resumo de faturamento do mês | Dia 1 do mês seguinte | E-mail |

---

## Frequência e canal de envio

| Tipo | Horário | Canal | Frequência máxima |
|------|---------|-------|------------------|
| Alertas críticos (CT-e rejeitado, CNH vencida) | Imediato (7h–18h) | WhatsApp | 1x por ocorrência |
| Resumo operacional diário | Todo dia às 7h | WhatsApp | 1x/dia |
| Relatório semanal | Segunda-feira às 7h | E-mail | 1x/semana |
| Fechamento contábil | Dia 28 + dia 1 | E-mail | 2x/mês |
| Silêncio noturno | 18h–7h + fins de semana | — | Nenhum envio |

**Regra de ouro:** máximo 1 mensagem WhatsApp por dia por empresa, consolidando todas as pendências em um único resumo. Alertas críticos são a única exceção — saem imediatamente, fora do resumo.


---

## Ciclo de vida de um alerta

```
DETECTADO → NOTIFICADO → AGUARDANDO → RESOLVIDO
                              ↓
                         SNOOZE (24h/48h)
                              ↓
                         ESCALADO (2ª notificação)
                              ↓
                         ARQUIVADO (sem resposta após prazo)
```

### Fluxo detalhado

**1. Detecção** — o monitor roda a cada intervalo configurado e identifica o evento no TMS.

**2. 1ª notificação** — envia resumo consolidado no horário configurado (7h por padrão).

**3. Aguardando resolução** — o sistema verifica se o problema foi resolvido no TMS. Se sim, fecha o alerta automaticamente. Sem novo aviso.

**4. 2ª notificação** — se o problema continuar aberto após o prazo (varia por categoria), envia um novo aviso com opções de resposta:
- *"1 - Já resolvi"* → fecha o alerta
- *"2 - Me lembra amanhã"* → snooze 24h
- *"3 - Não vou resolver agora"* → arquiva por 7 dias

**5. Arquivamento** — se não houver resposta após a 2ª notificação, o sistema arquiva o alerta e para de incomodar. Reabre no próximo ciclo semanal se ainda estiver pendente.

---

## Consulta on-demand via WhatsApp

Além dos avisos automáticos, o cliente pode perguntar à Lia a qualquer momento:

- *"Quais embarques estão pendentes?"*
- *"Tem manutenção chegando essa semana?"*
- *"Qual o status do CT-e da NF 1234?"*
- *"Resumo financeiro do mês"*

A Lia consulta o TMS via conector e responde na hora, sem precisar abrir o sistema.

---

## Configurações por tenant (admin da empresa)

O administrador da transportadora pode configurar pelo painel do Nexa:

| Configuração | Padrão | Opções |
|-------------|--------|--------|
| Horário de envio | 7h | 6h–10h |
| Enviar nos fins de semana | Não | Sim / Não |
| Canal preferido (resumo) | WhatsApp | WhatsApp / E-mail / Ambos |
| Categorias ativas | Todas | Fiscal / Logística / Frota / Financeiro |
| Limite de WhatsApp por dia | 1 msg | 1–3 msgs |
| Snooze padrão | 24h | 24h / 48h / 7 dias |

---

## Canal de envio — estratégia de migração

```
Fase 1 (piloto)   → WAHA (número pessoal, 2–3 clientes controlados)
Fase 2 (produção) → WhatsApp Business API via Z-API ou Twilio
```

O motor de alertas do Nexa é agnóstico ao canal: chama uma interface `NotificationChannel` que hoje implementa WAHA e amanhã implementa a API oficial sem alterar nada no restante do módulo.

---

## Tabelas necessárias (Prisma — Nexa)

```
monitor_rules          → regras ativas por tenant (categoria, threshold, frequência)
alert_state            → estado atual de cada alerta (detectado, notificado, resolvido...)
notification_log       → histórico de envios (canal, horário, conteúdo, status entrega)
tenant_notification_config → preferências do tenant (horário, canal, categorias ativas)
```

---

## Status de implementação

| # | Item | Status |
|---|------|--------|
| 1 | Criar tabelas Prisma no Nexa | ✅ Migration `20260625000000_monitor_proativo` |
| 2 | Serviço de polling TMS (cron a cada 30 min) | ✅ `MonitorService` em `application/monitor/` |
| 3 | Motor de regras e avaliação de thresholds | ✅ Filtro por categoria em `MonitorService.syncAlertStates()` |
| 4 | Serviço de consolidação e deduplicação | ✅ `ConsolidationService` — resumo diário com dedup por hora |
| 5 | Integração com WAHA (fase piloto) | ✅ `WahaNotificationChannel` — usa `ALERT_ADMIN_PHONE` (Fase 1) |
| 6 | Interface de configuração no painel (tenant admin) | ✅ `MonitorConfigPage` em `/settings/monitor` |
| 7 | Endpoints de consulta on-demand para a Lia | ⏳ Fase 2 — depende do TMS expor endpoint de query |
| 8 | Campo `whatsappPhone` por tenant (envio p/ número próprio) | ⏳ Fase 2 — hoje usa `ALERT_ADMIN_PHONE` global |
| 9 | Migração para WhatsApp Business API | ⏳ Fase 2 |
| 10 | Geração de relatório PDF mensal por e-mail | ⏳ Fase 2 |

### Para ativar em produção

1. Rodar a migration no banco: `pnpm db:migrate` (Abel)
2. Adicionar `MONITOR_ENABLED=true` no `.env` do droplet
3. Confirmar que `ALERT_ADMIN_PHONE` está configurado (já está)

---

## ADR relacionado

> A ser criado: `docs/adr/ADR-028-monitor-proativo-tms.md`

