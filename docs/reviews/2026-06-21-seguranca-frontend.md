# Análise de Segurança — Frontend Nexa
**Data:** 2026-06-21  
**Escopo:** `apps/frontend/src` — código-fonte React/Vite  
**Método:** revisão estática de código (sem execução)

---

## Executive Summary

O frontend do Nexa usa stack **moderna e segura** (React 18 + Vite + Tailwind + TanStack Query). Não há Bootstrap, jQuery, nem endpoints hardcoded. Nenhum token de autenticação ou secret foi encontrado no código. As proteções mais críticas (cookies HttpOnly, `withCredentials: true` no Axios, rotas guardadas por `ProtectedRoute`) estão corretamente implementadas.

Foram encontrados **3 achados de risco médio** e **2 baixos** — nenhum crítico ou alto exclusivo do frontend.

---

## Resultado das Perguntas-Chave

| Verificação | Resultado |
|---|---|
| Bootstrap presente? | ✅ NÃO |
| jQuery presente? | ✅ NÃO |
| Endpoints hardcoded? | ✅ NÃO — `baseURL: '/api'` (relativo) |
| Tokens/secrets no código? | ✅ NÃO |
| `innerHTML` / `eval()` no código? | ✅ NÃO |
| `localStorage` para tokens de auth? | ✅ NÃO |
| `withCredentials` no Axios? | ✅ SIM |
| Rotas protegidas? | ✅ SIM (`ProtectedRoute` + `PermissionRoute`) |

---

## Achados

### FE-SEC-001 — MÉDIO
**`nexa_acting_tenant` salvo em `localStorage`**

- **OWASP:** A02 / A07
- **Arquivo:** `apps/frontend/src/shared/lib/actingTenant.ts`
- **Vetor:** se houver XSS em qualquer ponto do app, o atacante pode ler o `nexa_acting_tenant` via `localStorage.getItem('nexa_acting_tenant')` e descobrir qual tenant o admin de plataforma está impersonando — ou forçar uma troca de tenant para causar ações no tenant errado.
- **Contexto:** o backend valida que o usuário é admin de plataforma antes de aceitar o header `x-acting-tenant`, então isso não permite escalonamento de privilégios. Mas expõe o ID do tenant-alvo e abre vetor para troca silenciosa se o admin não perceber.
- **Remediação:** trocar `localStorage` por `sessionStorage` (limpa ao fechar aba) ou manter apenas em memória React (contexto/estado).

```typescript
// Antes (localStorage — persiste mesmo após fechar o browser)
export function setActingTenantId(id: string | null): void {
  if (id) localStorage.setItem(KEY, id);
  else localStorage.removeItem(KEY);
}

// Depois (sessionStorage — limpa ao fechar aba)
export function setActingTenantId(id: string | null): void {
  if (id) sessionStorage.setItem(KEY, id);
  else sessionStorage.removeItem(KEY);
}
export function getActingTenantId(): string | null {
  return sessionStorage.getItem(KEY);
}
```

---

### FE-SEC-002 — MÉDIO
**`vite.config.ts` — servidor de dev exposto na rede (`host: true`)**

- **OWASP:** A05
- **Arquivo:** `apps/frontend/vite.config.ts:13-14`
- **Vetor:** `host: true` faz o Vite escutar em `0.0.0.0` (todas as interfaces). Combinado com `allowedHosts` permitindo 4 serviços de túnel (trycloudflare, ngrok, loca.lt), qualquer pessoa na mesma rede Wi-Fi ou com o link do túnel pode acessar o app de dev — incluindo endpoints de API autenticados via cookie.
- **Risco real:** exclusivo ao ambiente de dev. Em produção, o frontend é servido como arquivos estáticos — este arquivo não afeta produção.
- **Ação:** não alterar para não quebrar os túneis. Mas garantir que `npm run dev` **nunca** seja executado em servidor de staging ou máquina com acesso público. Adicionar comentário explícito no arquivo.

```typescript
// vite.config.ts — adicionar comentário (não altera comportamento)
server: {
  port: 5173,
  // ⚠️ ATENÇÃO: host: true expõe o dev server na rede local e via túneis.
  // Apenas para desenvolvimento local. Nunca usar em staging/produção.
  host: true,
  allowedHosts: ['.trycloudflare.com', '.loca.lt', '.ngrok-free.app', '.ngrok.io'],
```

---

### FE-SEC-003 — MÉDIO
**Socket.io — `join` sem autenticação explícita (frontend)**

- **OWASP:** A07
- **Arquivo:** `apps/frontend/src/pages/InboxPage.tsx:174-182`
- **Código atual:**
  ```typescript
  const s = io('/', { path: '/ws', transports: ['websocket'] });
  // ...
  socketRef.current?.emit('join', { conversationId: c.id });
  ```
