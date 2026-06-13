# Plano de Migração — Nexa com FIDELIDADE MÁXIMA ao HiperTMS

> **Régua (alinhada com o Uelder):** o HiperTMS é a **referência oficial** de frontend/UX.
> "Replicar" = mesma identidade visual, mesma estrutura de layout, **mesma sidebar**,
> **mesmo header**, mesmo comportamento dos componentes, mesmos padrões de UX, mesma
> organização das telas e **mesma sensação de uso**. Lado a lado, o usuário deve perceber
> que Nexa e HiperTMS são da **mesma família de produto**. Diferenças **só** onde o Nexa
> tiver função exclusiva.
>
> Tudo é frontend (Tailwind v3 + `@/shared/ui`), sem mexer no banco.

## Princípio de execução

Para cada item: replicar o **comportamento exato** observado no TMS (não "algo parecido").
Quando houver dúvida, a fonte da verdade é `apps/web` do HiperTMS.

---

## A. Sidebar — `AppSidebar` (alta prioridade — define o DNA visual)

**Como o TMS faz (exato):**
- **Rail estreito por padrão** (`--sidebar-width-icon`, ~3.6rem) que **expande ao passar o
  mouse** (hover) — **não há botão de recolher**. O Nexa hoje usa botão de recolher → **trocar**.
- **Marca no topo:** no rail mostra o **favicon/símbolo**; expandida mostra o **wordmark**
  (`HiperTmsWordmark`). Clique → painel.
- **Navegação hierárquica:** `Grupo` (label UPPERCASE, ex.: "ADMIN PLATAFORMA") → `Seção`
  (com ícone, **expansível**, `aria-expanded`) → `Item` (e `subSections`). O Nexa hoje é
  **lista plana** → **reestruturar em grupos/seções**.
- **Atalhos rápidos** (quick-access) no topo (Cotações, Embarques… → no Nexa: Inbox, Suporte…).
- **Item ativo:** `bg-sidebar-active` + ícone/dot em **`--sidebar-icon-accent` (laranja)** +
  texto `sidebar-text-active`. Hover: `bg-sidebar-hover`.
- **Badge de contagem** por item (pílula `bg-red-500`, ex.: notificações).
- Ícones **Heroicons 24/outline**, 20px. (No Nexa: set inline próprio no mesmo estilo.)

**Implementar no Nexa:**
1. Trocar o recolher-por-botão por **rail + expand no hover**.
2. Modelar a navegação como **Grupo → Seção → Item** (estrutura de dados + render), com
   labels de grupo UPPERCASE e seções expansíveis.
3. Marca: **símbolo no rail / wordmark expandido**.
4. Seção de **atalhos rápidos**.
5. Badge de contagem nos itens (ex.: nº de conversas em aberto no Inbox).
6. Garantir o estado ativo idêntico (overlay + ícone laranja).

## B. Header — `AppTopBar`

**Como o TMS faz (exato):**
- A **marca fica na sidebar** (não no header).
- Regiões: **botão de menu (mobile, `sm:hidden`)** · **seletor de workspace/tenant** (logo da
  empresa + nome + chevron, abre dados da empresa) · **período/calendário** · **chat** ·
  **toggle de tema** (persiste a preferência via API) · **notificações** (badge `unreadCount`) ·
  **`NavbarAccountMenu`** (conta). Separadores verticais. Sticky.

**Estado do Nexa:** título da página + busca (Ctrl+K) + ajuda + kill-switch + tema +
`NotificationBell` + MoreMenu + AccountMenu. Falta: **seletor de workspace/tenant**, menu
mobile, e o tema persistido por usuário.

