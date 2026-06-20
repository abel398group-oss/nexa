# Monitor Proativo TMS — Índice de Implementação

> **Status:** Pronto para implementar  
> **Referência:** `docs/product/monitor-proativo.md`

## O que é

Motor que observa o banco do TMS, detecta situações críticas (CT-e sem SEFAZ, CNH vencendo, embarque atrasado, conta a vencer) e avisa o cliente via WhatsApp e e-mail de forma consolidada — 1 mensagem por dia, sem spam. O cliente também pode consultar a Lia on-demand pelo WhatsApp.

## Arquitetura

```
TMS (fonte de dados)
  └── expõe endpoints de leitura por categoria
        ↓
Nexa — MonitorService (cron a cada 30min)
  └── avalia regras → gera AlertState
        ↓
  ConsolidationService → 1 resumo por tenant/dia
        ↓
  NotificationService → WAHA (WhatsApp) ou SMTP (e-mail)
        ↓
TMS — página nativa exibe alertas recebidos via API
```

## Squads e arquivos

| Squad | Arquivo | Responsabilidade |
|-------|---------|-----------------|
| Orquestra Nexa | `squad-orquestra-nexa.md` | Motor de alertas, tabelas, serviços, config UI |
| Orquestra TMS | `squad-orquestra-tms.md` | Endpoints de dados, receptor de alertas, página nativa |
| Orquestra Nexa support IA | `squad-orquestra-nexa-ia.md` | Intents on-demand da Lia via WhatsApp |

## Ordem de execução

1. **Orquestra TMS** cria os endpoints de leitura (o Nexa precisa deles para monitorar)
2. **Orquestra Nexa** implementa o motor, tabelas e serviços
3. **Orquestra Nexa support IA** adiciona os intents on-demand na Lia
4. **Orquestra TMS** cria a página nativa que exibe os alertas
5. Teste integrado com 1 tenant piloto
