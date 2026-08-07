# Portal de Suporte — Contrato de API

> **Versão:** 1.1 · **Audiência:** Squad TMS · **Última atualização:** 2026-06-18

O Nexa expõe uma API REST que o HiperTMS consome para renderizar o portal de suporte ao cliente.
A Lia (IA) tenta resolver o chamado automaticamente; se não conseguir, escala para atendimento humano.

---

## 1. Autenticação

O fluxo usa dois níveis de auth independentes:

```
TMS Backend ──POST /api/handoff/token──► Nexa
                (TMS_SERVICE_TOKEN)          │
                                       token (5 min)
                                             │
TMS Frontend ──POST /api/portal/session─────►│
                (body: { token })            │
                                       JWT de sessão
                                     (cookie + body)
                                             │
TMS Frontend ──Authorization: Bearer <jwt>──►│
           ou  cookie portal_session         │
                                       rotas protegidas
```

### 1.1 Token de Handoff (server-to-server)

O backend do TMS gera um token de curta duração (5 minutos, uso único) para cada abertura
de sessão de suporte. **Nunca exponha `TMS_SERVICE_TOKEN` ao browser.**

### 1.2 JWT de Sessão do Portal

O frontend troca o token de handoff por um JWT de sessão (válido 45 minutos).
O JWT pode ser usado de duas formas:

- **Cookie** `portal_session` (httpOnly) — para portais standalone na mesma origem.
- **Header** `Authorization: Bearer <jwt>` — para embeds nativos no TMS
  (cross-subdomain, sem dependência de cookie).

O guard aceita ambas as formas. O JWT do portal é isolado do JWT interno do Nexa
(segredo e audience próprios: `audience: "portal"`).

---

## 2. Variáveis de Ambiente

O TMS precisa configurar as seguintes variáveis no seu ambiente:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `TMS_SERVICE_TOKEN` | Sim (prod) | Segredo compartilhado para autenticação server-to-server. Em dev, qualquer valor é aceito (com aviso no log do Nexa). |
| `CORS_ORIGINS` | Sim (prod) | Origens permitidas no CORS do Nexa — deve incluir o domínio do TMS. |

---

## 3. Endpoints

**Base URL:** `https://<nexa-host>/api`


### 3.1 `POST /handoff/token` — Gerar token de handoff

> **Quem chama:** backend do TMS · **Auth:** `TMS_SERVICE_TOKEN`

```http
POST /api/handoff/token
Authorization: Bearer <TMS_SERVICE_TOKEN>
Content-Type: application/json

{
  "externalId":  "usr_12345",
  "tenantId":    "tenant_abc",
  "name":        "João Silva",
  "companyName": "Transportes Hipervias LTDA",
  "cnpj":        "12345678000199",
  "page":        "/fretes/45678",
  "errorCode":   "FRETE_ATRASADO",
  "isManager":   false
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `externalId` | string | ✅ | ID do usuário no TMS (identidade segura, nunca alterável pelo cliente). |
| `tenantId` | string | ✅ | ID do tenant no Nexa. |
| `name` | string | — | Nome do usuário logado no TMS (prefill do portal). |
| `companyName` | string | — | Razão social da empresa do usuário. A Lia usa para não perguntar ao cliente algo que o sistema já sabe. |
| `cnpj` | string | — | CNPJ da empresa. Só contexto — a Lia **nunca** pede nem confirma CNPJ com o cliente (LGPD/anti-fraude). |
| `page` | string | — | Página/contexto onde o suporte foi aberto (para triagem da Lia). |
| `errorCode` | string | — | Código de erro exibido ao cliente (para triagem da Lia). |
| `isManager` | boolean | — | `true` = gestor; habilita a aba "Chamados da empresa" (`GET /portal/tickets?scope=company`). |

> ⚠️ **Campo novo neste payload exige mudança no Nexa ANTES do deploy do TMS.**
> O Nexa roda `ValidationPipe({ forbidNonWhitelisted: true })` global: qualquer
> propriedade não declarada no `CreateHandoffDto` faz a request inteira falhar com
> `400 { "message": ["property X should not exist"] }`. A validação roda **antes**
> da autenticação, então a chamada nem chega ao service.
>
> Isso já derrubou a abertura de chamado do widget duas vezes: `isManager`
> (09/07/2026) e `companyName` + `cnpj` (07/08/2026). Nas duas, o TMS converteu o
> 400 em erro genérico e a causa real levou dias para aparecer.
>
> **Ordem obrigatória de deploy: receptor (Nexa) primeiro, emissor (TMS) depois.**
> Ver `REGRAS-SQUAD.md`, REGRA 1.

**Response `201`**

```json
{
  "token":     "a3k9z2m1",
  "expiresIn": 300
}
```

| Campo | Descrição |
|---|---|
| `token` | Token de uso único, válido por 5 minutos (300 s). |
| `expiresIn` | TTL em segundos. |

**Erros**

| Status | Quando |
|---|---|
| `400` | `externalId` ou `tenantId` ausentes. |
| `401` | `TMS_SERVICE_TOKEN` inválido (apenas quando configurado no Nexa). |

---

### 3.2 `POST /portal/session` — Trocar token por sessão

> **Quem chama:** frontend do TMS · **Auth:** nenhuma

```http
POST /api/portal/session
Content-Type: application/json

