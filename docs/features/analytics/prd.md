# PRD — Analytics & Relatórios (Nexa)

- **Status**: Planejado
- **Data**: 2026-06-19
- **Referência TMS**: `docs/design-system/Design Master/relatorios-catalog.md`

## Contexto

O Nexa processa conversas, dispara campanhas e classifica tickets — mas não tem
nenhum analytics documentado ou implementado. O time não enxerga a efetividade
da Lia, o funil de suporte nem o resultado das campanhas.

O HiperTMS tem 35+ relatórios catalogados (proativos e on-demand). Para o Nexa,
adaptamos o conceito ao domínio de IA comercial e suporte.

Princípio: relatórios proativos são **curtos** (sujeito + contagem + ação),
chegam no horário certo e têm link de ação direto.

## Objetivo

Dar visibilidade ao operador, ao gestor e ao admin da plataforma sobre:
- Efetividade da Lia (% resolvido por IA vs humano)
- Saúde das campanhas (entregues, respondidos, convertidos)
- Funil de suporte (abertura → resolução)
- Leads qualificados e oportunidades

## Usuários

| Perfil | O que precisa ver |
|---|---|
| Operador | Conversas abertas, tickets sem resposta, próxima ação |
| Gestor | KPIs diários, efetividade da Lia, SLA |
| Vendedor | Leads na carteira, conversão, KPI pessoal |
| Admin plataforma | Uso por tenant, custo de IA, volume |

## Relatórios proativos (enviados automaticamente)

| # | Nome | Canal | Frequência | Destinatário |
|---|---|---|---|---|
| N1 | **Digest de Tickets Pendentes** | In-app + e-mail | Diário (manhã) | Gestor |
| N2 | **Conversas Escalonadas Não Atendidas** | In-app (urgente) | Tempo real | Operador |
| N3 | **SLA em Risco** | In-app | Diário (manhã) | Gestor |
| N4 | **Resumo Semanal de Campanhas** | E-mail | Semanal (segunda) | Gestor |
| N5 | **Leads Quentes Sem Seguimento** | In-app | Diário (manhã) | Vendedor |

Formato padrão de relatório proativo: `[Sujeito]: N itens — [Ação]`
Ex.: "Tickets sem resposta: 7 conversas — Ver inbox"

## Relatórios on-demand (acessados no painel)

| # | Nome | Métricas-chave |
|---|---|---|
| A1 | **Taxa de Resolução IA vs Humano** | % resolvida automaticamente, % escalonada, p50/p95 |
| A2 | **Efetividade de Campanhas** | Entregues, respondidos, convertidos, opt-out por campanha |
| A3 | **Funil de Suporte** | Abertura → classificação → diagnóstico → resolução → fechamento |
| A4 | **Tempo Médio de Atendimento** | Por categoria, por prioridade, p50/p95 |
| A5 | **Volume de Conversas por Canal** | WhatsApp vs web-chat vs portal |
| A6 | **Confiança da IA por Categoria** | % high/low confidence; rotas de escalação |
| A7 | **Tickets Recorrentes** | Mesmo problema aberto múltiplas vezes pelo mesmo contato |
| A8 | **Custo de IA por Tenant** | Tokens consumidos, custo US$, tendência mensal |
| A9 | **KPI de Vendedores** | Leads, em andamento, ganhos, perdidos, % conversão |

## Implementação sugerida

### Fase 1 — Dashboard enriquecido (menor esforço)

Expandir o `DashboardPage` existente com os KPIs A1–A3 e A9 via queries diretas
ao banco. O backend já tem os dados (`AiMessage`, `AiConversation`, `Campaign`,
`CampaignTarget`, `Seller`).

```
GET /api/metrics/summary          → KPIs gerais (já existe parcialmente)
GET /api/metrics/resolution       → taxa IA vs humano (novo)
GET /api/metrics/campaigns/:id    → efetividade por campanha (novo)
GET /api/metrics/sellers          → KPI por vendedor (já existe)
GET /api/metrics/support-funnel   → funil de suporte (novo)
```

### Fase 2 — Relatórios proativos

Depende do **Motor Proativo** (ver `features/proactive-engine/prd.md`).
Os relatórios N1/N3/N5 são acionados pelo motor via `NotificationsService`.
N4 depende do **Canal E-mail** (`features/canal-email/prd.md`).

### Fase 3 — Tela de Relatórios

Página `/reports` com seletor de relatório, filtro de período e exportação CSV.

## Critérios de aceite (Fase 1)

- [ ] Dashboard mostra taxa IA vs Humano (%) nos últimos 7 dias
- [ ] Dashboard mostra efetividade da última campanha (entregues/respondidos/convertidos)
- [ ] Tela de Vendedores mostra KPI individual por período
- [ ] Todos os endpoints protegidos por `@RequirePerm('metrics')`
- [ ] Dados de um tenant não aparecem para outro (isolamento multi-tenant)

## Relacionados

- `docs/ANALISE_HIPERTMS_GAPS.md` §3 (catálogo de referência do TMS)
- `docs/features/proactive-engine/prd.md` (relatórios proativos)
- `application/metrics/` · `presentation/http/metrics/`
