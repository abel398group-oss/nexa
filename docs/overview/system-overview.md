# System Overview — Hipervias Leads (Automação Comercial via WhatsApp)

> Documento de visão geral do sistema. Descreve o propósito, arquitetura, componentes,
> fluxos principais e integrações. Segue o padrão de documentação do HiperTMS v12.

> **⚠️ Este documento descreve o MVP n8n em produção (sistema 1 de 2).** Há uma nova
> plataforma (NestJS + React + Prisma) em construção em paralelo, ainda no Sprint 1 —
> ver `README.md` (raiz) e `docs/SPRINT_PLAN.md`. **Não desligar este MVP** até a nova
> plataforma cobrir as mesmas funções (conversas, IA, distribuição de leads).

**Status:** MVP funcional (pré-produção)
**Última atualização:** 2026-06

---

## 1. Propósito

Plataforma de **automação de vendas e atendimento B2B via WhatsApp** para a Hipervias.
O sistema capta leads, classifica intenção com IA, responde automaticamente, distribui
leads quentes para vendedores, faz follow-up automático e monitora a qualidade do próprio
atendimento.

O objetivo é **escalar a prospecção comercial** mantendo um atendimento humano, cordial e
contextualizado, sem depender de um time grande de SDRs.

---

## 2. Visão geral

O sistema é construído sobre uma **camada de orquestração (n8n)** que conecta:

- **WhatsApp** (via WAHA) — canal de entrada e saída
- **IA (Claude Haiku)** — classificação de intenção e geração de respostas
- **PostgreSQL** — persistência de leads, conversas, campanhas e métricas

Não é "um robô de WhatsApp" — é uma **plataforma de automação comercial** com:
qualificação por score, distribuição de leads, follow-up, observabilidade de qualidade
e controle de saúde dos números de envio.

---

## 3. Componentes principais

### Orquestração (n8n)

- **n8n 1.123.49** em **modo fila** (main + worker + Redis)
- 4 workflows independentes (ver `docs/prd/workflows.md`)
- Persistência de workflows e execuções no PostgreSQL

### Gateway WhatsApp (WAHA)

- WAHA self-hosted (`http://waha:3000`)
- Engine GOWS
- Webhook de entrada → n8n
- API de envio (`POST /api/sendText`)

### IA (Anthropic Claude)

- Modelo: `claude-haiku-4-5-20251001`
- Usos:
  1. **Classificação + resposta** ao lead (workflow Inbound)
  2. **Auditoria de qualidade** das conversas (workflow Supervisor)
- Base de conhecimento dinâmica injetada no prompt (tabela `ai_knowledge_base`)

### Banco de dados (PostgreSQL 16)

- Banco principal do projeto
- Compartilhado com o n8n (tabelas próprias separadas das tabelas internas do n8n)

### Cache / Fila (Redis)

- Suporta o modo fila do n8n (execução distribuída via worker)

---

## 4. Arquitetura em alto nível

```
                  ┌──────────────┐
   Lead WhatsApp  │     WAHA     │  envio/recebimento
        ⇅         └──────┬───────┘
                         │ webhook / API
                  ┌──────┴───────┐
                  │     n8n      │  orquestração (4 workflows)
                  │  main+worker │
                  └──┬────────┬──┘
            ┌────────┘        └────────┐
     ┌──────┴──────┐          ┌────────┴────────┐
     │ Claude API  │          │   PostgreSQL    │
     │ (Anthropic) │          │ (leads, convos, │
     └─────────────┘          │  métricas)      │
                              └─────────────────┘
```

---

## 5. Workflows (resumo)

| Workflow | Gatilho | Função |
|---|---|---|
| **WA Leads - Inbound** | Webhook (ativo 24h) | Recebe, classifica e responde mensagens com IA |
| **WA Leads - Sender** | Manual | Dispara campanhas com personalização e limites |
| **WA Leads - Follow Up** | Manual (agendamento futuro) | Recontata leads sem resposta (24h/72h) |
| **WA Supervisor - IA** | Manual (agendamento futuro) | Audita qualidade das conversas com 2ª IA |

Detalhe completo em `docs/prd/workflows.md`.

---

## 6. Fluxos core de negócio

### 6.1 Inbound (lead manda mensagem)

```
Webhook → Normaliza (extrai telefone, detecta mídia/opt-out)
  → Se mídia → pede texto
  → Se válido → rate limit (anti-spam)
  → registra interação → busca conhecimento + histórico
  → Claude classifica intenção + gera resposta
  → salva classificação
  → Se opt-out → registra e bloqueia
  → Senão → qualifica lead → delay humano → responde
            → se score >= 70 → cria oportunidade
            → distribui vendedor (round robin) → notifica
```

### 6.2 Outbound (campanha)

```
Trigger manual → horário comercial (7h-19h)
  → reset contador diário → busca contatos (respeitando cota do number_pool)
  → loop: log → personaliza msg (nome + saudação por horário)
          → delay randômico → envia → incrementa contador
```

### 6.3 Follow-up

```
Trigger → busca quem recebeu mas não respondeu (24h / 72h)
  → envia mensagem de recontato → registra
```

### 6.4 Supervisor (auditoria)

```
Trigger → busca conversas do dia
  → Claude analisa cada conversa (nota, repetição, confusão, sugestão)
  → salva auditoria em ai_quality_audits
```

---

## 7. Integrações externas

| Sistema | Propósito |
|---|---|
| **WAHA** | Gateway WhatsApp (envio/recebimento) |
| **Anthropic Claude API** | Classificação de intenção, geração de resposta, auditoria |

---

## 8. Diferenciais do sistema

- **IA Supervisora**: uma 2ª IA audita o atendimento da 1ª (qualidade automática)
- **Monitoramento interno de reclamações**: detecta e categoriza reclamações sem o cliente saber
- **Controle de saúde dos números** (`number_pool`): limite diário/horário, aquecimento, proteção contra bloqueio
- **Tratamento de casos reais**: mídia (áudio/foto), formato `@lid` do WhatsApp novo, ofensas, saudação por horário
- **Follow-up automático** em 2 níveis
- **Round robin** de vendedores com dedup de notificação

---

## 9. Pendências conhecidas (pré-produção)

- API keys ainda hardcoded → migrar para variáveis de ambiente
- HTTPS + autenticação do n8n
- Firewall / hardening do servidor (Digital Ocean)
- Backup automático do PostgreSQL
- Agendamento automático de Follow-up e Supervisor (criar via UI do n8n)
- Reconhecimento de áudio (Whisper) — planejado
- Frontend / dashboard — planejado (queries prontas)

---

## 10. Documentos relacionados

- `docs/adr/` — decisões técnicas (arquitetura, banco, frontend)
- `docs/prd/` — especificação das features
- `docs/prd/workflows.md` — detalhe dos 4 workflows
- `docs/overview/database-schema.md` — modelo de dados
