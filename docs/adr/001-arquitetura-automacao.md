# ADR 001 — Arquitetura de Automação (n8n + WAHA + Claude)

**Status:** Aceito (implementado) · **Data:** 2026-06

---

## Contexto

Precisamos automatizar prospecção e atendimento B2B via WhatsApp, com classificação
de intenção por IA, em um custo e prazo viáveis, sem construir tudo do zero.

## Decisão

Adotar **n8n como camada de orquestração**, conectando:
- **WAHA** (gateway WhatsApp self-hosted)
- **Claude Haiku** (IA de classificação e resposta)
- **PostgreSQL** (persistência)
- **Redis** (fila, modo distribuído do n8n)

### D1 — Orquestração via n8n
- Workflows visuais, rápidos de iterar
- Modo fila (main + worker + Redis) desde o início, preparado para escala
- 4 workflows independentes (Inbound, Sender, Follow-up, Supervisor)

### D2 — WhatsApp via WAHA (self-hosted)
- Custo zero de API oficial no MVP
- Trade-off: risco de instabilidade/bloqueio de sessão
- Mitigação: `number_pool` (saúde dos números) + aquecimento + limites
- Evolução futura: API oficial da Meta quando o volume justificar

### D3 — IA via Claude Haiku
- Modelo barato e rápido para classificação em tempo real
- Mesma API reusada para a IA Supervisora (auditoria)
- Base de conhecimento injetada no prompt (sem fine-tuning)

### D4 — Workflows separados (não um fluxo gigante)
- Inbound, Sender, Follow-up e Supervisor são independentes
- Facilita manutenção, teste e evolução isolada
- Padrão alinhado ao HiperTMS (separação por responsabilidade)

## Consequências

**Positivas**
- Time-to-market rápido
- Fácil de iterar e auditar
- Arquitetura preparada para escala (fila)

**Negativas / riscos**
- WAHA self-hosted é o principal ponto de instabilidade
- Gatilhos de horário precisam ser criados pela UI do n8n (não via banco)
- API keys hardcoded hoje (resolver antes de produção)

## Alternativas consideradas

- **Plataformas prontas** (ManyChat, RD): menos customização, custo recorrente alto, lógica B2B rasa
- **Código próprio do zero**: prazo e custo muito maiores
- **API oficial Meta desde já**: cara e burocrática para o MVP
