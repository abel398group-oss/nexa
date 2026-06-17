# Portal de Suporte — Guia de Implementação (Frontend TMS)

> **Versão:** 2.0 · **Audiência:** Squad Frontend TMS · **Última atualização:** 2026-06-17
> **Referência de API:** [`portal-api-contract.md`](./portal-api-contract.md)

---

## 1. Filosofia: Zero Fricção

O usuário do TMS não deve preencher o que o sistema já sabe.

### Comparativo: Bling vs TMS

| Etapa | Bling (referência UX) | TMS (nossa implementação) |
|---|---|---|
| Acessar suporte | Navegar até página `/central.ajuda.php` | Ícone `?` no **header do TMS** (igual ao Bling) |
| Passo 1 | Selecionar categoria (dropdown) | ✅ **Automático** pela rota atual |
| Passo 2 | Selecionar subcategoria em cascata | ✅ **Eliminado** |
| Passo 3 | Preencher assunto, descrição, telefone | ✅ **Pré-preenchidos** com contexto |
| Resultado | 3 passos + formulário em branco | **1 clique em "Enviar"** |

---

## 2. Arquitetura do Componente

O padrão visual segue o Bling: um ícone `?` no header do TMS abre um **popover/dropdown**
com as opções de suporte. Ao selecionar uma opção, um **drawer lateral** desliza à direita
com o conteúdo. Não há navegação para outra página — o usuário permanece no contexto atual.

**Não há botão flutuante** nem widget de WhatsApp.

### 2.1 Passo 1 — Ícone `?` no Header

```
┌─────────────────────────────────────────────────────────────────┐
│  HiperTMS  [Cadastros ▾] [Vendas ▾] [Fiscal ▾]    🔔  [?]  👤  │  ← header
└─────────────────────────────────────────────────────────────────┘
                                                        │
                                               clique no [?]
                                                        │
                                                        ▼
```

O ícone `?` fica na barra de navegação principal, no mesmo nível dos ícones de notificação
e perfil (exatamente como o Bling posiciona o seu).

### 2.2 Passo 2 — Dropdown (Popover)

Ao clicar no `?`, abre um popover ancorado no header:

```
                                              ┌─────────────────────┐
                                              │  Centro de Suporte  │
                                              ├─────────────────────┤
                                              │  💬 Abrir chamado   │  ← abre drawer
                                              │  📋 Meus chamados   │  ← abre drawer
                                              └─────────────────────┘
```

Sem opção de WhatsApp. Sem subcategorias em cascata. Apenas as duas ações diretas.

### 2.3 Passo 3 — Drawer Lateral

Ao clicar em uma das opções do popover, o drawer desliza à direita:

```
┌──────────────────────────────────────────────────────────────────┐
│  HiperTMS  [Cadastros ▾] [Vendas ▾]...            🔔  [?]  👤  │
├──────────────────────────────────────────┬───────────────────────┤
│                                          │  ✕  Centro de Suporte │
│  Conteúdo normal do TMS                 │ ─────────────────────  │
│  (permanece visível e interativo)        │  [Abrir] [Meus cham.] │
│                                          │ ─────────────────────  │
│                                          │  [conteúdo da         │
│                                          │   aba selecionada]    │
│                                          │                       │
└──────────────────────────────────────────┴───────────────────────┘
```

### 2.4 Inicialização da Sessão

O JWT de sessão do portal deve ser obtido **apenas quando o drawer é aberto pela primeira vez**.

```
Usuário clica [?] no header
      │
      ▼
Popover aparece (sem chamada de API ainda)
      │
Usuário clica "Abrir chamado" ou "Meus chamados"
      │
      ▼
JWT em memória?
  ├── Sim → abrir drawer direto
  └── Não → chamar /internal/support-token (backend TMS)
                  │
                  ▼
             POST /api/portal/session { token }
                  │
                  ▼
             Armazenar JWT em memória → abrir drawer
```


---

## 3. Autenticação

### 3.1 Endpoint Interno do TMS (Backend)

Crie uma rota interna no backend do TMS que o frontend chama ao abrir o drawer.
Ela chama o Nexa server-to-server e retorna apenas o token de handoff.

```js
// Backend TMS — Express
app.get('/internal/support-token', requireAuth, async (req, res) => {
  const response = await fetch(`${NEXA_HOST}/api/handoff/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.TMS_SERVICE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      externalId: req.user.id,
      tenantId:   req.user.tenantId,
      name:       req.user.name,
      page:       req.headers['x-current-page'] ?? '/',  // enviado pelo frontend
    }),
  });
  const { token } = await response.json();
  res.json({ token });
});
```

O frontend envia o header `X-Current-Page` com a rota atual ao chamar este endpoint.

### 3.2 Frontend — Inicialização da Sessão

```ts
// hooks/usePortalSession.ts
let _jwt: string | null = null;
let _name: string | null = null;

