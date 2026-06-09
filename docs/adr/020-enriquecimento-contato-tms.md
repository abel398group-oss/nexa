# ADR 020 — Enriquecimento Automático de Contato via TMS

**Status:** Proposto · **Data:** 2026-06

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

Toda vez que `lookupCustomer()` retornar um cliente encontrado **E** o contato Nexa ainda
não tiver esses dados preenchidos, atualizar automaticamente:

| Campo TMS (`TmsCustomer`) | Campo Nexa (`contacts`) | Regra |
|---|---|---|
| `name` | `name` | sobrescreve se contato ainda sem nome |
| `email` | `email` | sobrescreve se contato ainda sem email |
| `plan` | `tags[]` → `"plano:essencial"` | adiciona tag (nunca remove outras) |
| `status` | `tags[]` → `"cliente_ativo"` / `"cliente_suspenso"` | atualiza tag de status |
| `externalId` | `externalContactId` | sempre atualiza (ID de referência) |
| `registeredAt` | `notes` → `"Cliente desde YYYY-MM-DD"` | adiciona se vazio |

**Regra fundamental:** nunca sobrescrever dado que o operador humano preencheu manualmente.
Critério: só preenche se o campo atual for `null` ou vazio, **exceto** `externalContactId`
e as tags de status (essas sempre ficam em sincronia com o TMS).

### D2 — Onde acontece

No `ConversationAgentService`, imediatamente após `tmsLookup()` retornar um cliente:

```
lookupCustomer(phone)
  → found = true
  → enrichContact(tenantId, phone, tmsCustomer)   ← novo método
  → continua o fluxo normal
```

`enrichContact()` é um método de `ContactsService` (ou `TmsLookupService`).
Operação: `UPDATE contacts SET ... WHERE tenantId = ? AND phone = ? AND campo IS NULL`.

### D3 — Tags padronizadas

As tags que o Nexa gerencia automaticamente (prefixo `"tms:"`) são separadas das tags
manuais:

| Tag | Significado |
|---|---|
| `tms:cliente_ativo` | Cliente com status `active` no TMS |
| `tms:cliente_trial` | Status `trial` |
| `tms:cliente_suspenso` | Status `suspended` ou `inactive` |
| `tms:plano:basico` | Plano contratado |
| `tms:plano:essencial` | Plano contratado |
| `tms:plano:profissional` | Plano contratado |

Tags com prefixo `tms:` são gerenciadas pelo sistema. Tags sem prefixo são manuais
(operador). A interface mostra os dois grupos separados.

### D4 — Exibição na inbox

- Nome do contato substitui o número de telefone na lista (quando preenchido)
- Tags `tms:*` aparecem como chips coloridos no header da conversa
- Plano aparece em destaque: `🟢 Essencial` / `⭐ Profissional` / `🔵 Básico`

### D5 — Sincronização (periodicidade)

O enriquecimento é **reativo** (a cada mensagem recebida), não em batch periódico.
Motivo: simplicidade — não requer job extra; o dado fica fresco sempre que o cliente
interage.

Futuro (Phase 2): job semanal de sync para atualizar plano/status de clientes que não
enviaram mensagem recente.

### D6 — Privacidade / LGPD

- Dados copiados do TMS têm `source = "tms_lookup"` no campo `notes` ou metadado.
- Não armazenar dados além do necessário para o atendimento (sem CPF, dados bancários, etc.).
- Se cliente pedir opt-out, o enriquecimento não roda mais para aquele número.

---

## Consequências

**Positivas:**
- Operador vê nome e plano do cliente imediatamente — sem precisar consultar o TMS.
- Filtros futuros por plano (`tms:plano:essencial`) possíveis sem esforço.
- Suporte ao cliente personalizado ("Olá João, vi que você tem o plano Essencial...").

**Custos:**
- Pequena latência extra na primeira mensagem (1 UPDATE no DB Nexa — < 5ms local).
- Necessidade de cuidado com conflito de dados (regra do D1: não sobrescreve manual).

---

## Relacionados

ADR 010 (Connector) · ADR 015 (Suporte) · Sprint de Contacts existente.
