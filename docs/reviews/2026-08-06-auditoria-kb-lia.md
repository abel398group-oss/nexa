# Auditoria — Base de Conhecimento e Diagnóstico da Lia (HiperTMS)

**Data:** 2026-08-06 · **Escopo:** cobertura de conhecimento, playbooks
determinísticos e capacidade de diagnóstico em tempo real da Lia no suporte
ao HiperTMS.
**Método:** leitura direta do código (`KnowledgeService`, os dois arquivos
de KB, `case-classifier-agent`, `support-playbooks.const.ts`,
`DiagnosticAgentService`, `hipertms.connector.ts`, `ResolutionAgentService`).
Tudo abaixo é conferido em código real, com `arquivo:linha`.

> **Achado crítico primeiro** (seção 0) — é um bug de produção real, não uma
> lacuna de conteúdo. As demais seções são o raio-X pedido.

---

## 0. Achado crítico: artigo de IA não aprovado já fica visível ao cliente

`TicketIntelligenceService` gera rascunhos de KB a partir de tickets
escalados-e-fechados a cada 30 min (ver relatório de 06/08, seção 1.6). O
comentário no próprio código diz a intenção: **"Cria o artigo como
rascunho — não aprovado, passa pela curadoria humana"**
(`ticket-intelligence.service.ts:374`).

Só que:

- `KnowledgeService.create(tenantId, dto, author, autoApprove=false)`
  (`knowledge.service.ts:219-238`) grava `content` **direto na linha viva**
  de `AiKnowledgeBase` (linha 227), independente do `autoApprove`. O
  `approved` só existe na tabela de versionamento (`AiKnowledgeVersion`).
- `KnowledgeService.retrieve()` — tanto a busca semântica (pgvector) quanto
  o fallback textual — consulta `AiKnowledgeBase` diretamente e **nunca
  filtra por `AiKnowledgeVersion.approved`**.

