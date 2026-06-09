# ADR 020 — Enriquecimento Automático de Contato via TMS

**Status:** Proposto · **Data:** 2026-06
**Revisão:** 2026-06-09 — corrigidos bugs de tag (prefixo inconsistente + desync de status),
regra de precedência nome TMS × pushname WhatsApp, e cache do lookup.

---

## Contexto

Quando a Lia recebe uma mensagem, ela já faz `lookupCustomer(phone)` para identificar se
o número é cliente ativo do HiperTMS. Se encontrar, preenche `customerStage = cliente_ativo`
e redireciona para o pipeline de suporte.

**Problema:** os dados do cliente no TMS (nome, empresa, email, plano) não são copiados
para o cadastro do Nexa (`contacts`). Resultado: a conversa aparece na inbox só com o
número de telefone — sem nome, sem tag "cliente_ativo", sem contexto visível para o
operador humano.

---

## Decisão

### D1 — O que enriquecer e quando

Toda vez que `lookupCustomer()` retornar um cliente encontrado, atualizar o contato Nexa:

| Campo TMS (`TmsCustomer`) | Campo Nexa (`contacts`) | Regra de escrita |
|---|---|---|
| `name` | `name` | **TMS tem precedência** sobre pushname WhatsApp (ver D7) |
| `email` | `email` | sobrescreve apenas se `null` (nunca string vazia) |
| `plan` | `tags[]` → `tms:plano:essencial` | ver D3 (prefixo `tms:` obrigatório) |
| `status` | `tags[]` → `tms:cliente_ativo` etc. | ver D3 (remove antiga antes de setar nova) |
| `externalId` | `externalContactId` | sempre atualiza |
| `registeredAt` | `notes` → `"Cliente desde YYYY-MM-DD"` | adiciona se `notes` vazio |

> **Nota:** campos de texto livre preenchidos manualmente pelo operador (ex.: `notes` com
> anotações) **nunca são sobrescritos**. Apenas campos `null` ou as tags `tms:*`
> (que são gerenciadas pelo sistema, não pelo operador).

### D2 — Onde acontece

No `ConversationAgentService`, imediatamente após `tmsLookup()` retornar um cliente.
O resultado do lookup é cacheado por 10 minutos por telefone (Redis, chave `tms:lookup:{phone}`)
para evitar chamada à API do TMS a cada mensagem:

```
lookupCustomer(phone)  ← resultado cacheado 10min (Redis)
  → found = true
  → enrichContact(tenantId, phone, tmsCustomer)   ← novo método
  → continua o fluxo normal
```

`enrichContact()` é um método de `ContactsService`.
Operação atômica: lê o contato atual e faz o merge em memória antes de persistir.

### D3 — Tags padronizadas (prefixo `tms:` obrigatório)

Tags automáticas **sempre** têm prefixo `tms:`. Tags manuais do operador **nunca** têm
esse prefixo. A interface exibe os dois grupos separados.

| Tag (formato correto) | Significado |
|---|---|
| `tms:cliente_ativo` | Status `active` no TMS |
| `tms:cliente_trial` | Status `trial` |
| `tms:cliente_suspenso` | Status `suspended` ou `inactive` |
| `tms:plano:basico` | Plano Básico |
| `tms:plano:essencial` | Plano Essencial |
| `tms:plano:profissional` | Plano Profissional |

**Regra de sincronização de status (sem acúmulo):**
Antes de inserir qualquer `tms:cliente_*`, remover todas as outras tags `tms:cliente_*`
do array. Assim o contato nunca fica com `tms:cliente_ativo` e `tms:cliente_suspenso`
ao mesmo tempo.

```typescript
// pseudo-código do merge de tags
const SYS_TAGS = /^tms:/;
const STATUS_TAGS = /^tms:cliente_/;
const PLAN_TAGS = /^tms:plano:/;

function mergeTags(existing: string[], tmsCustomer: TmsCustomer): string[] {
  // mantém tags manuais (sem prefixo tms:)
  const manual = existing.filter(t => !SYS_TAGS.test(t));
  // mantém tags tms: que não são status nem plano (ex: tms:via-api)
  const otherSys = existing.filter(t => SYS_TAGS.test(t) && !STATUS_TAGS.test(t) && !PLAN_TAGS.test(t));
  // monta as novas tags gerenciadas
  const statusTag = `tms:cliente_${tmsCustomer.status === 'active' ? 'ativo' : tmsCustomer.status === 'trial' ? 'trial' : 'suspenso'}`;
  const planTag = tmsCustomer.plan ? `tms:plano:${tmsCustomer.plan.toLowerCase()}` : null;
  return [...manual, ...otherSys, statusTag, ...(planTag ? [planTag] : [])];
}
```

### D4 — Exibição na inbox

- Nome do contato substitui o número de telefone na lista (quando preenchido)
- Tags `tms:*` aparecem como chips coloridos no header da conversa
- Plano aparece em destaque: `🟢 Essencial` / `⭐ Profissional` / `🔵 Básico`

### D5 — Sincronização (periodicidade)

O enriquecimento é **reativo** (a cada mensagem recebida), combinado com cache de 10min
no Redis para evitar pressão na API do TMS (ver D2).

Futuro (Phase 2): job semanal de sync para atualizar plano/status de clientes inativos.

### D6 — Privacidade / LGPD

- Dados copiados do TMS têm `source = "tms_lookup"` registrado em `notes` ou campo
  de metadado — rastreabilidade de origem.
- Não armazenar dados além do necessário (sem CPF, dados bancários, etc.).
- Se o cliente pedir opt-out, `enrichContact()` não roda mais para aquele número
  (verificar `contact.status === 'opted_out'` antes de executar).

### D7 — Precedência de nome: TMS × pushname WhatsApp (decisão crítica)

O WAHA preenche `contact.name` com o pushname do WhatsApp do lead (apelido pessoal,
ex.: "Zé da Silva"). O TMS tem o nome formal da empresa/razão social (ex.: "Transportadora
Silva LTDA").

**Decisão:** o nome do TMS tem precedência — é o dado oficial do cliente pagante.
O pushname é descartado quando o TMS retornar um nome não-vazio.

Implementação: `enrichContact()` **sempre** atualiza `name` quando o TMS tem nome,
independentemente do valor atual. Exception: se o operador marcou o contato com a flag
`nameLockedByOperator` (campo a criar, opcional), o nome não é tocado.

### D8 — Pré-requisito: o que o TMS precisa expor

O enriquecimento depende dos campos que `lookupCustomer()` retorna. Contrato atual
(`TmsCustomer`): `externalId, name, email?, plan?, status, registeredAt?`.

Confirmar com Uelder se esses campos estão disponíveis antes de implementar.

---

## Consequências

**Positivas:**
- Operador vê nome e plano do cliente imediatamente.
- Filtros futuros por plano (`tms:plano:essencial`) prontos sem esforço adicional.
- Suporte personalizado ("Olá João, vi que você está no plano Essencial...").

**Custos:**
- Cache Redis por telefone (10min TTL) — infraestrutura já existe.
- Lógica de merge de tags (D3) — ~20 linhas de código, testável unitariamente.
- Decisão de precedência de nome (D7) pode surpreender operadores que editaram o nome.

---

## Relacionados

ADR 010 (Connector) · ADR 011 (Source of Truth) · ADR 015 (Suporte)
