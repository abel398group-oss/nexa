# ADR 028 — Monitor Proativo TMS

- **Status:** Proposto
- **Data:** 2026-06-20
- **Autores:** Time Nexa

---

## Contexto

O HiperTMS acumula eventos críticos que o cliente precisa acompanhar: CT-e sem retorno SEFAZ, CNH vencendo, embarques atrasados, contas a vencer. Hoje o cliente descobre esses problemas de forma reativa — abrindo o sistema ou quando o problema já virou prejuízo.

O Nexa já tem infraestrutura de comunicação (WAHA + e-mail) e o conector TMS para leitura de dados. A questão é: onde vive o motor de monitoramento e como ele se integra ao TMS e ao cliente?

---

## Decisão

O motor de monitoramento vive no **Nexa**, não no TMS. O TMS expõe endpoints de leitura por categoria (fiscal, logística, frota, financeiro). O Nexa roda um cron a cada 30 minutos, avalia regras, mantém o estado de cada alerta e envia notificações consolidadas via WhatsApp ou e-mail.

O TMS exibe os alertas em uma **página nativa** alimentada pelo Nexa via API — o usuário não precisa sair do sistema que já usa.

A Lia responde consultas on-demand pelo WhatsApp ("quais embarques estão atrasados?") usando o mesmo conector TMS.

---

## Alternativas consideradas

### Alternativa 1 — Motor dentro do TMS
Implementar o cron e as notificações diretamente no TMS.

**Rejeitada porque:** o TMS é um sistema de registro crítico, estável. Adicionar cron jobs de IA e integração com WhatsApp aumenta o risco operacional e cria dependência entre sistemas de naturezas diferentes. Deploy e manutenção tornam-se acoplados.

### Alternativa 2 — Serviço independente (terceiro sistema)
Criar um microserviço separado do Nexa e do TMS só para o monitor.

**Rejeitada porque:** o Nexa já tem toda a infraestrutura necessária (WAHA, SMTP, Redis, conector TMS, multi-tenant). Criar um terceiro sistema seria over-engineering sem ganho real neste estágio.

### Alternativa 3 — Polling client-side (browser)
O frontend do TMS faz polling e dispara notificações browser-based.

**Rejeitada porque:** não funciona quando o usuário está fora do sistema. O valor do monitor é avisar mesmo quando o sistema está fechado.

---

## Consequências

**Positivas:**
- TMS permanece estável e isolado de lógica de IA
- Nexa centraliza toda comunicação com o cliente (WhatsApp, e-mail, monitor)
- Canal de notificação é trocável (WAHA → API WhatsApp) sem alterar o motor
- Página nativa no TMS mantém UX consistente para o usuário

**Negativas / trade-offs:**
- Latência de rede entre Nexa e TMS (mitigada: dados não são em tempo real, 30min é aceitável)
- Dois sistemas para manter em sync (mitigado pelo `SERVICE_TOKEN` simples)
- TMS precisa expor endpoints de leitura novos (custo de implementação único)

---

## Implementação

Ver documentação completa em `docs/monitor/`:
- `README.md` — visão geral e ordem de execução
- `squad-orquestra-nexa.md` — motor, tabelas Prisma, serviços, config UI
- `squad-orquestra-tms.md` — endpoints de dados, receptor, página nativa
- `squad-orquestra-nexa-ia.md` — intents on-demand da Lia

---

## Canal de notificação — estratégia de migração

```
Fase 1 (piloto)   → WAHA (2-3 clientes controlados)
Fase 2 (produção) → WhatsApp Business API (Z-API ou Twilio)
```

O `NotificationService` implementa uma interface agnóstica ao canal, permitindo a troca sem alterar o motor de alertas.
