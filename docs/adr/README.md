# Architecture Decision Records — Nexa

ADRs documentam decisões de arquitetura significativas: o que foi decidido, por quê,
e quais alternativas foram rejeitadas.

## Como criar um novo ADR

1. Copie o template (`docs/_templates/adr.md` ou o bloco abaixo)
2. Nomeie o arquivo `NNN-titulo-kebab-case.md` (próximo número em sequência)
3. Status inicial: `Proposto` → após aprovação: `Aceito`

## Índice

| # | Título | Status |
|---|--------|--------|
| [001](001-arquitetura-automacao.md) | Arquitetura de Automação (n8n + WAHA + Claude) | Aceito (implementado) |
| [002](002-frontend-stack.md) | Frontend Stack | Aceito (rev. 2026-06-09) |
| [003](003-arquitetura-agentes.md) | Arquitetura de Agentes | Aprovado (execução faseada) |
| [004](004-event-bus.md) | Event Bus (arquitetura orientada a eventos) | Aprovado (faseado) |
| [005](005-seguranca-permissoes.md) | Segurança e Permissões (RBAC, LGPD, Retenção) | Proposto |
| [006](006-knowledge-base.md) | Knowledge Base (versionada + RAG) | Proposto |
| [007](007-event-catalog.md) | Event Catalog (contrato dos eventos) | Aprovado |
| [008](008-integracao-billing-tms.md) | Integração com o Billing do HiperTMS | Aprovado |
| [009](009-leads-como-plataforma.md) | Sistema de Leads como Plataforma Independente | Aceito |
| [010](010-connector-architecture.md) | Arquitetura de Conectores (multi-produto) | Aprovado |
| [011](011-source-of-truth.md) | Source of Truth (dono de cada informação) | Aceito |
| [012](012-security-prompt-injection.md) | Segurança da IA & Prompt Injection | Aceito |
| [013](013-environment-strategy.md) | Environment Strategy (ambientes, branches, deploy) | Aceito |
| [014](014-design-system.md) | Design System: Inventário, Regras e Migração | Aceito |
| [015](015-arquitetura-suporte.md) | Arquitetura do Módulo de Suporte | Proposto |
| [016](016-classificacao-chamados.md) | Classificação de Chamados do Suporte | Proposto |
| [017](017-playbooks-diagnostico.md) | Playbooks de Diagnóstico Guiado | Proposto |
| [018](018-knowledge-base-suporte.md) | Knowledge Base do Suporte | Proposto |
| [019](019-ticket-intelligence.md) | Ticket Intelligence | Proposto |
| [020](020-enriquecimento-contato-tms.md) | Enriquecimento Automático de Contato via TMS | Proposto |
| [021](021-canal-email-leads.md) | Canal de Leads via E-mail | Proposto |
| [022](022-botao-tms-lia.md) | Botão "Falar com a Lia" no Site/App do HiperTMS | Proposto |
| [023](023-orquestrador-envio-unico.md) | Orquestrador de Envio Único e Roteamento TMS | Aceito |
| [024](024-campanhas-filtro-tms.md) | Campanhas e Filtro TMS | Aceito |
| [025](025-platform-admin-acting-as.md) | Platform Admin, Atuação Multi-tenant (acting-as) e Break-glass | Aceito |
| [026](026-suporte-pos-venda-prospect-cadastro.md) | Suporte é pós-venda: prospect é orientado a se cadastrar | Aceito |
| [027](027-web-chat-suporte-embutido.md) | Modalidade C — Web Chat de Suporte embutido (widget no HiperTMS) | Proposto |
| [028](028-monitor-proativo-tms.md) | Monitor Proativo TMS — alertas automáticos de pendências | Aceito (implementado) |
| [029](029-canal-status-whatsapp.md) | Canal WhatsApp Status — broadcast passivo em campanhas | Aceito (implementado) |
| [030](030-monitor-frota-whatsapp.md) | Monitor de Frota via WhatsApp — CNH, CRLV, manutenção por km/data | Aceito |
| [031](031-cotacao-whatsapp.md) | Cotação de Frete via WhatsApp — dois modos: público (prospect) e personalizado (cliente) | Aceito |
| [032](032-monitor-dual-channel-plan-gate.md) | Monitor Proativo — Dual-channel (email + WhatsApp) e gate por plano | Aceito (implementado) |
| [033](033-integrations-plan-sync.md) | IntegrationsModule — Sincronização de Planos TMS → Nexa | Aceito (implementado) |

> **Consolidação (2026-06-11):** a pasta legada `docs/architecture/decisions/`
> foi unificada aqui — `001-agents.md` → ADR 023, `002-campaigns.md` → ADR 024.
> `docs/adr/` é a **árvore canônica** de ADRs. (A pasta vazia residual pode ser
> removida pelo Git no host.)

---

## Template

```markdown
# ADR NNN — Título

- **Status**: Proposto | Aceito | Deprecado | Substituído por ADR NNN
-