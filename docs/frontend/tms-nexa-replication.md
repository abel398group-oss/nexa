---
type: note
tags: [frontend, design-system, roadmap, tms, replicação]
updated: 2026-07-03
summary: Análise estrutural completa do frontend HiperTMS vs Nexa — gaps, prioridades e guias de implementação sem quebrar código existente.
---

# Replicação Frontend TMS → Nexa

> **Regra de ouro:** TMS é **referência somente leitura**. Todo código novo vai no Nexa.  
> Nunca copiar código bruto — adaptar ao contexto Nexa (sem domínio logístico, sem NestJS/Prisma no cliente).

---

## 1. O que o TMS tem (visão geral)

### 1.1 Stack e dependências-chave

| Aspecto | HiperTMS | Nexa (atual) |
|---|---|---|
| Tailwind | **v4** (`@import 'tailwindcss'`, `@theme {}`) | v3 (`@tailwind base`) |
| UI Library | **shadcn/ui** (Sheet, Tabs, Alert, Badge…) | Componentes custom em `components/ui/` |
| Ícones | @heroicons/react + @tabler/icons-react + lucide-react | Custom `icons.tsx` |
| TanStack Query | v5 (`^5.20.5`) | v5 ✅ |
| TanStack Table | **v8** (`^8.21.3`) | ❌ não tem |
| Forms | react-hook-form `7.56.2` + zod + @hookform/resolvers | rhf `^7.53` + zod ✅ |
| Permissões | **CASL** (`@casl/ability` + `@casl/react`) | Simples (role string) |
| Routing | react-router-dom v6 ✅ | v6 ✅ |
| PDF | @react-pdf/renderer | ❌ |
| DnD | @dnd-kit/core + @hello-pangea/dnd | ❌ |
| Notificações | **sonner** (toast) | Custom Toast context |
| Charts | recharts ✅ | recharts ✅ |

### 1.2 Arquitetura de pastas (Feature-Sliced Design)

```
apps/web/src/
├── casl/           ← sistema de permissões CASL
├── components/
│   ├── layout/     ← AppLayout, AppSidebar, AppTopBar, PageHeader, PageContainer, PageBreadcrumbs, HubPage
│   ├── shared/     ← StandardListPage, StandardFormPage, StandardViewPage, DataTable, Pagination
│   └── ui/         ← shadcn components (Sheet, Badge, Button, Card, Tabs…) + stories
├── entities/       ← entidades de domínio (company, contract, seller…)
├── features/       ← features de UI agrupadas por domínio (~70 features)
├── pages/          ← páginas por área (logistic, fleet, finance, fiscal…)
├── routes/         ← definições de rotas por área
├── shared/         ← api, auth, billing, geography, lib, navigation, platform, ui, tenant
├── hooks/          ← hooks globais
├── contexts/       ← AuthContext, TenantContext
├── config/         ← environment, queryClient, routes
└── styles/
    └── globals.css ← tokens Tailwind 4 (@theme), sidebar, dark mode, utilities
```

**Nexa atual:**
```
apps/frontend/src/
├── app/providers/  ← AuthContext, TenantContext, ToastContext…
├── components/     ← Layout.tsx (monolito), ui/, conversation/
├── entities/       ← campaign, contact, conversation, seller, ticket
├── pages/          ← ~18 páginas (tudo junto)
├── shared/lib/     ← api.ts, queryClient.ts, cn.ts…
└── index.css       ← tokens (já alinhados ao TMS)
```

**Gap principal:** Nexa não tem camada `features/`, não tem templates de página, não tem componentes de layout granulares.

---

## 2. Design System

### 2.1 Tokens já alinhados ✅

O `index.css` do Nexa **já foi sincronizado** com o TMS (sidebar tokens, zoom 0.8, base palette, status tints, shadows, easings). Paridade visual quase completa em tokens CSS.

**O que falta:** migrar de Tailwind 3 → Tailwind 4 para poder usar `@theme {}` e `color-mix()`.

### 2.2 Sidebar — já funciona

Ambos têm:
- Rail 4rem colapsado, 15.5rem expandido (hover no desktop)
- `--sidebar-bg: #16181d` (carvão midnight)
- `--sidebar-icon-accent: #ff7a47` (laranja-ignição)
- Dark mode completo

**Diferença de implementação:** TMS usa shadcn `SidebarProvider` + `[data-slot='sidebar-inner']` selectors. Nexa usa CSS classes manuais (`.sidebar-item`, `.sidebar-root`). Ambos produzem visual equivalente — **não precisa reescrever a sidebar**.

### 2.3 Paleta de cores