export function getPortalName(): string | null { return _name; }

export async function getPortalJwt(currentPage: string): Promise<string> {
  if (_jwt) return _jwt;

  // 1. Obter handoff token do backend TMS
  const tokenRes = await fetch('/internal/support-token', {
    headers: { 'X-Current-Page': currentPage },
    credentials: 'include',
  });
  const { token } = await tokenRes.json();

  // 2. Trocar por JWT de sessão no Nexa
  const sessionRes = await fetch(`${NEXA_HOST}/api/portal/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const { session, name } = await sessionRes.json();

  _jwt = session;
  _name = name ?? null;  // nome do usuário para exibir no header do drawer
  return _jwt;
}

export function clearPortalJwt() { _jwt = null; _name = null; }
```

### 3.3 Renovação de Sessão

JWT expira em 45 minutos. Ao receber `401` em qualquer chamada ao Nexa:

```ts
function nexaFetch(path: string, options: RequestInit = {}) {
  return fetch(`${NEXA_HOST}/api${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${_jwt}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  }).then(async res => {
    if (res.status === 401) {
      clearPortalJwt();             // invalida JWT em memória
      await getPortalJwt(location.pathname); // renova automaticamente
      return nexaFetch(path, options);       // retry transparente (1 vez)
    }
    return res;
  });
}
```

**Não use `localStorage`** — armazene o JWT apenas em memória (variável de módulo).

---

## 4. Mapeamento Rota TMS → Categoria

O TMS detecta automaticamente a categoria pelo `pathname` da rota atual.

| Padrão de rota (React Router) | Categoria enviada à API | Rótulo exibido |
|---|---|---|
| `/cte/*`, `/emissao/cte/*` | `cte` | CT-e |
| `/mdfe/*`, `/emissao/mdfe/*` | `mdfe` | MDF-e |
| `/fiscal/*`, `/nfe/*`, `/nfse/*` | `fiscal` | Fiscal |
| `/financeiro/*`, `/contas/*`, `/cobranca/*` | `financeiro` | Financeiro |
| `/configuracoes/*`, `/sistema/*` | `sistema` | Sistema |
| qualquer outra rota | `outro` | Outro |

```ts
// utils/supportContext.ts
const ROUTE_CATEGORY_MAP: [RegExp, string][] = [
  [/^\/(cte|emissao\/cte)/,           'cte'],
  [/^\/(mdfe|emissao\/mdfe)/,         'mdfe'],
  [/^\/(fiscal|nfe|nfse)/,            'fiscal'],
  [/^\/(financeiro|contas|cobranca)/, 'financeiro'],
  [/^\/(configuracoes|sistema)/,      'sistema'],
];

export function getCategoryFromRoute(pathname: string): string {
  for (const [regex, category] of ROUTE_CATEGORY_MAP) {
    if (regex.test(pathname)) return category;
  }
  return 'outro';
}

export const CATEGORY_LABELS: Record<string, string> = {
  cte:        'CT-e',
  mdfe:       'MDF-e',
  fiscal:     'Fiscal',
  financeiro: 'Financeiro',
  sistema:    'Sistema',
  outro:      'Outro',
};
```


### 4.1 Coleta de Contexto Técnico

Além da categoria, colete automaticamente o contexto para pré-popular a descrição:

```ts
// utils/supportContext.ts
export interface SupportContext {
  category:    string;
  subject:     string;
  description: string;
  page:        string;
  errorCode:   string | null;
}

export function buildSupportContext(): SupportContext {
  const pathname  = location.pathname;
  const category  = getCategoryFromRoute(pathname);
  const routeLabel = CATEGORY_LABELS[category] ?? 'Sistema';
  const errorCode  = document.querySelector('[data-error-code]')
    ?.getAttribute('data-error-code') ?? null;

  const subject = `Problema em ${routeLabel}`;

  const lines = [
    `**Tela:** ${document.title} (${pathname})`,
    `**Navegador:** ${navigator.userAgent.split(') ')[0]})`,
    errorCode ? `**Código de erro:** ${errorCode}` : null,
    ``,
    `**Descreva o que aconteceu:**`,
    ``,
  ].filter(Boolean);

  return { category, subject, description: lines.join('\n'), page: pathname, errorCode };
}
```

> **Convenção de `data-error-code`:** em telas de emissão com erro (rejeição de CT-e, NF-e, etc.),
> adicione `data-error-code="CODIGO_REJEICAO"` ao elemento que exibe o código. O collector
> captura automaticamente.

---

## 5. Drawer — Aba "Abrir Chamado"

### 5.1 Layout

O drawer abre ancorado à direita. O header do drawer segue o padrão do popover do Bling:
título + botão fechar `✕`. As abas ficam logo abaixo do header.

```
┌─────────────────────────────────────┐
│  Centro de Suporte              [✕] │  ← header do drawer
├─────────────────────────────────────┤
│  [Abrir chamado] [Meus chamados]    │  ← abas
├─────────────────────────────────────┤
│  Assunto                            │
│  [Problema em CT-e              ]   │  ← pré-preenchido, editável
│                                     │
│  Categoria                          │
│  [CT-e                         ▼]   │  ← pré-selecionada pela rota
│                                     │
│  Telefone de contato         *      │
│  [(11) 99999-0000              ]    │  ← do cadastro TMS, editável
│                                     │
│  Descrição                          │
│  ┌─────────────────────────────┐    │
│  │ **Tela:** Emissão CT-e (…)  │    │  ← contexto técnico automático
│  │ **Navegador:** Chrome 125   │    │
│  │ **Código de erro:** 539     │    │
│  │                             │    │
│  │ Descreva o que aconteceu:   │    │
│  │ _                           │    │  ← cursor aqui (foco automático)
│  └─────────────────────────────┘    │
│                                     │
│               [Cancelar] [Enviar →] │
└─────────────────────────────────────┘
```

### 5.2 Campos, Origem e Validação

| Campo | Origem do valor inicial | Editável | Validação |
|---|---|---|---|
| Assunto | `buildSupportContext().subject` | ✅ | Mín. 3 chars, máx. 100 chars |
| Categoria | `buildSupportContext().category` | ✅ | Um dos valores da lista |
| Telefone | `user.phone` (store do TMS) | ✅ | Obrigatório, mín. 10 dígitos |
| Descrição | `buildSupportContext().description` | ✅ | Mín. 10 chars, máx. 2000 chars |

**Opções do dropdown de categoria:**

| Valor da API | Rótulo |
|---|---|
| `cte` | CT-e |
| `mdfe` | MDF-e |
| `fiscal` | Fiscal |
| `sistema` | Sistema |
| `financeiro` | Financeiro |
| `outro` | Outro |


### 5.3 Comportamento do Formulário

- Ao abrir o drawer pela primeira vez: iniciar sessão + pré-preencher campos + focar no final da descrição.
- Validar **apenas no submit**.
- Botão "Enviar" desabilitado somente durante o request (spinner). Não desabilitar antes.
- Máscara de telefone: exibir formatada `(99) 99999-9999`; enviar à API apenas os dígitos.
- Se `user.phone` não estiver disponível, deixar o campo vazio (usuário preenche).

### 5.4 Chamada de API — Abrir Chamado

```
POST /api/portal/tickets
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "subject":  "Problema em CT-e",
  "category": "cte",
  "phone":    "11999990000",
  "message":  "<conteúdo da descrição>"
}
```

Resposta `200`: objeto completo do chamado. Usar o `id` retornado para o polling.

---

## 6. Drawer — Estado Pós-Envio (Chat em Tempo Real)

Após o submit bem-sucedido, o drawer **não fecha** — transiciona para a view de chat
do chamado recém-criado, dentro da mesma aba "Abrir chamado".

### 6.1 Layout do Chat

```
┌─────────────────────────────────────┐
│  Centro de Suporte              [✕] │
├─────────────────────────────────────┤
│  [Abrir chamado] [Meus chamados]    │
├─────────────────────────────────────┤
│  ← Novo chamado    #abc12345        │
│  CT-e · Em aberto · 17/06 10:00    │
├─────────────────────────────────────┤
│                                     │
│  Problema em CT-e 539…      [você]  │
│                         10:00       │
│                                     │
│  [Lia] Olá! Estou verificando       │
│  o erro 539 no seu CT-e.    10:00   │
│                                     │
│  ·  ·  ·   (Lia está digitando…)   │  ← visível enquanto aguarda
│                                     │
├─────────────────────────────────────┤
│  [Digite para continuar...     ]    │
│                          [Enviar →] │
└─────────────────────────────────────┘
```

### 6.2 Regras de Exibição das Mensagens

- `direction: "inbound"` → alinhado à direita, fundo azul. Rótulo: "você".
- `direction: "outbound"` → alinhado à esquerda, fundo cinza. Rótulo: "Lia" ou "Atendente".
- Usar "Atendente" no rótulo das outbounds quando `status === "escalated"`.
- Rolar automaticamente para a última mensagem após cada atualização do polling.

### 6.3 Indicador "Digitando"

Exiba `· · · Lia está digitando…` entre o envio da mensagem do usuário e a chegada
da resposta outbound. Some ao detectar nova mensagem `direction: "outbound"` no polling.

### 6.4 Polling

```ts
// Iniciar após abrir o chamado ou entrar no detalhe
const poll = setInterval(async () => {
  if (document.hidden) return;          // pausar quando aba em background
  const res  = await nexaFetch(`/portal/tickets/${ticketId}`);
  const data = await res.json();
  setTicket(data);
  if (data.status === 'resolved') clearInterval(poll); // parar quando resolvido
}, 4000);
```

### 6.5 Banners de Status

**Resolvido** (`status === "resolved"`):
```
✅ Chamado resolvido. Ficamos à disposição.
```
Campo de resposta desabilitado. Placeholder: "Este chamado foi encerrado."

**Escalonado** (`status === "escalated"`):
```
⚠  Aguardando atendente — nossa equipe entrará em contato pelo (11) 99999-0000.
```
Campo de resposta habilitado (cliente pode complementar).


### 6.6 Chamada de API — Responder Chamado

```
POST /api/portal/tickets/:id/messages
Authorization: Bearer <jwt>
Content-Type: application/json

{ "message": "Texto da resposta do usuário" }
```

Resposta: objeto completo do chamado atualizado. Substituir estado local com a resposta
(não fazer merge manual — confiar no servidor como fonte de verdade).

---

## 7. Drawer — Aba "Meus Chamados"

### 7.1 Layout

```
┌─────────────────────────────────────┐
│  Centro de Suporte              [✕] │
├─────────────────────────────────────┤
│  [Abrir chamado] [Meus chamados]    │
├─────────────────────────────────────┤
│  Assunto          Categ.  Data  Status│
│  ─────────────────────────────────  │
│  Frete atrasado…  CT-e   17/06 🔵   │  ← Em aberto
│  NF rejeitada…    Fiscal 15/06 🟠   │  ← Aguardando atendente
│  Dúvida sistema   Sist.  10/06 🟢   │  ← Resolvido
│                                     │
│            [← Ant.]  1/3  [Próx. →] │
└─────────────────────────────────────┘
```

### 7.2 Colunas da Tabela

| Coluna | Campo da API | Formatação |
|---|---|---|
| Assunto | `rootCause` | Truncar em 30 chars + `…` |
| Categoria | `ticketCategory` | Usar mapeamento `CATEGORY_LABELS` |
| Data | `createdAt` | `dd/MM` (ano só se diferente do atual) |
| Status | `status` | Ícone colorido + tooltip com rótulo |

**Mapeamento de status:**

| Valor | Ícone | Tooltip | Cor |
|---|---|---|---|
| `open` | 🔵 | Em aberto | Azul |
| `escalated` | 🟠 | Aguardando atendente | Laranja |
| `resolved` | 🟢 | Resolvido | Verde |

### 7.3 Paginação

Carregar 10 itens por página (drawer tem espaço limitado). Controles Anterior/Próxima.

### 7.4 Detalhe do Chamado (a partir da lista)

Clicar em um chamado abre o mesmo layout de chat da seção 6, dentro do drawer.
O botão "← Voltar" retorna para a lista.

### 7.5 Chamada de API — Listar Chamados

```
GET /api/portal/tickets?limit=10&offset=<offset>
Authorization: Bearer <jwt>
```

Carregar ao ativar a aba. Recarregar ao voltar para a lista após fechar um detalhe.

---

## 8. Mapeamento Completo: Ação → Endpoint

| Ação do usuário / evento | Método | Endpoint | Payload |
|---|---|---|---|
| Abre drawer pela 1ª vez → frontend chama `/internal/support-token` (backend TMS) | `POST` | `/handoff/token` | `{ externalId, tenantId, name, page }` |
| Frontend troca token por sessão | `POST` | `/portal/session` | `{ token }` |
| Clica [Enviar] no formulário | `POST` | `/portal/tickets` | `{ subject, category, phone, message }` |
| Polling de mensagens (chat aberto) | `GET` | `/portal/tickets/:id` | — |
| Responde no chat | `POST` | `/portal/tickets/:id/messages` | `{ message }` |
| Ativa aba "Meus chamados" | `GET` | `/portal/tickets` | `?limit=10&offset=N` |
| Clica em chamado na lista | `GET` | `/portal/tickets/:id` | — |
| Fecha o drawer (cleanup) | `POST` | `/portal/session/logout` | — |


---

## 9. Tratamento de Erros e Estados de Loading

### 9.1 Tabela de Erros

| Situação | Código | Onde exibir | O que mostrar |
|---|---|---|---|
| Token de handoff expirado | `401` em `POST /portal/session` | Inline no drawer | "Não foi possível iniciar a sessão. [Tentar novamente]" — re-chamar `/internal/support-token` |
| Sessão expirada durante uso | `401` em qualquer chamada autenticada | Transparente | Renovar automaticamente (retry único — ver seção 3.3). Se falhar duas vezes: "Sessão expirada. Feche e abra o suporte novamente." |
| Erro ao abrir chamado | `400`/`500` | Toast no drawer | "Não foi possível abrir o chamado. Tente novamente." |
| Chamado não encontrado | `404` | Inline no detalhe | "Chamado não encontrado." + botão "Voltar para a lista" |
| Erro de rede no polling | Network error | Banner discreto no chat | "Reconectando…" (retry automático a cada 8s; sem interromper a tela) |
| Timeout da Lia (sem resposta em 20s) | `200` mas sem msg outbound | Banner abaixo do "digitando" | "A Lia está demorando mais que o normal. Você receberá uma resposta em breve." |
| Sem conexão ao abrir drawer | Network error | Tela de erro no drawer | "Sem conexão com o suporte. Verifique sua internet." + [Tentar novamente] |

### 9.2 Estados de Loading

| Componente | Loading | Empty | Erro |
|---|---|---|---|
| Inicialização da sessão | Spinner central no drawer | — | Mensagem + botão retry |
| Formulário (submit) | Botão com spinner, campos bloqueados | — | Toast + desbloquear campos |
| Lista de chamados | Skeleton de 3 linhas | "Nenhum chamado aberto ainda." | Link "Tentar novamente" |
| Chat (carregamento inicial) | Skeleton de mensagens | — | "Erro ao carregar. [Tentar novamente]" |
| Polling (silencioso) | Nenhum (não interromper o usuário) | — | Banner "Reconectando…" |

---

## 10. Checklist de Implementação

**Componente de suporte (global)**
- [ ] Ícone `?` no header do TMS presente em todas as rotas (sem botão flutuante, sem widget WhatsApp)
- [ ] Clique no `?` abre popover com duas opções: "Abrir chamado" e "Meus chamados"
- [ ] Clique na opção do popover fecha o popover e abre o drawer lateral
- [ ] JWT do portal armazenado em memória (nunca em `localStorage`)
- [ ] Sessão inicializada apenas na primeira abertura do drawer (lazy init — não no clique do `?`)
- [ ] Retry automático de `401` com renovação transparente de JWT

**Coleta de contexto**
- [ ] `getCategoryFromRoute()` cobre todas as rotas listadas na seção 4
- [ ] `buildSupportContext()` captura tela, URL, navegador e `data-error-code`
- [ ] Telas com erros de rejeição adicionam `data-error-code` ao elemento de erro

**Aba "Abrir chamado"**
- [ ] Todos os campos pré-preenchidos ao abrir o drawer
- [ ] Foco automático no final da descrição (após o contexto técnico)
- [ ] Telefone do cadastro TMS pré-preenchido; campo editável
- [ ] Máscara de telefone exibida; dígitos apenas enviados à API
- [ ] Validação apenas no submit; mensagens inline por campo
- [ ] Após envio bem-sucedido: transição para view de chat (sem fechar drawer)

**Chat em tempo real**
- [ ] Polling a cada 4s, pausado quando `document.hidden === true`
- [ ] Polling parado quando `status === "resolved"`
- [ ] Indicador "Lia está digitando…" entre envio e chegada da resposta
- [ ] Rótulo "Lia" → "Atendente" quando `status === "escalated"`
- [ ] Scroll automático para a última mensagem
- [ ] Banner de escalonamento com telefone informado
- [ ] Banner de resolução + campo de resposta desabilitado

**Aba "Meus chamados"**
- [ ] Paginação de 10 itens; controles Anterior/Próxima
- [ ] Recarregar lista ao voltar do detalhe
- [ ] Clicar em chamado abre view de chat no drawer

**Erros**
- [ ] Todos os cenários da tabela 9.1 tratados
- [ ] Polling com banner discreto; nunca travar a tela em erro de rede
