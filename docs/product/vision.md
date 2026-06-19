# Visão do Produto — Nexa

**Última atualização:** 2026-06-19 · **Fase atual:** 4 — Produção

## O que é

Nexa é uma plataforma SaaS multi-tenant de automação comercial e suporte B2B com IA.
O núcleo é a **Lia** — assistente de IA que opera via WhatsApp e e-mail para **vender** e
**suportar** o HiperTMS (e futuros produtos conectados).

Arquitetura: plataforma independente (não módulo do TMS). O HiperTMS é o 1º **conector**
— plugável por design (ADR 009/010).

## Problema que resolve

Para **transportadoras que usam ou vão usar o HiperTMS**:

- Time de vendas sobrecarregado com leads frios e perguntas repetitivas
- Leads que chegam fora do horário comercial sem atendimento
- Falta de qualificação antes de enviar para o vendedor humano
- Custo alto de SDR para prospecção em lote
- Clientes TMS existentes sendo abordados como prospects (desperdício)
- Suporte de nível 1 (dúvidas frequentes de CT-e, MDF-e, precificação) consumindo o time

## Princípios do produto

- **IA transparente**: a Lia nunca inventa — só responde com base na knowledge base aprovada
- **Kill switch**: autonomia pode ser desligada por canal (WhatsApp / e-mail) em runtime, sem parar o sistema
- **Fail-open**: se TMS ou IA estiver indisponível, o fluxo continua degradado — nunca quebra
- **Backend como autoridade**: a IA solicita; o backend valida identidade, tenant, perfil e executa
- **Multi-tenant**: cada empresa tem seu próprio contexto isolado (`tenantId` do contexto autenticado, nunca do lead)
- **Auditabilidade**: toda mensagem gerada pela IA é registrada com tokens, custo e status de supervisão

## Fluxo de vendas (principal)

1. Lead manda mensagem no WhatsApp (ou chega via e-mail)
2. Lia classifica a intenção (vendas ou suporte?) com confiança mínima de 0.60
3. Se vendas: Sales Agent consulta KB + planos do TMS → responde, qualifica, pontua (0-100)
4. Lead quente (score ≥ 70): abre oportunidade + notifica vendedor (round robin) + handoff
5. Follow-up automático se lead não responder (24h / 72h, máx 2 ciclos)
6. Supervisor IA audita saída antes de enviar (anti-alucinação, LGPD, tom)

## Fluxo de suporte

1. Cliente TMS identificado (via TMS Connector) manda mensagem
2. Support Agent faz RAG na KB aprovada + contexto do cliente no TMS
3. Resolve ou escala para humano (Diagnostic → Resolution → Escalation)
4. Cliente também pode abrir chamado pelo **Portal de Suporte** (web, sessão própria)
5. Operador acompanha pelo Inbox e assume quando necessário

## Estado atual (Fase 4)

| Capacidade | Estado |
|---|---|
| Multi-agent Lia (9 agentes especializados) | ✅ |
| RAG textual sobre KB aprovada | ✅ |
| Campanhas WhatsApp (lote, anti-ban) | ✅ |
| Portal de Suporte (web) | ✅ |
| Platform Admin (acting-as / break-glass) | ✅ |
| Conector HiperTMS (read-only + ações) | ✅ |
| Storybook (design system documentado) | ✅ |
| Deploy DigitalOcean | ⏳ Em andamento |
| Canal e-mail transacional | ❌ Planejado |
| Motor proativo (triggers por tempo/SLA) | ❌ Planejado |
| Analytics / Relatórios | ❌ Planejado |
| Embeddings pgvector (RAG vetorial) | ❌ Planejado |

## Roadmap de produto (próximas fases)

Ver `docs/IMPLEMENTATION_ROADMAP.md` e `docs/ANALISE_HIPERTMS_GAPS.md`.

Próximas entregas de maior impacto:
1. **Deploy DigitalOcean** — tornar a plataforma acessível a clientes reais
2. **Canal e-mail** — notificações de escalonamento + confirmação de ticket no portal
3. **Analytics básicos** — visibilidade da efetividade da Lia para o time
4. **Motor proativo** — Lia age proativamente (follow-up de SLA, digest diário)

## Produtos conectados

- **HiperTMS** (1º conector ativo): TMS para transportadoras. Fonte de verdade de billing, contratos e perfil do cliente.
- Arquitetura plugável suporta futuros conectores sem alterar o núcleo da plataforma.