| Token | Valor |
|---|---|
| `--color-primary` / `--accent-brand` | `#ff5a1f` (Laranja-Ignição) |
| `--color-navy` | `#1e3a5f` |
| `--sidebar-icon-accent` | `#ff7a47` |
| Status tints | success/warning/danger/info com pares tint+ink |

### 2.4 Tipografia e zoom

```css
zoom: 0.8;  /* dá sensação de app desktop com mais conteúdo visível */
font-family: Inter, system-ui, -apple-system;
h1, h2: system-ui, -apple-system, 'Segoe UI'…
```

Nexa já tem isso. ✅

---

## 3. Componentes TMS — Análise Detalhada

### 3.1 `StandardListPage` 🔴 GAP CRÍTICO

**O que é:** template completo para qualquer listagem.

**Props principais:**
- `icon`, `title`, `breadcrumb`, `description`
- `isLoading`, `hasData`, `error`, `onRetry` → guards automáticos
- `searchValue`, `onSearchChange`, `searchPlaceholder`
- `headerActions` (botões no header: "Novo X")
- `filtersContent`, `actionsContent`, `extraToolbar`
- `pagination` → `{ currentPage, totalPages, totalItems, itemsPerPage, onPageChange }`
- `contextPanel` / `contextPanelMode: 'sheet' | 'inline'`
- `children` → tabela/lista

**Estrutura visual:**
```
┌──────────────────────────────────────┐
│ Breadcrumb                           │
│ Ícone + Título       [headerActions] │
│ Descrição / Contagem                 │
├──────────────────────────────────────┤
│ [Busca] [Filtros] [Ações]            │
├──────────────────────────────────────┤
│ ┌─────────────────────────┐          │
│ │  tabela (scroll)        │          │
│ │                         │          │
│ ├─────────────────────────┤          │
│ │ Paginação compacta      │          │
│ └─────────────────────────┘          │
│ (+ Sheet lateral direita hover)      │
└──────────────────────────────────────┘
```

**No Nexa atual:** cada página constrói seu próprio header/busca/tabela manualmente. Ex: `ContactsPage.tsx` tem ~300 linhas de boilerplate.

### 3.2 `StandardFormPage` 🔴 GAP CRÍTICO

Template para criar/editar registros.

**Recursos:**
- `variant: 'register' | 'sales' | 'settings' | 'compact'` (largura)
- Tabs com badge de contagem
- `backPath` → botão voltar com seta
- `stickyFooter` → barra fixa com `FormActionBar`
- `incompleteSections` → links de scroll para seções com erro
- `prominentIcon` → ícone 56px (detalhe operacional)
- `titleAdornment`, `headerMeta`
- Primitivos: `FormSection`, `FormGroup`, `FormField`

**No Nexa:** formulários são construídos ad-hoc em cada página.

### 3.3 `DataTable<T>` 🔴 GAP CRÍTICO

Abstração sobre HTML table com API declarativa de colunas.

```tsx
<DataTable
  columns={[
    { id: 'name', header: 'Nome', cell: (row) => row.name, mobileTitle: true },
    { id: 'status', header: 'Status', cell: (row) => <Badge>{row.status}</Badge> },
  ]}
  rows={contacts}
  getRowId={(r) => r.id}
  onRowOpen={(r) => navigate(`/contacts/${r.id}`)}
  rowActions={(r) => [
    { label: 'Editar', onClick: () => navigate(`/contacts/${r.id}/edit`) },
    { label: 'Deletar', onClick: () => handleDelete(r.id), destructive: true },
  ]}
  empty={{ message: 'Nenhum contato encontrado', actionLabel: 'Criar contato', onAction: handleCreate }}
/>
```

**Recursos:**
- Mobile responsive: tabela no desktop, cards empilhados em `<sm`
- Seleção com checkboxes (`useListRowSelection`)
- Linha expandível (`rowExpand` + `renderExpandedRow`)
- Duplo-clique para abrir detalhe
- Estado vazio com ação
- Dense mode para tabelas compactas

**No Nexa:** `Table.tsx` é só markup `<table>` sem abstração. Cada página escreve thead/tbody à mão.

### 3.4 `PageContainer` + `PageBreadcrumbs` 🟡 GAP MODERADO

```tsx
// PageContainer controla max-width e padding
<PageContainer variant="wide" fillHeight>  // max-w-[1760px]
  <PageBreadcrumbs items={[
    { label: 'Vendas' },
    { label: 'Contatos', path: '/contacts' },
    { label: 'João Silva' },
  ]} />
  {/* conteúdo */}
</PageContainer>
```

**No Nexa:** não tem. Cada página define seu próprio padding/max-width.

### 3.5 Sistema de permissões CASL 🟡 GAP MODERADO

