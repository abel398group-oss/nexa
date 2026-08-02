# Lia Vendas — pendências e achados (2026-08-01)

> Auditoria da base de conhecimento de VENDAS contra o código do `hipertms_v12`,
> antes do go-live de leads. A KB de vendas tinha **41 artigos** contra 228 da
> de suporte, e o TMS cresceu para **80 módulos** desde que ela foi escrita.

## 🔴 Corrigido nesta rodada — a Lia estava errando

### Limites de usuário estavam TODOS errados

| Plano | A Lia dizia | Real |
|---|---|---|
| Básico | 5 usuários | **1** |
| Essencial | 8 usuários | **5** |
| Profissional | 15 usuários | **10** |

Fonte: `apps/api/prisma/migrations/20260309110000_update_plans_limits/migration.sql`.
O Básico era o pior caso — vender "5 usuários" e entregar 1 gera cancelamento
na primeira semana.

### "Teste grátis" que não existe

A KB afirmava *"período de teste (trial) gratuito sem necessidade de cartão"*,
enquanto o prompt da Lia proíbe prometer teste grátis. Contradição no próprio
sistema. No TMS, `trialDays = 0` no plano Básico
(`20260430120000_plan_basic_and_modules_updates`).

**A regra real** (`apps/api/src/application/subscriptions/billing-schedule.ts:16-28`):
a assinatura entra **ATIVA**, e a primeira fatura vence **sempre no dia 15**,
**nunca em menos de 30 dias** da contratação. Se o dia 15 mais próximo estiver a
menos de 30 dias, pula para o mês seguinte.

| Entrou | 1ª fatura | Dias usando antes de pagar |
|---|---|---|
| 1º/ago | 15/set | 45 |
| 16/ago | 15/set | 30 |
| 20/ago | 15/out | 56 |

É um bom argumento comercial — mas **não é "grátis"**, e a Lia foi instruída a
dizer exatamente isso.

### Básico não tem Viagens

`"trips": false` na migration `20260430120000`. A descrição do plano no próprio
sistema diz: *"Viagens e roteirização avançada nos planos Essencial ou superior"*.
Lead que fala em roteirização precisa do Essencial no mínimo.

## ✅ Adicionado — módulos que a Lia desconhecia

| Tópico | Observação |
|---|---|
| GNRE | transmissão real aos autorizadores estaduais, com certificado |
| NFS-e | via Focus NFe (API intermediadora), configuração municipal |
| **CIOT** | ⚠️ **só registro manual** — geração automática depende do credenciamento IPEF (`ciot-operations.service.ts:47-51`). A Lia foi instruída a NUNCA prometer geração automática |
| Calculadora pública | piso mínimo ANTT, dedicado e fracionado — ótimo CTA para lead frio, não exige ser cliente |
| Pneus | controle por posição no veículo, montagem/desmontagem, alerta de vida útil |
| Manutenção | alerta automático por km OU por tempo (`maintenance-alert.service.ts:77-86`) |
| Combustível | média de consumo por veículo, preço médio, histórico de hodômetro |
| Diárias | adiantamento de motorista vinculado à viagem |
| Limites por plano | tabela completa como ferramenta de qualificação |

## ❓ Aguardando o Uelder

1. **Preços de Essencial, Profissional e Corporativo.** Só o Básico está
   confirmado em migration (R$89/mês, R$890/ano). Os outros (199/299/499) vêm do
   seed inicial e podem ter sido alterados direto no banco.
2. **O cliente precisa cadastrar cartão/pagamento para entrar?** A assinatura é
   criada no Asaas no ato do cadastro (boleto, PIX ou cartão), mas não ficou
   claro se o acesso é liberado antes disso. Muda a frase de venda: *"sem
   precisar de cartão"* é o argumento mais forte que existe em SaaS — e o pior
   se for mentira.
3. **Corporativo tem preço de tabela ou é sob consulta?** A descrição no banco
   diz "Sob consulta", mas o fallback do Nexa tem R$499.

## Fases seguintes (não feitas ainda)

- **Fase 2:** contratos (comerciais, prestador, fornecedor), compras/procurement
  detalhado, ANTT piso tarifário.
- **Fase 3:** oportunidades de venda, SDR, dashboard, equipes/tarefas,
  relatórios, chat interno, add-ons cobrados.

## Como validar

A KB de vendas é servida por `getKnowledge()` em
`apps/backend/src/application/connectors/hipertms.connector.ts` e reindexada a
cada boot pelo `KnowledgeBootstrapService`. Depois do deploy, perguntar à Lia
"vocês têm controle de pneu?" e "tem teste grátis?" — as duas respostas mudam.
