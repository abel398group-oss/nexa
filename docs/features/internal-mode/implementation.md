# Implementação — Modo Interno: Nexa abre no Login (sem landing de venda)

> Enquanto **não vendemos** o Nexa para usuários comuns, ele é ferramenta **interna**
> (admin do HiperTMS) + **suporte** aos clientes do TMS. A raiz `/` deve abrir no
> **login** (não na landing de venda). A `LandingPage` **continua no código** —
> só deixa de ser a rota `/` — para reativar fácil quando formos vender.
>
> Escopo: **frontend do Nexa** (`apps/frontend`). **Sem código agora** — só a spec.
> Status: pronto para revisão · Data: 2026-06

## 1. Contexto

Hoje a rota `/` renderiza a `LandingPage` (página pública de venda). Como o produto
está em **modo interno**, quem chega na raiz deve ir para o **login** (se não
autenticado) ou para o **app** (se autenticado). O **Portal do cliente** (`/portal`)
não muda. A landing é preservada para reativação rápida.

## 2. Estado atual (o que JÁ existe)

`apps/frontend/src/App.tsx`:

- Linha 11: `import { LandingPage } from '@/pages/LandingPage';`
- Linha 50: `<Route path="/" element={<LandingPage />} />` ← **ponto a mudar**.
- Linha 51: `/login` → `LoginPage`.
- Linha 52: `/portal` → `PortalPage` (área pública do cliente — **não mexer**).
- Linhas 53–79: área autenticada sob `<ProtectedRoute><TenantGate><Layout/></TenantGate></ProtectedRoute>`.
- Linha 80: `<Route path="*" element={<Navigate to="/inbox" replace />} />` (fallback).

`apps/frontend/src/components/RouteGuards.tsx`:

- `ProtectedRoute`: enquanto `useAuth().loading` → loading; **sem usuário → `Navigate /login`**;
  com usuário → renderiza.
- `PermissionRoute`: idem + checa permissão (admin passa sempre), fallback `/inbox`.

> Ou seja, a infra de auth já redireciona o não-autenticado para `/login`. Falta só
> a raiz `/` parar de mostrar a landing.

## 3. Mudança por camada (Frontend)

### 3.1. `App.tsx` — rota `/` passa a decidir login × app

Trocar a rota da landing por um **redirect baseado em auth**. Criar um componente
pequeno `RootRedirect` (sugestão: em `RouteGuards.tsx`, ao lado dos outros guards):

```tsx
// RouteGuards.tsx (novo)
export function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <RouteLoading />;
  return <Navigate to={user ? '/inbox' : '/login'} replace />;
}
```

No `App.tsx`, **substituir a linha 50**:

```tsx
// antes:
<Route path="/" element={<LandingPage />} />
// depois:
<Route path="/" element={<RootRedirect />} />
```

### 3.2. Preservar a `LandingPage` (reativação fácil)

- **Manter** o import da `LandingPage` (linha 11) — não remover o arquivo.
- **Recomendado:** expor a landing numa rota explícita para teste/preview e
  reativação trivial, ex.: `<Route path="/landing" element={<LandingPage />} />`.
  Assim a página continua acessível e revend = só trocar a rota `/` de volta.
- Alternativa minimalista: não criar `/landing` e deixar a `LandingPage` apenas
  importada/aludida num comentário. (Perde a possibilidade de pré-visualizar.)

### 3.3. O que **não** muda

- `/login`, `/portal` e toda a área autenticada (linhas 51–79) ficam iguais.
- O fallback `*` → `/inbox` continua (e, se o usuário não estiver autenticado, a
  `ProtectedRoute` do `/inbox` o manda para `/login`).

## 4. Comportamento esperado

| Situação | Resultado |
|---|---|
| Não autenticado acessa `/` | `RootRedirect` → `/login` (tela de login). |
| Autenticado acessa `/` | `RootRedirect` → `/inbox` (app). |
| Acessa rota desconhecida `*` | → `/inbox` → (se não auth) `/login`. |
| Acessa `/portal` | Portal do cliente, **inalterado** (auth própria). |
| Após logout | volta para `/login` (fluxo de auth atual). |
| `/landing` (se adotado) | mostra a `LandingPage` (preview/reativação). |

## 5. Como reverter (quando formos vender)

Trocar a rota `/` de volta para a landing:

```tsx
<Route path="/" element={<LandingPage />} />
```

(E, se `/landing` tiver sido criada, mantê-la ou remover — indiferente.)

## 6. Critérios de aceite

- [ ] `/` não mostra mais a landing de venda em produção.
- [ ] Não autenticado em `/` cai no **login**; autenticado cai no **app** (`/inbox`).
- [ ] `LandingPage` permanece no código (arquivo não removido) e reativável trocando 1 rota.
- [ ] `/portal` e o fluxo de login/área autenticada continuam funcionando igual.
- [ ] Sem flicker: enquanto o `useAuth` resolve, mostra loading (não pisca a landing).

## 7. Casos de borda

- **Deep link** para rota protegida sem auth → `ProtectedRoute` manda para `/login`
  (comportamento atual, mantido).
- **SSR/preload**: não aplicável (SPA Vite); o redirect é client-side após `/auth/me`.
- **SEO da landing**: em modo interno não há indexação a preservar; ao revender,
  reavaliar (a landing volta para `/`).

## 8. Relacionados

- `apps/frontend/src/App.tsx` · `apps/frontend/src/components/RouteGuards.tsx`
- `docs/architecture/frontend-architecture.md`
- [`tms-native-support/implementation.md`](../tms-native-support/implementation.md) (suporte do cliente dentro do TMS)