```tsx
// Definição
const ability = defineAbility((can) => {
  can('manage', 'Conversation');
  can('read', 'Campaign');
});

// Uso em componente
const ability = useAppAbility();
if (ability.can('create', 'Seller')) { ... }

// Guard de rota
<PermissionRoute action="read" subject="Campaign" />

// Guard de componente
<RequiresPermission action="manage" subject="User">
  <DeleteButton />
</RequiresPermission>
```

**No Nexa:** permissões são strings simples (`perms.includes('ai_control')`). Funciona, mas não escala para multi-nível.

### 3.6 `HubPage` — Páginas Hub por área 🟢 BAIXA PRIORIDADE

O TMS tem "hub pages" — landing pages por área de domínio que mostram cards de atalho para as sub-páginas da área.

```tsx
// AreaHubPage → HubPage → HubFeatureCard
<HubPage title="Logística" description="Gestão de embarques e viagens">
  <HubAreaOverview sections={[
    { title: 'Embarques', features: [shipmentCards] },
    { title: 'Viagens', features: [tripCards] },
  ]} />
</HubPage>
```

**No Nexa:** páginas são mais simples/diretas — não precisa de hub agora.

### 3.7 Sistema de Ajuda contextual 🟢 JÁ EXISTE NO NEXA

TMS tem `pageHelpMap.ts` + `PageHelpOverlay` + `HelpDrawer`.  
Nexa já tem `HelpDrawer.tsx` + `HelpDemo.tsx` com o mesmo conceito. ✅

---

## 4. O que Replicar — Prioridades

### Prioridade 1 — Templates de Página 🔴

**Por quê:** elimina ~70% do boilerplate de cada página. Maior ROI.

**Páginas Nexa que se beneficiam imediatamente:**
- `ContactsPage.tsx` → StandardListPage
- `CampaignsPage.tsx` → StandardListPage
- `SellersPage.tsx` → StandardListPage
- `OpportunitiesPage.tsx` → StandardListPage
- `KnowledgePage.tsx` → StandardListPage
- `UsersPage.tsx` → StandardListPage
- `PlaybookPage.tsx` → StandardFormPage

### Prioridade 2 — DataTable genérico 🔴

**Por quê:** todas as listas do Nexa têm tabelas escritas à mão. DataTable padroniza e adiciona mobile cards gratuitamente.

### Prioridade 3 — Migração Tailwind 3 → 4 🟡

**Por quê:** habilita `@theme {}`, `color-mix()`, `@custom-variant`. Necessário para paridade total de tokens.  
**Risco:** mudança de build — testar em branch separado.

### Prioridade 4 — PageContainer + Breadcrumbs 🟡

**Por quê:** padroniza largura máxima e navegação hierárquica.

### Prioridade 5 — shadcn/ui completo 🟡

**Por quê:** Nexa já tem componentes equivalentes. Migração incremental, não big-bang.

### Prioridade 6 — CASL 🟢

**Por quê:** sistema atual funciona. Migrar quando Nexa tiver permissões multi-nível reais.

---

## 5. Guias de Implementação

> **Princípio:** tudo é **aditivo**. Criar arquivo novo → testar → migrar uma página por vez.  
> Nunca editar o código funcionando sem ter o novo funcionando antes.

---

### 5.1 Instalar dependências novas (sem quebrar nada)

```bash
# Na pasta apps/frontend
cd apps/frontend

# shadcn/ui base (class-variance-authority já compatível com tailwind 3)
npm install class-variance-authority clsx tailwind-merge

# Ícones (heroicons é leve, sem conflito)
npm install @heroicons/react

# sonner (substitui ToastContext — migração incremental)
npm install sonner

# TanStack Table (para DataTable futuro)
npm install @tanstack/react-table
```