**Resultado prático:** um artigo escrito pela IA a partir de UM ticket
resolvido por humano, sem qualquer revisão, pode ser recuperado por
`ResolutionAgentService.resolve()` e citado como "Fonte KB" na resposta ao
**próximo** cliente que perguntar algo parecido — antes de qualquer humano
ter lido o rascunho. Isso contradiz diretamente o texto do próprio
comentário no código e a garantia dada no relatório anterior ("nunca
publicado sem revisão humana").

**Recomendação:** `retrieve()` deveria fazer join com a versão mais recente
de cada artigo e só retornar quando `approved=true` (ou aceitar
explicitamente artigos não aprovados só para os manuais/curados
originalmente, que não passam por este fluxo). Não implementei a correção
agora porque não foi pedida nesta rodada — mas recomendo tratar como
prioridade **antes** de qualquer expansão de conteúdo (seções 3-4 abaixo),
já que aumentar o volume de artigos gerados por IA só aumenta a superfície
desse problema.

---

## 1. Estrutura da KB — como está armazenada

- Modelo `AiKnowledgeBase` (`prisma/schema.prisma:384-404`): `tenantId`,
  `productCode?`, `topic`, `category`, `title`, `content`, `tags[]`,
  `embedding vector(384)`. Índices por `tenantId`, `category`,
  `[tenantId, productCode]`.
- `AiKnowledgeVersion` guarda histórico com `approved`, `author`,
  `reviewer`, `approvedAt` — a infraestrutura de curadoria **existe**, só
  não é respeitada na leitura (seção 0).
- `retrieve()` (`knowledge.service.ts:97-207`): busca semântica primeiro
  (pgvector, `embedding <=> query`), cai para busca textual em cache de até
  100 linhas (30s TTL) se a semântica não retornar nada — pontuação por
  título (+3), tags (+2), tópico/categoria (+2), conteúdo (+1).
- `productCode` separa catálogos por produto desde 05/08 — artigo com
  `productCode IS NULL` é genérico e casa com qualquer produto.

---

## 2. Cobertura atual de conteúdo

Dois arquivos, concatenados no connector
(`hipertms.connector.ts:1170-1173`):

| Arquivo | Entradas | Origem |
|---|---|---|
| `hipertms-manuais.data.ts` | 172 | Auto-gerado de 11 manuais em 07/07 (`scripts/generate-manuais-kb.mjs`) |
| `hipertms-suporte-kb.data.ts` | 228 | Curado manualmente, 65 tópicos distintos |

**Cobertura por tema (suporte-kb, os 228 artigos curados):**

| Tema | Tópicos | Exemplos reais |
|---|---|---|
| Fiscal (CT-e/MDF-e/GNRE/NFS-e) | 11 tópicos | "CT-e rejeitado pela SEFAZ", "Código SEFAZ 539 — CFOP inválido", "MDF-e não está encerrando" |
| Financeiro | 7 tópicos | "Ciclo de vida da fatura — 9 status", "Como gerar cobrança PIX" |
| Frota | 7 tópicos | "Abastecimento não gerou conta a pagar", "CNH do motorista vencida" |
| Cadastro/acesso | 6 tópicos | "CNPJ duplicado", "Usuário sem permissão para módulo" |
| Precificação/contratos | 3 tópicos | "Sistema não calcula frete — tabela não encontrada" |
| Administração/sistema | 6 tópicos | "Sequenciador zerou", "Guardrails financeiros" |
| Vendas/operação/compras/equipes/relatórios | ~20 tópicos | cobertura operacional geral |
| Treinamento/FAQ | 1 tópico | "Diferença entre CT-e e MDF-e" |

### Lacuna confirmada: `integracoes` e `api` não têm NENHUM artigo

Busquei por conteúdo relacionado a integração de ERP, webhooks, uso de API,
tokens, erros HTTP nos 400 artigos combinados. **Zero artigos** cobrem essas
duas categorias do classificador. O único hit próximo ("Como emitir boleto
bancário — integração Asaas") é sobre boleto, não sobre a categoria
`integracoes` (que o classificador define como "ERP, parceiros, webhooks").

---

## 3. Playbooks determinísticos — cobertura por categoria

O classificador (`case-classifier-agent.service.ts:5-17`) define **12**
categorias. `support-playbooks.const.ts` define **9** playbooks, com 3
aliases mapeando categorias sem playbook próprio para um genérico:

| Categoria (classificador) | Tem playbook? | Resolve para |
|---|---|---|
| fiscal | ✅ | `fiscal` |
| cte | ✅ | `cte` |
| mdfe | ✅ | `mdfe` |
| frete | ✅ (alias) | `precificacao` |
| financeiro | ✅ | `financeiro` |
| cadastro | ⚠️ genérico (alias) | `treinamento` — sem passos específicos de cadastro |
| frota | ✅ | `frota` |
| usuarios | ✅ (alias) | `acesso` |
| **integracoes** | ❌ **nenhum** | — |
| **api** | ❌ **nenhum** | — |
| erro_sistema | ✅ (alias) | `bug` |
| treinamento | ✅ | `treinamento` |

Sem playbook, o `DiagnosticAgentService` cai em raciocínio livre da IA, sem
passos estruturados nem lista de `escalate` — e como a seção 2 mostrou, sem
KB relevante também. **`integracoes` e `api` são hoje as duas únicas
categorias que a Lia estruturalmente não consegue resolver sozinha** — o
desenho do sistema força `resolved=false` e escalação (regra explícita em
`resolution-agent.service.ts:86`: sem KB relevante → não alucinar, escalar).
Isso não é um bug — é o comportamento correto dado que não há conteúdo —
mas é uma lacuna real de cobertura, não de arquitetura.

`cadastro` tecnicamente "tem" playbook, mas é o genérico de treinamento
(passos: "não busque dado real do TMS, responda só com a KB") — não orienta
sobre os problemas reais de cadastro que a própria KB já documenta (CNPJ
duplicado, importação de terceiros).

---

## 4. Capacidade de diagnóstico em tempo real — o que a Lia lê de fato

O connector expõe **9 métodos de leitura**. Só **3** são chamados durante um
diagnóstico ao vivo:

| Método | Chamado pelo DiagnosticAgent? | Quando |
|---|---|---|
| `getContractStatus` | ✅ sempre | qualquer ticket com cliente identificado |
| `getDocumentStatus` | ✅ condicional | só fiscal/cte/mdfe **e** mensagem contém chave de 44 dígitos ou nº de 7-15 dígitos |
| `getRejectionInfo` | ✅ condicional | só fiscal/cte/mdfe **e** mensagem contém 3-4 dígitos |
| `getProactivityEvents` | ❌ nunca | só no fluxo proativo (fora do chat) |
| `getClosingReport` | ❌ nunca | só no scheduler de fechamento |
| `getCashView` | ❌ nunca | só no digest proativo |
| `lookupCustomer` | ❌ nunca no diagnóstico | roda antes, na identificação |
| `getPlans` | ❌ nunca | fluxo comercial, não suporte |
| `getKnowledge` | ❌ nunca em runtime | só importação batch da KB |

**Implicação prática:** um ticket de `frota` ou `financeiro` — categorias
que juntas somam 14 tópicos de KB — **não dispara nenhuma leitura real do
TMS além do contrato**. A Lia responde só com o que está escrito na KB,
mesmo quando o connector já sabe ler dados de caixa (`getCashView`) ou
eventos de frota/fiscal (`getProactivityEvents`) que poderiam confirmar o
caso específico do cliente. Não é um problema de conteúdo — é capacidade de
leitura existente e não conectada ao fluxo de diagnóstico.

### Tabela de rejeições SEFAZ — cobertura real

`getRejectionInfo` não é stub — é uma tabela real com **21 códigos**
cobertos (108, 109, 214, 280, 301, 302, 401, 524, 525, 539, 562, 564, 565,
573, 580, 581, 204, 205, 217, 228, 999), com `suggestedAction` específico
por código. O próprio comentário no código já assume que é parcial:
*"Atualizada com os principais códigos para suporte de primeiro nível"*
(`hipertms.connector.ts:1273-1274`). Qualquer código fora dessa lista
retorna `null` **silenciosamente** — sem log, sem fallback — e o
diagnóstico simplesmente não ganha `rejectionInfo` para aquele ticket.

---

## 5. Como o prompt usa o que está disponível

`ResolutionAgentService` (quem escreve o texto final ao cliente) recebe:
`rootCause`, `suggestedAction`, `tmsUnstable` (aviso de instabilidade),
`tmsCustomer.page`/`.name`, até 4 artigos de KB (`retrieve(..., 4, ...)`),
e o tom configurável do tenant.

Regra anti-alucinação, verbatim (`resolution-agent.service.ts:79-91`):
> "Use APENAS o que está nas Fontes KB e no diagnóstico. NUNCA invente menu,
> caminho de sistema ou solução que não conste nas fontes." /
> "Se não houver KB relevante ou a causa não estiver coberta: NÃO alucine.
> Diga ao cliente que vai escalar... e declare resolved=false."

Isso é uma boa notícia estrutural: **a arquitetura já impede alucinação por
design** — quando falta conteúdo, o sistema escala em vez de inventar. O
problema não é risco de alucinação, é volume de escalonamento desnecessário
em categorias que poderiam ser cobertas.

---

## 6. Plano — o que cadastrar para cobrir ~90% dos chamados

Ordem de prioridade, do que mais afeta volume de escalonamento hoje para o
que é polimento:

### 6.1 Fechar a lacuna crítica (seção 0)
Antes de gerar mais conteúdo, corrigir `retrieve()` para respeitar
`AiKnowledgeVersion.approved`. Cada artigo novo (manual ou gerado por IA)
some no volume de risco enquanto isso não for corrigido.

### 6.2 Cobrir `integracoes` e `api` — zero artigos hoje
Playbook novo + ~6-8 artigos mínimos:
- "Como gerar/renovar token de API do HiperTMS"
- "Webhook não está recebendo eventos — checklist de diagnóstico"
- "Erro 401/403 na integração — causas mais comuns"
- "Como configurar integração com [ERP parceiro comum, ex.: sistema fiscal terceiro]"
- "Rate limit da API — o que fazer quando bate no limite"
- "Diferença entre ambiente sandbox e produção na integração"

Playbook `integracoes` deveria orientar: 1) identificar se é problema de
autenticação, payload ou disponibilidade; 2) usar `getProactivityEvents`
(hoje não conectado ao diagnóstico) para checar se há evento de falha
registrado; 3) `escalate` em qualquer menção a perda de dado ou
duplicidade de cobrança.