- **Análise:** a conexão socket é **same-origin**, então o cookie de sessão é enviado automaticamente no handshake WebSocket pelo browser — `withCredentials` não é necessário aqui. O problema está no backend: o `ConversationsGateway` não valida o JWT nem o `tenantId` no evento `join` (já documentado como **SEC-005** no relatório de backend).
- **Impacto frontend:** o frontend faz a parte correta — mas o backend precisa validar se o `conversationId` informado pertence ao tenant do usuário autenticado.
- **Ação:** aguardar correção do SEC-005 no backend. Nenhuma mudança necessária no frontend para este item.

---

### FE-SEC-004 — BAIXO
**Sem Content-Security-Policy (CSP)**

- **OWASP:** A05
- **Contexto:** o backend tem `contentSecurityPolicy: false` no Helmet (já flagged como SEC-003 no relatório de backend). O frontend também não possui meta tag de CSP no `index.html`. Sem CSP, um XSS teria liberdade total de execução de scripts externos.
- **Ação (junto com SEC-003 do backend):** configurar CSP via Helmet no backend (cabeçalho HTTP) — isso protege o frontend sem precisar de meta tag.

---

### FE-SEC-005 — BAIXO
**`DevTokensPage` — verificar se bundle de produção exclui a página**

- **Arquivo:** `apps/frontend/src/app/App.tsx:30` (declaração do lazy import) e `:91` (route gated por `import.meta.env.DEV`)
- **Contexto:** a rota `/dev/tokens` só renderiza em `DEV`. O Vite substitui `import.meta.env.DEV` por `false` em produção e o Rollup elimina o branch morto. O lazy import `const DevTokensPage = lazy(...)` está declarado no nível do módulo, mas a factory `() => import('@/pages/DevTokensPage')` só seria invocada se o componente renderizasse.
- **Na prática:** muito provavelmente **não incluído** no bundle de produção. Mas merece verificação explícita.
- **Ação:** após qualquer mudança na estrutura de routes, rodar `pnpm --filter frontend build` e verificar com:
  ```bash
  ls dist/assets/ | grep -i token
  # ou
  grep -r "DevTokensPage\|design-system\|Tokens" dist/assets/*.js
  ```
  Se aparecer, mover o lazy import para dentro do bloco condicional:
  ```tsx
  // Mover para dentro do bloco DEV (elimina a referência em produção)
  {import.meta.env.DEV && (() => {
    const DevTokensPage = lazy(() => import('@/pages/DevTokensPage')
      .then((m) => ({ default: m.DevTokensPage })));
    return <Route path="/dev/tokens" element={<DevTokensPage />} />;
  })()}
  ```

---

## Pontos Positivos

- **Zero dependências legadas** — sem Bootstrap, jQuery, Lodash global ou libs com CVE conhecidos
- **Endpoints relativos** — `baseURL: '/api'` no Axios; nenhum `http://localhost` hardcoded
- **Sem secrets no frontend** — nenhuma `VITE_API_KEY`, `VITE_SECRET` ou similar
- **Auth por cookie HttpOnly** — sem tokens em `localStorage`, sem `Authorization: Bearer` exposto ao JS
- **`withCredentials: true`** em todas as instâncias Axios
- **Auto-refresh de sessão** — interceptor 401 faz refresh transparente; 403 "glass-break" exige confirmação
- **`ProtectedRoute` em todas as rotas autenticadas** — `/inbox` está dentro do `ProtectedRoute`, sem permissão específica intencionalmente (fallback universal)
- **`PermissionRoute` por feature** — cada rota protegida por permissão granular (`dashboard`, `contacts`, `campaigns`, etc.)
- **Sem `innerHTML`/`dangerouslySetInnerHTML`/`eval()`** — zero vetores de XSS direto
- **Apenas 1 `console.error`** em produção (InboxPage.tsx:168 — adequado)
- **Axios 1.7.x** — sem CVE ativo
- **`DevTokensPage` gated por `import.meta.env.DEV`** — não exposta em produção

---

## Itens para o Squad

| ID | Prioridade | Ação | Responsável |
|---|---|---|---|
| FE-SEC-001 | MÉDIO | Trocar `localStorage` por `sessionStorage` em `actingTenant.ts` | Squad |
| FE-SEC-002 | MÉDIO | Adicionar comentário de aviso no `vite.config.ts` | Squad |
| FE-SEC-003 | MÉDIO | Aguardar correção do SEC-005 no backend (sem mudança no frontend) | Squad backend |
| FE-SEC-004 | BAIXO | Ativar CSP via Helmet no backend (cobre o frontend) | Squad backend |
| FE-SEC-005 | BAIXO | Verificar bundle de produção após próximo build | Squad |

> **SEC-001 (CRÍTICO backend) — API key Anthropic:** Abel irá rotacionar ao final do ciclo de dev ativo. Ver `docs/security/secrets-management.md`.
