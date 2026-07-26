# Cobertura da KB de suporte da Lia × TMS (2026-07-22)

> Mapa da base de conhecimento da Lia suporte contra os módulos reais do
> HiperTMS, pra guiar a atualização por fases. Fonte: análise do código-fonte
> do `hipertms_v12` (apps/api/src/application) × `hipertms-suporte-kb.data.ts`
> (204 artigos) e `hipertms-manuais.data.ts`.
>
> Contexto: os manuais do TMS (`docs/manuais tecnicos`) são de **07/07** — com
> as mudanças recentes, estão defasados; por isso a fonte de verdade é o CÓDIGO.

## Como a Lia suporte aprende (pipeline)

`hipertms-suporte-kb.data.ts` + `hipertms-manuais.data.ts` + `hipertms-help-urls.data.ts`
→ `importFromConnector` → tabela `ai_knowledge_base` → reindex (embeddings pgvector)
→ RAG na Lia suporte. O `KnowledgeBootstrapService` reimporta+reindexa a cada
boot (idempotente). **Atualizar a KB = editar esses arquivos**; o resto é automático.

## Mapa de cobertura por domínio

Legenda: 🟢 boa · 🟡 rasa (ampliar) · 🔴 buraco (prioridade)

| Domínio | Módulos no TMS | KB hoje (artigos) | Gap |
|---|---|---|---|
| **Fiscal** | fiscal-ct-emissions, mdfe-emissions, sefaz, gnre, nfse, **ciot**, tenant-certificates, config, reports, utils (10) | cte-rejeicao 10, operacao-cte 7, operacao-mdfe 7, gnre 3, nfse 2, cte-cancelamento 2, mdfe-problemas 2, certificado 3 (~36) | 🟡 CT-e/MDF-e bom; **CIOT, NFS-e, GNRE rasos** |
| **Precificação** | pricing, pricing-core, imports, markup, tables, **tariff-engine**, taxation, tenant-config (8) | precificacao-erros 9 | 🔴 8 módulos complexos × 9 artigos |
| **ANTT / piso tarifário** | antt-floor (novo) | 3 menções, 0 nos manuais | 🔴 sem cobertura |
| **Financeiro** | finance-accounts, bank-accounts, categories, invoices, sales-invoices, reports (6) | financeiro-problemas 13, faturas 5, contas 2, relatorios-fin 4 (~24) | 🟢 (bank-accounts/categories a checar) |
| **Frota** | fleet-vehicles, drivers, maintenances, maintenance-alerts, tires, fuel-records, fuel-average-prices, vehicle-consumption, vehicle-fuel-balance, odometer-history, driver-allowances, assignment-sync (13) | frota-problemas 10, abastecimento 3, veiculos 2, relatorios-frota 2 (~17) | 🟡 **pneus, adiantamentos, consumo, saldo de combustível rasos** |
| **Logística** | shipments, trips, quotes, cargo-schedule, carrier-service-order, customer-xml, reports (7) | vendas-embarques 6, cotacoes 5, viagens 5, cargas 4, embarques-prob 2, relatorios-log 2 (~24) | 🟢 (customer-xml, carrier-service-order a checar) |
| **Contratos** | commercial-contracts, supplier-contracts, service-provider-contracts (3) | ~3 menções soltas | 🔴 sem cobertura real |
| **Compras** | procurement + purchase-orders (web) | compras-estoque 4, pedidos 2, problemas 2 (~8) | 🟡 ampliar (setor novo no Monitor) |
| **Equipes** | teams, teams-activities, teams-tasks | times 3, tarefas 3, notificacoes 2 (~8) | 🟢 |
| **Admin / Assinatura** | admin, platform, rbac, subscriptions, addons, plans, plan-limits, users, tenant, company | administracao-* + 22 menções de assinatura | 🟢 |
| **Cadastros** | company, directory, external-data | cadastros-empresas 4, cadastro-problemas 4 (~8) | 🟢 |

## Plano por fases (ordem sugerida por dor de suporte)

1. **Fiscal** — completar CIOT, NFS-e, GNRE (CT-e/MDF-e já ok). Onde suporte mais concentra.
2. **Precificação + ANTT** — o maior buraco (🔴🔴). Motor tarifário, taxação, markup, piso ANTT.
3. **Frota** — pneus, adiantamentos, consumo, saldo de combustível.
4. **Contratos** — comercial, fornecedor, prestador (🔴, do zero).
5. **Compras** — ampliar (setor novo).
6. **Logística / Financeiro** — tapar buracos pontuais (customer-xml, bank-accounts).

Cada fase: ler os módulos do domínio no TMS a fundo → escrever/atualizar artigos
em `suporte-kb` (troubleshooting) + `manuais` (como usar) → Abel revisa → boot
reimporta e reindexa. Sem migration, sem mudança de contrato — só dados de KB.

## Fora de escopo da KB de suporte

Módulos de integração/infra (sdr, proactivity, lia-support, nexa-external,
sequences, upload, mail, notifications, health, dashboard) não são
troubleshooting de usuário — não entram na KB da Lia.