### 6.3 Playbook próprio para `cadastro`
Hoje herda o genérico de treinamento. A própria KB já tem os artigos
certos (CNPJ duplicado, importação de terceiros, permissões) — só falta um
playbook que direcione o diagnóstico pra eles em vez de cair no fallback
"não busque dado real do TMS".

### 6.4 Ampliar a tabela de rejeições SEFAZ
21 códigos é claramente uma seleção "top N". Levantar com o time fiscal (ou
com a documentação MOC da SEFAZ) os 15-20 códigos mais recorrentes nos
tickets reais dos últimos meses (dado que já existe — `rootCause` +
`ticketCategory` estão no banco desde a auditoria de 05/08) e priorizar por
frequência real, não por achismo.

### 6.5 Conectar leituras já existentes ao diagnóstico
Sem escrever artigo nenhum, dá pra melhorar cobertura de `financeiro` e
`frota` conectando `getCashView`/`getClosingReport`/`getProactivityEvents`
ao `DiagnosticAgentService` condicionalmente por categoria — o dado já é
lido pelo connector, só não chega no fluxo de chat.

### 6.6 Artigos de "erro genérico" por categoria
Hoje só existe 1 artigo de FAQ genérico de sistema lento/erro
(`faq-geral`). Cada categoria carente (frota, financeiro, cadastro) se
beneficiaria de um artigo "erro genérico da categoria X — o que coletar
antes de escalar" para reduzir idas e vindas quando o `rootCause` não é
claro.