**Implementar no Nexa:**
1. **Seletor de cliente/tenant** no header (já combina com o platform-admin — "Operando como
   HiperTMS"): logo + nome + chevron, visível ao admin de plataforma.
2. **Botão de menu mobile** que abre a sidebar off-canvas.
3. **Persistir o tema** por usuário (hoje só localStorage).
4. Manter busca, notificações e conta (já existem) com o mesmo arranjo/spacing do TMS.

## C. Shell de página

**TMS:** `PageContainer` (largura/scroll/padding padrão) + `PageHeader` (título, ações,
subtítulo) + `PageBreadcrumbs`.
**Nexa:** cada tela monta o header na mão; **sem breadcrumb**.
**Implementar:** `PageContainer`, `PageHeader` e `Breadcrumb` em `@/shared/ui`, e **migrar
todas as telas** para usá-los (mesmo espaçamento, mesma borda inferior, mesma tipografia).

## D. Componentes — paridade de comportamento

Além de existir, o componente precisa **se comportar igual**:
1. **Chart** (Recharts, como o TMS) — criar `@/shared/ui/Chart` e aplicar no Dashboard.
2. **Tabela:** ordenação por coluna (header clicável + sort), paginação, filtros e seleção —
   no mesmo padrão visual do `table` + `listTableTokens` do TMS.
3. **Multi-select** + inputs especializados (moeda, data) como no `DynamicForm`.
4. **Button:** completar variações (`xs`, `icon-xs/sm/lg`, `asChild`/Slot) e estados
   (loading, focus ring 3px) idênticos.
5. **Calendar / date picker** equivalente ao `calendar` do TMS.
6. Revisar **todos** os primitivos contra o Storybook do TMS (claro/escuro, hover, focus,
   disabled) — comportamento 1:1.

## E. Tokens / identidade visual (✅ base feita — validar)

Cores, tipografia (Inter + system-ui headings + mono tabular), raios (incl. `3xl`), sombras,
glows, `bg-signature`, easings, zoom 0.8, dark por `.dark` — **já espelhados**. Ação:
**auditoria fina** comparando telas lado a lado e corrigir qualquer desvio (tamanhos, pesos,
espaçamentos, cor exata).

## F. UX — mesma sensação de uso

1. **Sem emoji** no produto (como o TMS) — trocar emojis remanescentes por ícones de linha.
2. Fluxos CRUD idênticos (modal/página de form, ConfirmModal em exclusão, toast).
3. Estados (loading/skeleton/vazio/erro) com os mesmos componentes e disposição.
4. Voz/copy pt-BR, sentence case, eyebrows UPPERCASE.
5. Motion idêntico (easings, hover lift, tour).

## G. Telas — aplicar os padrões canônicos

Padronizar **todas** as telas do Nexa nos 4 moldes do TMS (ver `ux-analysis.md`):
**List page** · **Detail page** · **Form page/modal** · **Dashboard**. Cada tela usa
`PageContainer`/`PageHeader`/`Breadcrumb`, tabela padronizada, estados, e o mesmo grid/spacing.

---

## Fases ordenadas (do maior impacto de "família" para o detalhe)

| Fase | Escopo | Por quê primeiro |
|---|---|---|
| **1. Shell** | Sidebar (rail+hover, grupos/seções, marca, atalhos, badges) + Header (workspace selector, menu mobile, tema persistido) | É o que o usuário vê em **toda** tela — define a "mesma família" |
| **2. Page shell** | `PageContainer` + `PageHeader` + `Breadcrumb` e migrar todas as telas | Uniformiza a moldura de conteúdo |
| **3. Componentes** | Chart, ordenação de tabela, multi-select, date/currency, variações de Button, calendar | Paridade de comportamento |
| **4. UX/polimento** | Remover emoji, revisar estados/fluxos, motion | Mesma sensação de uso |
| **5. Auditoria fina** | Comparar tela a tela lado a lado e corrigir desvios de pixel/cor/spacing | Fidelidade final |
| **6. (opcional)** | Migrar p/ Tailwind v4 + FlyonUI semântico | Herdar o sistema do TMS de fato (não pré-requisito) |

## Critérios de aceite (teste de fidelidade)

- [ ] **Sidebar** do Nexa = rail que expande no hover, grupos/seções, marca símbolo→wordmark,
      atalhos, badges, item ativo laranja — **comportamento idêntico** ao TMS.
- [ ] **Header** com seletor de workspace/tenant, menu mobile, tema persistido, notificações e
      conta no mesmo arranjo.
- [ ] Todas as telas usam `PageContainer`/`PageHeader`/`Breadcrumb`.
- [ ] Tabelas com ordenação/filtros/seleção/paginação no padrão TMS.
- [ ] Dashboard com `Chart` (Recharts) além dos `MetricCard`.
- [ ] **Zero emoji** nas telas internas.
- [ ] **Teste lado a lado:** abrir Nexa e HiperTMS juntos — devem parecer o mesmo produto.
- [ ] `pnpm build` verde.

> **Nota de versão:** a fidelidade visual é alcançável no **Tailwind v3 atual** (traduzindo os
> tokens). A migração para **v4 + FlyonUI** (Fase 6) só é necessária se o time quiser que o
> Nexa compartilhe o **mesmo mecanismo** de estilos do TMS — recomendada, mas não bloqueante.