{
  "token": "a3k9z2m1"
}
```

**Response `200`**

```json
{
  "jwt":       "<token>",
  "expiresAt": "2026-06-18T11:30:00.000Z",
  "name":      "João Silva"
}
```

Além do body, o Nexa seta o cookie `portal_session` (httpOnly, path `/api/portal`).
O campo `jwt` é o mesmo token — use como Bearer em embeds nativos ou guarde em memória.

**Erros**

| Status | Quando |
|---|---|
| `401` | Token inválido, já usado ou expirado. |

---

### 3.3 `GET /portal/me` — Perfil do cliente

> **Auth:** sessão do portal (cookie ou Bearer)

```http
GET /api/portal/me
Authorization: Bearer <jwt>
```

**Response `200`**

```json
{
  "externalId": "usr_12345",
  "tenantId":   "tenant_abc",
  "name":       "João Silva",
  "contract":   { ... }
}
```

`contract` contém dados do contrato lidos do TMS via connector interno.
Retorna `null` se o connector do TMS estiver indisponível (degradação graciosa).

**Erros**

| Status | Quando |
|---|---|
| `401` | Sessão ausente, inválida ou expirada. |

---

### 3.4 `GET /portal/tickets` — Listar chamados

> **Auth:** sessão do portal

```http
GET /api/portal/tickets?limit=10&offset=0&status=open&category=cte
Authorization: Bearer <jwt>
```

| Query param | Tipo | Default | Descrição |
|---|---|---|---|
| `limit` | number | 50 | Máximo de itens retornados. |
| `offset` | number | 0 | Offset para paginação. |
| `status` | string | — | Filtro por status (`open`, `resolved`, etc.). |
| `category` | string | — | Filtro por categoria do chamado. |

**Response `200`** — array plano de chamados mapeados.

```json
[
  {
    "id":        "conv_abc123",
    "subject":   "Frete atrasado",
    "status":    "open",
    "createdAt": "2026-06-17T10:00:00.000Z",
    "updatedAt": "2026-06-17T10:05:00.000Z"
  }
]
```

| Campo | Origem interna | Descrição |
|---|---|---|
| `id` | `id` | ID da conversa/chamado. |
| `subject` | `rootCause` | Causa-raiz classificada pela Lia (pode ser `null` antes da triagem). |
| `status` | `status` | Estado do chamado (`open`, `escalated`, `resolved`, `closed`). |
| `createdAt` | `createdAt` | Data de criação. |
| `updatedAt` | `lastActivityAt` | Última atividade (mensagem ou mudança de status). |

**Erros**

| Status | Quando |
|---|---|
| `401` | Sessão ausente, inválida ou expirada. |

---

### 3.5 `GET /portal/tickets/:id` — Detalhe do chamado

> **Auth:** sessão do portal

```http
GET /api/portal/tickets/conv_abc123
Authorization: Bearer <jwt>
```

**Response `200`**

```json
{
  "id":        "conv_abc123",
  "subject":   "Frete atrasado",
  "status":    "open",
  "createdAt": "2026-06-17T10:00:00.000Z",
  "updatedAt": "2026-06-17T10:05:00.000Z",
  "messages": [
    {
      "id":        "msg_001",
      "author":    "customer",
      "body":      "Meu frete está atrasado.",
      "isAgent":   false,
      "createdAt": "2026-06-17T10:00:00.000Z"
    },
    {
      "id":        "msg_002",
      "author":    "agent",
      "body":      "Olá! Vou verificar o status do seu frete agora.",
      "isAgent":   true,
      "createdAt": "2026-06-17T10:00:05.000Z"
    }
  ]
}
```

| Campo de mensagem | Descrição |
|---|---|
| `author` | `"customer"` = mensagem do cliente · `"agent"` = resposta da Lia ou atendente humano. |
| `body` | Conteúdo textual da mensagem. |
| `isAgent` | `true` quando `author === "agent"` (convenience field para condicional de UI). |

**Erros**

| Status | Quando |
|---|---|
| `401` | Sessão ausente, inválida ou expirada. |
| `404` | Chamado não encontrado ou não pertence ao cliente da sessão. |

---

### 3.6 `POST /portal/tickets` — Abrir chamado

> **Auth:** sessão do portal

```http
POST /api/portal/tickets
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "message":  "Meu frete está atrasado há 3 dias.",
  "subject":  "Frete atrasado",
  "category": "frete",
  "phone":    "11999990000"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `message` | string | ✅ | Primeira mensagem do chamado (enviada para a Lia). |