---

## 7. Proposta de suíte de Evals

Objetivo: medir, de forma repetível, se a Lia acerta a resposta sem
alucinar — não é sobre "parece bem escrito", é sobre "usou fonte real e
respondeu o que foi perguntado".

**Estrutura sugerida** (arquivo de fixtures + script, não framework
externo — mesmo espírito dos testes já existentes no repo):

```ts
// eval-cases.ts
interface EvalCase {
  id: string;
  category: TicketCategory;
  message: string;              // pergunta real (anonimizada) de ticket passado
  tmsCustomer?: {...};          // contexto simulado
  expectedRootCauseContains?: string;   // substring esperado no diagnóstico
  expectedResolved: boolean;            // deveria resolver sozinha ou escalar?
  expectedNoHallucination: string[];    // termos que NÃO podem aparecer se não estiverem na KB usada
  forbiddenPhrases?: string[];          // ex.: nomes de menu que não existem
}
```

**Fontes dos casos de teste:**
- Tickets reais já classificados no banco (`ticketCategory`, `rootCause`,
  `subject` já existem desde a auditoria de 05/08) — puxar uma amostra por
  categoria, anonimizar, usar como golden set.
- Casos sintéticos para as lacunas identificadas aqui (`integracoes`, `api`,
  `cadastro`) — já que não há histórico real suficiente ainda.

**Métricas a rodar por categoria:**
1. **Taxa de resolução automática** (`resolved=true` sem escalar) — comparar
   antes/depois de cada rodada de conteúdo novo.
2. **Taxa de alucinação** — draft contém algo que não está em
   `allowedFacts`? Dá pra automatizar: extrair substantivos/caminhos de
   menu do draft e conferir contra o `allowedFacts` retornado pelo
   `ResolutionAgentService` (o campo já existe e é usado pela Supervisora
   em produção — reaproveitar a mesma lógica no eval).
3. **Confiança mal calibrada** — `confidence=high` em categoria sem KB/
   playbook (deveria ser estruturalmente impossível dado o design da
   seção 5, mas vale testar como regressão).
4. **Precisão do rootCause** — comparar contra o `rootCause` real que um
   humano classificou no ticket original (quando o caso vem de histórico
   real).

**Cadência:** rodar como parte do gate de CI sempre que a KB ou os
playbooks mudarem — hoje não há teste automatizado que rode o pipeline
completo `classify → diagnose → resolve` contra casos reais, só specs
unitários por agente com mocks. Um `eval-runner.spec.ts` que chama a cadeia
real (com o `AnthropicService` real, fora do CI normal — custo de API) seria
o próximo passo natural, rodando sob demanda ou semanalmente, não a cada
commit.

---

## Relacionados

- `docs/reviews/2026-08-06-relatorio-modulo-suporte.md` — visão geral do
  módulo (fluxo, tokens, escalonamento).
- `apps/backend/src/application/knowledge/knowledge.service.ts`
- `apps/backend/src/application/agents/support-playbooks.const.ts`
- `apps/backend/src/application/agents/diagnostic-agent.service.ts`
- `apps/backend/src/application/connectors/hipertms.connector.ts`