> **Não instalar ainda:** @casl/*, @dnd-kit/*, @react-pdf/renderer — não há necessidade imediata.

---

### 5.2 `PageContainer` — implementar

Criar `apps/frontend/src/components/layout/PageContainer.tsx`:

```tsx
import { cn } from '@/shared/lib/cn';

type PageVariant = 'wide' | 'form' | 'compact';

const variantClass: Record<PageVariant, string> = {
  wide:    'mx-auto w-full max-w-[1760px]',
  form:    'mx-auto w-full max-w-3xl',
  compact: 'mx-auto w-full max-w-xl',
};

interface PageContainerProps {
  variant?: PageVariant;
  fillHeight?: boolean;
  noPadding?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function PageContainer({
  variant = 'wide',
  fillHeight = false,
  noPadding = false,
  className,
  children,
}: PageContainerProps) {
  return (
    <div
      className={cn(
        variantClass[variant],
        !noPadding && 'px-4 py-6 sm:px-6 lg:px-8',
        fillHeight && 'flex min-h-0 flex-1 flex-col',
        className,
      )}
    >
      {children}
    </div>
  );
}
```

**Integração:** nenhuma página existente é afetada. Importar nas páginas novas.

---

### 5.3 `PageBreadcrumbs` — implementar

Criar `apps/frontend/src/components/layout/PageBreadcrumbs.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { ChevronRightIcon, HomeIcon } from '@heroicons/react/24/outline';
import { cn } from '@/shared/lib/cn';

export interface BreadcrumbItem {
  label: string;
  path?: string;
}

interface PageBreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function PageBreadcrumbs({ items, className }: PageBreadcrumbsProps) {
  const all = [{ label: 'Início', path: '/dashboard' }, ...items];

  return (
    <nav aria-label="Trilha de navegação" className={cn('flex items-center gap-1 text-xs text-fg-muted', className)}>
      {all.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRightIcon className="h-3 w-3 shrink-0 text-fg-subtle" aria-hidden />}
          {i === 0 && <HomeIcon className="h-3 w-3 shrink-0" aria-hidden />}
          {item.path && i < all.length - 1 ? (
            <Link to={item.path} className="hover:text-fg transition-colors">
              {i > 0 ? item.label : null}
            </Link>
          ) : (
            <span className={i === all.length - 1 ? 'text-fg font-medium' : ''}>
              {i > 0 ? item.label : null}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
```

---

### 5.4 `StandardListPage` — implementar (versão Nexa)

> Versão simplificada sem CASL, sem `ListContextPanel`, sem `Sheet` de painel lateral (adicionar depois se necessário).

Criar `apps/frontend/src/components/shared/StandardListPage.tsx`:

```tsx
import React from 'react';
import { cn } from '@/shared/lib/cn';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageBreadcrumbs, type BreadcrumbItem } from '@/components/layout/PageBreadcrumbs';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';

interface PaginationConfig {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange?: (limit: number) => void;
}

interface StandardListPageProps {
  icon?: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  title: string;
  breadcrumb?: BreadcrumbItem[];
  description?: string;
  totalItems?: number;
  totalShowing?: number;
  entityName?: string;
  isLoading?: boolean;
  hasData?: boolean;
  error?: unknown;
  onRetry?: () => void;
  loadingMessage?: string;
  errorTitle?: string;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;
  headerActions?: React.ReactNode;
  filtersContent?: React.ReactNode;
  actionsContent?: React.ReactNode;
  extraToolbar?: React.ReactNode;
  pagination?: PaginationConfig;
  children: React.ReactNode;
  className?: string;
}

export function StandardListPage({
  icon: Icon,
  iconColor = 'text-[var(--accent-brand)]',
  title,
  breadcrumb,
  description,
  totalItems,
  totalShowing,
  entityName = 'registros',
  isLoading = false,
  hasData = false,
  error,
  onRetry,
  loadingMessage,
  errorTitle,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Buscar...',
  headerActions,
  filtersContent,
  actionsContent,
  extraToolbar,
  pagination,
  children,
  className,
}: StandardListPageProps) {
  // Guard: loading sem dados
  if (isLoading && !hasData) {
    return <LoadingState message={loadingMessage ?? `Carregando ${entityName}...`} fullscreen />;
  }
  // Guard: erro sem dados
  if (error && !hasData) {
    return (
      <ErrorState
        title={errorTitle ?? `Erro ao carregar ${entityName}`}
        error={error as Error}
        onRetry={onRetry}
        fullscreen
      />
    );
  }

  const countLabel =
    totalItems !== undefined && totalShowing !== undefined
      ? `Mostrando ${totalShowing} de ${totalItems} ${entityName}`
      : totalItems !== undefined
      ? `${totalItems} ${entityName}`
      : null;

  return (
    <PageContainer variant="wide" fillHeight className={className}>
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Breadcrumb */}
        {breadcrumb && <PageBreadcrumbs items={breadcrumb} className="mb-4" />}

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <h1 className="flex items-center gap-3 text-xl font-semibold text-base-content">
              {Icon && <Icon className={cn('h-6 w-6', iconColor)} />}
              {title}
            </h1>
            {description && <p className="mt-1 text-sm text-base-content/60">{description}</p>}
            {countLabel && <p className="mt-1 text-sm text-base-content/60">{countLabel}</p>}
          </div>
          {headerActions && <div className="flex shrink-0 gap-2">{headerActions}</div>}
        </div>

        {/* Toolbar: busca + filtros + ações */}
        {(onSearchChange || filtersContent || actionsContent || extraToolbar) && (
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            {onSearchChange && (
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder={searchPlaceholder}
                  value={searchValue ?? ''}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="input pl-9"
                />
                <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/40" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <circle cx={11} cy={11} r={8} /><path d="m21 21-4.35-4.35" />
                </svg>
              </div>
            )}
            {extraToolbar}
            {filtersContent}
            {actionsContent}
          </div>
        )}

        {/* Cartão principal */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-base-300 bg-[var(--surface)] shadow-[var(--shadow-card)]">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {children}
          </div>
          {pagination && (
            <div className="shrink-0 border-t border-base-300 px-4 py-2">
              <Pagination
                currentPage={pagination.currentPage}
                totalPages={pagination.totalPages}
                totalItems={pagination.totalItems}
                itemsPerPage={pagination.itemsPerPage}
                onPageChange={pagination.onPageChange}
              />
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
```

**Como migrar ContactsPage (exemplo):**

```tsx
// ANTES (ContactsPage.tsx ~300 linhas)
export default function ContactsPage() {
  // ... tudo manual
  return (
    <div className="p-6">
      <h1>Contatos</h1>
      <input ... />
      <table>...</table>
    </div>
  );
}

// DEPOIS (~80 linhas)
export default function ContactsPage() {
  const { data, isLoading, error, refetch } = useQuery(contactsQuery);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  return (
    <StandardListPage
      title="Contatos"
      entityName="contatos"
      breadcrumb={[{ label: 'Vendas' }, { label: 'Contatos' }]}
      isLoading={isLoading}
      hasData={!!data}
      error={error}
      onRetry={refetch}
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Buscar por nome, telefone..."
      headerActions={<button className="btn-primary">+ Novo Contato</button>}
      totalItems={data?.total}
      totalShowing={data?.items.length}
      pagination={{ currentPage: page, totalPages: data?.pages ?? 1, ... }}
    >
      <ContactsTable contacts={data?.items ?? []} />
    </StandardListPage>
  );
}
```

---

### 5.5 `DataTable<T>` — implementar

Criar `apps/frontend/src/components/shared/DataTable.tsx`:

```tsx
import React from 'react';
import { cn } from '@/shared/lib/cn';
import { EmptyState } from '@/components/ui/EmptyState';

export interface DataTableColumn<T> {
  id: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
  width?: string;
  nowrap?: boolean;
  /** Card mobile: título em destaque */
  mobileTitle?: boolean;
  /** Card mobile: omitir coluna */
  mobileHidden?: boolean;
  /** Card mobile: rótulo curto */
  mobileLabel?: string;
}

interface RowAction {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  icon?: React.ReactNode;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  onRowOpen?: (row: T) => void;
  openOnSingleClick?: boolean;
  rowActions?: (row: T) => RowAction[];
  rowClassName?: (row: T) => string | undefined;
  empty?: { message: string; description?: string; actionLabel?: string; onAction?: () => void };
  tableClassName?: string;
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  onRowOpen,
  openOnSingleClick = false,
  rowActions,
  rowClassName,
  empty,
  tableClassName,
}: DataTableProps<T>) {
  const mobileTitleCol = columns.find((c) => c.mobileTitle);
  const mobileBodyCols = columns.filter((c) => !c.mobileHidden && c !== mobileTitleCol);

  const alignClass = (a?: string) =>
    a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : 'text-left';

  // ─── Tabela desktop ───
  const desktopTable = (
    <div className="hidden overflow-x-auto sm:block">
      <table className={cn('min-w-full divide-y divide-base-300', tableClassName)}>
        <thead className="bg-base-100/60">
          <tr>
            {columns.map((col) => (
              <th
                key={col.id}
                scope="col"
                className={cn(
                  'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-base-content/50',
                  alignClass(col.align),
                  col.headerClassName,
                )}
                style={col.width ? { width: col.width } : undefined}
              >
                {col.header}
              </th>
            ))}
            {rowActions && (
              <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-base-content/50">
                Ações
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-base-300 bg-[var(--surface)]">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (rowActions ? 1 : 0)} className="py-12 text-center">
                {empty ? (
                  <EmptyState
                    message={empty.message}
                    description={empty.description}
                    actionLabel={empty.actionLabel}
                    onAction={empty.onAction}
                  />
                ) : (
                  <span className="text-sm text-base-content/40">Nenhum registro encontrado</span>
                )}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const id = getRowId(row);
              return (
                <tr
                  key={id}
                  className={cn(
                    'transition-colors',
                    onRowOpen && 'cursor-pointer hover:bg-base-100/60',
                    rowClassName?.(row),
                  )}
                  onClick={onRowOpen && openOnSingleClick ? () => onRowOpen(row) : undefined}
                  onDoubleClick={onRowOpen && !openOnSingleClick ? () => onRowOpen(row) : undefined}
                  tabIndex={onRowOpen ? 0 : undefined}
                  onKeyDown={
                    onRowOpen
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onRowOpen(row);
                          }
                        }
                      : undefined
                  }
                >
                  {columns.map((col) => (
                    <td
                      key={col.id}
                      className={cn(
                        'px-4 py-3 text-sm text-base-content',
                        alignClass(col.align),
                        col.nowrap && 'whitespace-nowrap',
                        col.className,
                      )}
                    >
                      {col.cell(row)}
                    </td>
                  ))}
                  {rowActions && (
                    <td
                      className="px-4 py-3 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <RowActionsDropdown items={rowActions(row)} />
                    </td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );

  // ─── Cards mobile ───
  const mobileCards = (
    <div className="flex flex-col gap-3 p-3 sm:hidden">
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-base-300 p-6 text-center text-sm text-base-content/40">
          {empty?.message ?? 'Nenhum registro encontrado'}
        </div>
      ) : (
        rows.map((row) => {
          const id = getRowId(row);
          return (
            <div
              key={id}
              className={cn(
                'rounded-xl border border-base-300 bg-[var(--surface)] p-3 shadow-sm',
                onRowOpen && 'cursor-pointer hover:shadow-md transition-shadow',
                rowClassName?.(row),
              )}
              onClick={onRowOpen ? () => onRowOpen(row) : undefined}
            >
              {mobileTitleCol && (
                <div className="text-sm font-semibold text-base-content">
                  {mobileTitleCol.cell(row)}
                </div>
              )}
              <dl className={cn('grid grid-cols-[auto_1fr] gap-x-3 gap-y-1', mobileTitleCol && 'mt-2')}>
                {mobileBodyCols.map((col) => {
                  const label = col.mobileLabel ?? (typeof col.header === 'string' ? col.header : null);
                  if (!label) return <dd key={col.id} className="col-span-2 text-sm">{col.cell(row)}</dd>;
                  return (
                    <React.Fragment key={col.id}>
                      <dt className="text-[11px] font-medium uppercase tracking-wide text-base-content/40">{label}</dt>
                      <dd className="text-sm text-base-content">{col.cell(row)}</dd>
                    </React.Fragment>
                  );
                })}
              </dl>
              {rowActions && (
                <div className="mt-2 flex justify-end" onClick={(e) => e.stopPropagation()}>
                  <RowActionsDropdown items={rowActions(row)} />
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <>
      {desktopTable}
      {mobileCards}
    </>
  );
}

// ─── Dropdown de ações da linha ───
function RowActionsDropdown({ items }: { items: { label: string; onClick: () => void; destructive?: boolean }[] }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-base-content/40 transition-colors hover:bg-base-200 hover:text-base-content"
        aria-label="Ações"
      >
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm-2 6a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 min-w-[10rem] overflow-hidden rounded-xl border border-base-300 bg-[var(--surface-elevated)] shadow-elevated">
          {items.map((item, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { item.onClick(); setOpen(false); }}
              className={cn(
                'flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-base-100',
                item.destructive ? 'text-red-600' : 'text-base-content',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

### 5.6 `StandardFormPage` — implementar (versão Nexa)

Criar `apps/frontend/src/components/shared/StandardFormPage.tsx`:

```tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/shared/lib/cn';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageBreadcrumbs, type BreadcrumbItem } from '@/components/layout/PageBreadcrumbs';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';

export interface TabItem {
  id: string;
  label: string;
  badge?: number;
}

interface StandardFormPageProps {
  icon?: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  iconBg?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  description?: string;
  breadcrumb?: BreadcrumbItem[];
  backPath?: string;
  backLabel?: string;
  isLoading?: boolean;
  hasData?: boolean;
  error?: unknown;
  onRetry?: () => void;
  loadingMessage?: string;
  errorTitle?: string;
  tabs?: TabItem[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  headerActions?: React.ReactNode;
  footerActions?: React.ReactNode;
  stickyFooter?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function StandardFormPage({
  icon: Icon,
  iconColor = 'text-[var(--accent-brand)]',
  iconBg = 'bg-orange-50',
  title,
  subtitle,
  description,
  breadcrumb,
  backPath,
  backLabel = 'Voltar',
  isLoading = false,
  hasData = false,
  error,
  onRetry,
  loadingMessage,
  errorTitle,
  tabs,
  activeTab,
  onTabChange,
  headerActions,
  footerActions,
  stickyFooter = false,
  children,
  className,
}: StandardFormPageProps) {
  const navigate = useNavigate();

  if (isLoading && !hasData) return <LoadingState message={loadingMessage ?? 'Carregando...'} fullscreen />;
  if (error && !hasData) return <ErrorState title={errorTitle ?? 'Erro ao carregar'} error={error as Error} onRetry={onRetry} fullscreen />;

  return (
    <PageContainer variant="wide" className={className}>
      {/* Breadcrumb */}
      {breadcrumb && <PageBreadcrumbs items={breadcrumb} className="mb-4" />}

      {/* Botão voltar */}
      {backPath && (
        <button
          type="button"
          onClick={() => navigate(backPath)}
          className="mb-4 flex items-center gap-2 text-sm text-base-content/60 transition-colors hover:text-base-content"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          {backLabel}
        </button>
      )}

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-lg', iconBg)}>
              <Icon className={cn('h-7 w-7', iconColor)} />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-base-content">{title}</h1>
            {description && <p className="mt-1 text-sm text-base-content/60">{description}</p>}
            {subtitle && <div className="mt-1 text-sm text-base-content/60">{subtitle}</div>}
          </div>
        </div>
        {headerActions && (
          <div className="flex shrink-0 items-center gap-2">{headerActions}</div>
        )}
      </div>

      {/* Tabs */}
      {tabs && tabs.length > 0 && onTabChange && (
        <div className="mb-6 border-b border-base-300">
          <nav className="flex space-x-6 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap border-b-2 pb-3 text-sm font-medium transition-colors',
                  activeTab === tab.id
                    ? 'border-[var(--accent-brand)] text-[var(--accent-brand)]'
                    : 'border-transparent text-base-content/60 hover:text-base-content',
                )}
              >
                {tab.label}
                {tab.badge != null && tab.badge > 0 && (
                  <span className="rounded-full bg-base-200 px-1.5 py-0.5 text-xs text-base-content/60">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      )}

      {/* Conteúdo */}
      <div className={cn('space-y-6', stickyFooter && 'pb-28')}>{children}</div>

      {/* Footer */}
      {footerActions && (
        stickyFooter ? (
          <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-base-300 bg-[var(--surface)] px-6 py-4 shadow-[var(--shadow-up)] sm:left-16">
            <div className="mx-auto flex max-w-[1760px] items-center justify-end gap-3">
              {footerActions}
            </div>
          </div>
        ) : (
          <div className="mt-8 flex items-center justify-end gap-3 border-t border-base-300 pt-6">
            {footerActions}
          </div>
        )
      )}
    </PageContainer>
  );
}

// Primitivos de formulário
export function FormSection({ title, description, children }: { title?: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-base-300 bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
      {(title || description) && (
        <div className="mb-4">
          {title && <h2 className="text-base font-semibold text-base-content">{title}</h2>}
          {description && <p className="mt-1 text-sm text-base-content/60">{description}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

export function FormGroup({ cols = 1, children }: { cols?: 1 | 2 | 3 | 4; children: React.ReactNode }) {
  const gridClass = { 1: '', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' }[cols];
  return <div className={cn('grid grid-cols-1 gap-4', gridClass)}>{children}</div>;
}

export function FormField({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-base-content/80">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
```

---

### 5.7 Migrar Tailwind 3 → 4

> **Fazer em branch separado. Não misturar com outras mudanças.**

```bash
# 1. Instalar
npm install -D tailwindcss@^4 @tailwindcss/vite@^4 @tailwindcss/postcss@^4

# 2. Substituir em vite.config.ts
import tailwindcss from '@tailwindcss/vite';
// remover: import tailwindcss from 'tailwindcss'

# 3. Atualizar index.css
# ANTES:
@tailwind base;
@tailwind components;
@tailwind utilities;
# DEPOIS:
@import 'tailwindcss';

# 4. Mover tokens para @theme {}
@theme {
  --color-primary:     #ff5a1f;
  --color-navy:        #1e3a5f;
  # ... etc
}

# 5. Remover tailwind.config.ts (em Tailwind 4, config é via CSS)
# 6. Testar toda a UI
```

**Benefícios pós-migração:**
- `color-mix()` nativo (fg-muted, fg-subtle)
- `@custom-variant dark` em vez de selector manual
- `@source` para escanear arquivos TypeScript
- Utilitários `primary-*`, `surface-*`, `fg-*` via `@theme`

---

### 5.8 Sistema de notificações — migrar para sonner

Instalar e configurar:

```bash
npm install sonner
```

Em `main.tsx` ou `App.tsx`:
```tsx
import { Toaster } from 'sonner';
// Dentro do JSX raiz:
<Toaster position="bottom-right" richColors />
```

Uso em qualquer componente:
```tsx
import { toast } from 'sonner';
toast.success('Contato criado!');
toast.error('Erro ao salvar');
toast.promise(saveContact(), {
  loading: 'Salvando...',
  success: 'Salvo!',
  error: 'Erro ao salvar',
});
```

Manter `ToastContext` existente durante transição — migrar página a página.

---

## 6. Ordem de Implementação Recomendada

> Cada fase é autônoma e não quebra código existente.

### Fase A — Fundação de layout (1–2 dias)
1. Instalar `clsx`, `tailwind-merge`, `@heroicons/react`
2. Criar `PageContainer.tsx`
3. Criar `PageBreadcrumbs.tsx`
4. Criar `StandardListPage.tsx` (versão básica)
5. Migrar **uma** página de teste → `ContactsPage.tsx`
6. Validar visual

### Fase B — DataTable (1 dia)
1. Criar `DataTable.tsx`
2. Criar `DataTableColumn` types
3. Migrar tabela de contatos para DataTable
4. Testar mobile responsivo

### Fase C — StandardFormPage (1 dia)
1. Criar `StandardFormPage.tsx` com primitivos
2. Migrar `PlaybookPage.tsx` (formulário simples como teste)
3. Validar tabs + footer sticky

### Fase D — Migração em massa (2–3 dias)
Migrar todas as páginas de listagem para StandardListPage:
- ContactsPage ✓ (fase A)
- CampaignsPage
- SellersPage
- OpportunitiesPage
- KnowledgePage
- UsersPage

### Fase E — Tailwind 4 (branch separado, 1 dia)
- Migrar build
- Mover tokens para `@theme {}`
- Remover tailwind.config.ts

### Fase F — sonner + CASL (quando necessário)
- sonner: migrar conforme as páginas forem tocadas
- CASL: só quando houver permissões multi-nível no produto

---

## 7. O que NÃO replicar

| Feature TMS | Motivo para não replicar |
|---|---|
| `HubPage` / AreaHub | Nexa é mais simples, sem necessidade de páginas-hub |
| `@react-pdf/renderer` | Sem necessidade de PDF no cliente agora |
| `@dnd-kit/*` / drag-drop | Sem caso de uso no Nexa |
| CASL completo | Permissões atuais são suficientes |
| `TanStack Table` | `DataTable.tsx` custom cobre 100% dos casos |
| `react-leaflet` | Sem mapas no Nexa |
| `react-input-mask` | Usar pattern nativo ou lib quando necessário |

---

## 8. Checklist de Execução

### Fase A — Fundação
- [ ] `npm install clsx tailwind-merge @heroicons/react`
- [ ] Criar `src/components/layout/PageContainer.tsx`
- [ ] Criar `src/components/layout/PageBreadcrumbs.tsx`
- [ ] Criar `src/components/shared/StandardListPage.tsx`
- [ ] Migrar `ContactsPage.tsx` → teste de validação

### Fase B — DataTable
- [ ] Criar `src/components/shared/DataTable.tsx`
- [ ] Migrar tabela de `ContactsPage` para `DataTable`
- [ ] Testar mobile (< 640px)

### Fase C — StandardFormPage
- [ ] Criar `src/components/shared/StandardFormPage.tsx`
- [ ] Migrar `PlaybookPage.tsx` como teste

### Fase D — Migração em massa
- [ ] CampaignsPage → StandardListPage
- [ ] SellersPage → StandardListPage
- [ ] OpportunitiesPage → StandardListPage
- [ ] KnowledgePage → StandardListPage
- [ ] UsersPage → StandardListPage

### Fase E — Tailwind 4 (branch separado)
- [ ] Criar branch `feat/tailwind-4`
- [ ] Migrar dependências
- [ ] Migrar CSS (@import, @theme)
- [ ] Testar visual completo
- [ ] Merge após aprovação

### Fase F — Sonner
- [ ] `npm install sonner`
- [ ] Adicionar `<Toaster>` em `App.tsx`
- [ ] Migrar toasts conforme páginas forem tocadas

---

## Referências de Código

| Arquivo TMS (leitura) | Arquivo Nexa (criar) |
|---|---|
| `components/layout/AppLayout.tsx` | Já equivalente em `components/Layout.tsx` |
| `components/layout/PageContainer.tsx` | `components/layout/PageContainer.tsx` ← criar |
| `components/layout/PageBreadcrumbs.tsx` | `components/layout/PageBreadcrumbs.tsx` ← criar |
| `components/shared/StandardListPage.tsx` | `components/shared/StandardListPage.tsx` ← criar |
| `components/shared/StandardFormPage.tsx` | `components/shared/StandardFormPage.tsx` ← criar |
| `components/shared/StandardViewPage.tsx` | `components/shared/StandardViewPage.tsx` ← criar (wrap do FormPage) |
| `components/shared/data-table/DataTable.tsx` | `components/shared/DataTable.tsx` ← criar |
| `styles/globals.css` (`@theme {}`) | `index.css` — já alinhado em tokens, migrar sintaxe na Fase E |
