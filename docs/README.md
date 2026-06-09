# Documentação — Nexa

Plataforma de automação comercial B2B com IA (Lia) para o HiperTMS.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `product/` | Visão, roadmap e estratégia de produto |
| `domain/` | Glossário e linguagem ubíqua do projeto |
| `features/` | PRDs de cada módulo do sistema |
| `architecture/` | Decisões técnicas (ADRs) e visão de sistema |
| `api/` | Contratos e padrões de API |
| `infra/` | Deploy, CI/CD e ambiente |

## Módulos documentados

- [Agentes de IA](features/agents/prd.md) — Lia (vendas + suporte), roteador, supervisora
- [Campanhas](features/campaigns/prd.md) — Disparos em lote via WhatsApp
- [Contatos](features/contacts/prd.md) — CRM leve de leads
- [Inbox](features/inbox/prd.md) — Conversas WhatsApp e atendimento humano
- [Knowledge Base](features/knowledge/prd.md) — Base de conhecimento RAG da Lia
- [Conectores](features/connectors/prd.md) — Integração com produtos (HiperTMS)