| `subject` | string | — | Título/assunto do chamado (prefill de `rootCause`). |
| `category` | string | — | Categoria (`ticketCategory`). |
| `phone` | string | — | Telefone de contato do cliente para o suporte humano. Apenas dígitos ou formatado. |

O chamado entra imediatamente no pipeline da Lia. Se a Lia não resolver, escala para humano.

**Response `200`** — mesmo formato do `GET /portal/tickets/:id` (detalhe com mensagens).

**Erros**

| Status | Quando |
|---|---|
| `401` | Sessão ausente, inválida ou expirada. |

---

### 3.7 `POST /portal/tickets/:id/replies` — Responder chamado

> **Auth:** sessão do portal

```http
POST /api/portal/tickets/conv_abc123/replies
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "body": "O rastreamento ainda não atualizou."
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `body` | string | ✅ | Mensagem do cliente (mínimo 1 caractere). |

A mensagem entra no mesmo pipeline da Lia. Retorna a mensagem recém-criada no formato de mensagem mapeada.

**Response `200`**

```json
{
  "id":        "msg_003",
  "author":    "customer",
  "body":      "O rastreamento ainda não atualizou.",
  "isAgent":   false,
  "createdAt": "2026-06-17T10:10:00.000Z"
}
```

> **Nota de compatibilidade:** o alias `POST /portal/tickets/:id/messages` com campo `message` ainda é aceito (legado).

**Erros**

| Status | Quando |
|---|---|
| `401` | Sessão ausente, inválida ou expirada. |
| `404` | Chamado não encontrado ou não pertence ao cliente da sessão. |

---

### 3.8 `DELETE /portal/session` — Encerrar sessão

> **Auth:** sessão do portal (cookie ou Bearer)

```http
DELETE /api/portal/session
Authorization: Bearer <jwt>
```

Limpa o cookie `portal_session`. Chamar mesmo sem sessão ativa não gera erro.

**Response `204 No Content`** — sem body.

> **Nota de compatibilidade:** `POST /portal/session/logout` ainda é aceito e retorna `{ ok: true }` (legado).

---

## 4. Fluxo de Uso

Sequência completa de chamadas que o TMS deve executar.

> **Arquitetura TMS nativa:** o suporte é acessado via ícone `?` no header do TMS que abre
> um drawer lateral. Os passos 1 e 2 abaixo ocorrem de forma **lazy** — apenas quando o
> usuário abre o drawer pela primeira vez, não no carregamento da página.

```
1. [Backend TMS — ao abrir o drawer pela 1ª vez]
   POST /api/handoff/token
   → recebe { token, expiresIn }
   → retorna o token ao frontend via endpoint interno (/internal/support-token)
   → NÃO expor o TMS_SERVICE_TOKEN ao browser

2. [Frontend TMS — inicialização da sessão]
   POST /api/portal/session  { token }
   → recebe { jwt, expiresAt, name }
   → armazena o JWT em memória (Bearer para todas as chamadas seguintes)
   → NÃO usar localStorage

3. [Frontend TMS — exibir histórico na aba "Meus chamados"]
   GET /api/portal/tickets?limit=10&offset=0
   → renderiza lista de chamados do cliente

   Nota: GET /api/portal/me é opcional para implementações nativas do TMS —
   o TMS já possui os dados do usuário (nome, telefone) em seu próprio store.
   Útil apenas para obter dados de contrato via connector.

4. [Frontend TMS — abrir chamado]
   POST /api/portal/tickets  { message, subject, category, phone }
   → exibe chamado criado com as mensagens iniciais (cliente + Lia)

5. [Frontend TMS — ver chamado existente]
   GET /api/portal/tickets/:id
   → exibe thread completa de mensagens

6. [Frontend TMS — responder]
   POST /api/portal/tickets/:id/replies  { body }
   → exibe mensagem criada; recarregar GET /portal/tickets/:id para thread completa

7. [Frontend TMS — ao fechar o drawer]
   DELETE /api/portal/session
```

### Polling de mensagens

O Nexa não implementa WebSocket no portal. Para exibir respostas da Lia em tempo real,
o TMS deve fazer polling em `GET /portal/tickets/:id` a cada 4 segundos enquanto o
chamado estiver aberto (`open` ou `escalated`) e o drawer estiver visível.

---

## 5. Notas de Segurança

- **`TMS_SERVICE_TOKEN`** nunca deve ser exposto ao browser — use apenas no backend do TMS.
- O token de handoff é **uso único**: após ser trocado por sessão, fica inválido.
- Cada sessão do portal é escopada por `(tenantId, externalId)` — o cliente não consegue
  acessar chamados de outro cliente mesmo conhecendo o ID.
- Em produção, o cookie `portal_session` exige `Secure` + `SameSite=None` para funcionar
  em iframe cross-origin. Confirme que o Nexa está servindo em HTTPS e que o domínio do TMS
  está em `CORS_ORIGINS`.
