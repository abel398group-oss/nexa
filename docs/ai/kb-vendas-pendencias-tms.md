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

## Fase 2 — contratos, compras e ANTT ✅

| Tópico | Observação |
|---|---|
| Contrato comercial por cliente | tabela/taxa/markup próprios, aplicados automaticamente; validado contra a empresa antes de aplicar |
| Contratos de fornecedor e prestador | agregado/terceiro/autônomo com vigência — custo do terceiro entra na apuração da viagem |
| **Piso ANTT na contratação** | Resolução 2.501/2025, fórmula `(d × CCD) + CC` + retorno vazio. Compara com o pago ao terceiro e **alerta sem bloquear** (`antt-floor.service.ts:38-43`). Argumento de RISCO, não de eficiência |
| Compras e estoque | importação por XML da nota do fornecedor, movimentações, export CSV |

⚠️ O piso ANTT é para **contratar terceiro** — não confundir com precificação de
venda, que tem markup e tabela comercial próprios. O código é explícito sobre
essa separação e a Lia foi instruída nela.

## Fase 3 — comercial e gestão ✅

| Tópico | Observação |
|---|---|
| Funil de vendas + playbook SDR | ADR 049; oportunidades com etapas e passos, geo-enriquecimento das empresas. **A transportadora não precisa de CRM separado** |
| Dashboard operacional | contagens por estado, panorama de frota, séries temporais — argumento para o DONO, que decide a compra |
| Tarefas, atividades e chat interno | tira a coordenação do grupo de WhatsApp |
| Relatórios | avançados só a partir do **Essencial** |
| Add-ons | armazenamento extra e números adicionais do Monitor. Lia instruída a **não informar preço** (não estão no catálogo dinâmico) |

## Resultado

**41 → 60 artigos** de vendas.

## Ainda não coberto (backlog frio)

Asaas/pagamentos (detalhe interno, pouco relevante em venda), RBAC/permissões,
sequences, upload, platform/admin, health. Nenhum desses aparece em conversa com
lead — só entram se algum lead perguntar.

## ⚠️ Armadilha: NUNCA renomear o título de um artigo da KB

`importFromConnector` casa artigo por **TÍTULO** (`knowledge.service.ts:233`).
Consequências:

- mudar o `content` mantendo o título → **atualiza** o artigo e refaz o embedding ✅
- mudar o **título** → cria um artigo NOVO e deixa o antigo **vivo no banco** ❌

E **nada apaga** artigo que sumiu do conector — a exclusão só existe manual, pela
tela. Ou seja: um artigo com informação errada renomeado continua recuperável
pela Lia para sempre.

Aconteceu na primeira versão desta correção: o artigo `Trial e forma de
pagamento` foi renomeado para `Primeira cobrança — NÃO existe teste grátis`, o
que teria deixado o texto do "trial gratuito" ativo no banco. O título foi
restaurado e o aviso ficou no código, junto do artigo.

**Melhoria futura (não feita):** limpar da base os artigos importados que não
existem mais no conector. Exige distinguir artigo do conector de artigo escrito
à mão no painel — senão apaga o conteúdo do usuário.

## Como validar

A KB de vendas é servida por `getKnowledge()` em
`apps/backend/src/application/connectors/hipertms.connector.ts` e reindexada a
cada boot pelo `KnowledgeBootstrapService`. Depois do deploy, perguntar à Lia
"vocês têm controle de pneu?" e "tem teste grátis?" — as duas respostas mudam.
