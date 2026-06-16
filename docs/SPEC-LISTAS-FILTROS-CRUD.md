# Spec de Implementação — Padrão de Listas, Filtros e CRUD

> **Para o squad de implementação.** Objetivo: padronizar busca, filtros, criar,
> editar, excluir, ações em lote e paginação em todos os módulos de listagem do
> Nexa, replicando o padrão já consolidado em **Contatos**.
>
> Data: 2026-06 · Autor da análise: Aria (Architect) · Status: pronto para execução

---

## 1. Objetivo e escopo

Hoje o módulo **Contatos** tem o conjunto completo (busca, filtro por tag, criar,
editar, excluir, exclusão em lote, paginação). Outros módulos têm só parte disso.
Esta spec define o **padrão canônico** e lista, por módulo, o que falta — com
tarefas e critérios de aceite — para o squad executar sem reinventar.

**Fora do escopo:** Inbox/Support/Conversations e Notificações são *feeds/visões
de conversa*, não listas CRUD; têm busca/filtro próprios e não recebem
editar/excluir/lote (ver §6).

---

## 2. Matriz de capacidades (estado atual)

> **Atualizado em 2026-06** após auditoria do código: os gaps de Knowledge e
> Sellers foram fechados (FE + BE); Users e Playbook ainda têm pendências; surgiu
> o módulo **Opportunities** (pipeline de vendas, backend pronto, **sem página**).

Legenda: ✅ existe · ⚠️ parcial · ❌ falta · — não se aplica

| Módulo | Busca | Filtros | Criar | Editar | Excluir | Lote | Paginação | Onde está o gap |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|---|
| **Contatos** (referência) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ref. de busca/filtro/CRUD/lote; paginação só no backend (UI: ver Campanhas) |
| **Campanhas** (ref. paginação) | ✅ | ⚠️ | ✅ | — | ✅ | ✅ | ✅ | editar (rever se aplica) — **referência de paginação na UI** |
| **Knowledge** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ concluído (FE + BE) |
| **Sellers** | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ concluído (FE + BE) |
| **Users** | ✅ | ⚠️ | ✅ | ❌ | ✅ | ❌ | ✅ | falta **editar (UI)** e lote |
| **Playbook** | ❌ | ❌ | ✅ | ⚠️ | ❌ | ❌ | ⚠️ | frontend + backend (busca/delete/paginação) |
| **Opportunities** (novo) | ✅ | ✅ (stage) | ✅ | ✅ | ✅ | ❌ | ✅ | **sem página no frontend** (backend pronto: CRUD + summary + stage) |
| Conversations/Inbox | ✅ | ✅ | — | ⚠️ | — | — | ✅ | feed de conversa (§6); arquivar = `conversation-archive` |
| Notificações | — | — | — | — | — | — | ✅ | feed (§6) |

**Prioridade restante:** Users (editar UI) → Playbook → criar a página de Opportunities.

---

## 3. Padrão canônico — Backend (NestJS)

Referência: `apps/backend/src/presentation/http/contacts/contacts.controller.ts` +
`apps/backend/src/application/contacts/contacts.service.ts`.

### 3.1 Controller

```ts
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePerm('<feature>')               // RBAC por recurso
@Controller('<feature>')
export class <Feature>Controller {
  @Get()                                 // lista: busca + filtro + paginação
  findAll(@CurrentTenant() tenantId: string,
          @Query() q: PaginationQueryDto,
          @Query('<filtro>') filtro?: string) {
    return this.svc.findAll(tenantId ?? 'default', q, filtro);
  }

  @Get('<opcoes-de-filtro>')             // ex.: /tags — DEFINIR ANTES de :id
  options(@CurrentTenant() t: string) { return this.svc.options(t); }

  @Get(':id')   findOne(...)             // detalhe
  @Post()       create(@Body() dto: Create<Feature>Dto)
  @Patch(':id') update(@Body() dto: Update<Feature>Dto)
  @Delete(':id') remove(...)
  @Post('bulk-delete') bulkDelete(@Body() body: BulkDeleteDto)  // { ids: string[] }
}
```

Regras obrigatórias:

- **DTOs com `class-validator` sempre.** O `ValidationPipe` global usa
  `whitelist + forbidNonWhitelisted` — tipos inline `{ ids }` são descartados.
  Criar `BulkDeleteDto { @IsArray() @IsString({each:true}) ids!: string[] }`.
- **Rotas estáticas antes de `:id`** (ex.: `@Get('tags')` antes de `@Get(':id')`),
  senão "tags" casa como id.
- **`@RequirePerm('<feature>')`** em toda rota da feature (admin passa sempre).
- Paginação usa o `PaginationQueryDto` compartilhado (`shared/dto/pagination.dto.ts`):
  `?limit=50&offset=0&search=`.

### 3.2 Service

```ts
async findAll(tenantId: string, q: PaginationQueryDto, filtro?: string): Promise<Paginated<T>> {
  const where: any = { tenantId };                       // SEMPRE escopar por tenant
  if (q.search) where.OR = [
    { nome:  { contains: q.search, mode: 'insensitive' } },
    { email: { contains: q.search, mode: 'insensitive' } },
  ];
  if (filtro) where.<campo> = filtro;
  const [items, total] = await Promise.all([
    this.prisma.<model>.findMany({ where, skip: q.offset, take: q.limit, orderBy: { createdAt: 'desc' } }),
    this.prisma.<model>.count({ where }),
  ]);
  return { items, total };
}

async update(tenantId, id, dto) { await this.findOne(tenantId, id); return this.prisma.<m>.update({ where:{id}, data: dto }); }
async remove(tenantId, id)      { await this.findOne(tenantId, id); await this.prisma.<m>.delete({ where:{id} }); }
async deleteMany(tenantId, ids) { return this.prisma.<m>.deleteMany({ where: { id: { in: ids }, tenantId } }); }
```

Invariantes:

- **Isolamento por tenant em TODA query** (`where.tenantId`). `tenantId` vem do
  contexto (`@CurrentTenant`), nunca do body. Em modo platform-admin, respeitar o
  `effectiveTenantId` (ADR 025).
- **Validar posse antes de update/delete** (`findOne(tenantId, id)` → 404 se não for do tenant).
- `deleteMany` sempre com `tenantId` no `where` (não apagar de outro tenant).
- Resposta de lista: `{ items, total }` (`Paginated<T>`).

---

## 4. Padrão canônico — Frontend (React + design system)

Referência de busca/filtro/criar/editar/excluir/lote: `ContactsPage.tsx`.
Referência de **paginação na UI** (estado `limit/offset/page`): `CampaignsPage.tsx`.
Componentes em `components/ui/`.

### 4.1 Componentes do design system a usar

`Table`, `Pagination`, `Modal` (criar/editar), `Input` (busca), `Select`
(filtros), `Checkbox` (seleção em lote), `Button`, `Badge`/`StatusBadge`,
`EmptyState`, `LoadingState`, `ErrorState`. Confirmação de exclusão via
`ConfirmContext` (`useConfirm`); feedback via `ToastContext` (`useToast`).

### 4.2 Estado e fluxo da página

```
search (debounce ~300ms)  ─┐
filtros (Select)           ├─→ query → GET /api/<feature>?limit&offset&search&<filtro>
page/limit                 ┘            → { items, total }
selectedIds: Set<string>   → barra de ações em lote quando size > 0
modal: { open, mode: 'create'|'edit', target? }  → POST / PATCH
```

Regras:

- **Busca com debounce**; resetar `offset` ao mudar busca/filtro.
- **Editar** reaproveita o mesmo `Modal` do criar (modo `edit` pré-preenche o form).
- **Excluir** sempre passa por `useConfirm()` (diálogo) antes do `DELETE`; toast no fim.
- **Lote**: checkbox no header (selecionar todos da página) + por linha; barra de
  ações aparece com `selectedIds.size > 0` → `POST /bulk-delete { ids }`; limpar seleção após.
- **Estados vazios/carregando/erro** com `EmptyState`/`LoadingState`/`ErrorState`.
- **Permissões**: esconder ações de escrita/exclusão conforme `role`/`permissions`
  (espelha `@RequirePerm` do backend).
- Catalogar componentes novos no Storybook quando criados.

---

## 5. Tarefas por módulo (para o squad)

> Cada tarefa segue a **Definition of Done** da §7.

### 5.1 Knowledge — ✅ CONCLUÍDO (FE + BE)
Busca, filtro por categoria, paginação, criar/editar/excluir e **exclusão em lote**
implementados no `KnowledgePage` + `knowledge.service`. Sem pendências.

### 5.2 Sellers — ✅ CONCLUÍDO (FE + BE)
`findAll` com paginação/busca, criar/editar/excluir e lote implementados. Sem pendências.

### 5.3 Users — parcial (falta editar UI + lote)
Backend já tem paginação/busca e `@Delete(':id')`. Frontend já tem busca, paginação
e excluir. **Pendente:**
- [ ] Frontend: UI de **editar** (modal — backend já tem `PATCH`).
- [ ] (Opcional) seleção + exclusão em lote.
- [ ] Garantir: impedir auto-exclusão do próprio admin; respeitar permissões.

### 5.4 Playbook — pendente (FE + BE)
- [ ] Backend: `findAll` com paginação + busca; `@Delete(':id')` + `remove`.
- [ ] Frontend: lista com busca, editar (modal), excluir, paginação.
- [ ] Confirmação + toasts.

### 5.5 Opportunities — falta a página (backend pronto)
O backend (`opportunities.service`/controller) já tem CRUD + `summary` + filtro por
`stage` + paginação/busca. **Pendente:**
- [ ] Frontend: criar a **OpportunitiesPage** (lista do pipeline por estágio
      new→qualified→proposal→won/lost, com busca, filtro de stage, criar/editar/excluir).
- [ ] Rota no `App.tsx` + item no menu (com permissão adequada).

### 5.6 Campanhas — revisão
- [ ] Decidir com produto se campanha é **editável** após criada (hoje não há
      `PATCH`). Se sim, adicionar `update` (backend + modal). Se não, documentar
      como decisão (não é gap).

---

## 6. Fora do padrão CRUD (tratar diferente)

- **Inbox / Support / Conversations**: visão de conversa em tempo real
  (socket.io). Já têm busca/filtro por status/categoria e paginação. **Não**
  recebem criar/editar/excluir/lote de "registro". Manter o padrão de filtros
  de conversa (`components/conversation/`).
- **Notificações**: feed; marcar como lida (`PATCH :id/read`), sem CRUD completo.

---

## 7. Definition of Done (checklist reutilizável)

Backend:
- [ ] `findAll` escopado por `tenantId`, com `search` (contains insensitive) e paginação `{items,total}`.
- [ ] `update`/`remove` validam posse (`findOne(tenantId,id)`); `deleteMany` com `tenantId` no `where`.
- [ ] DTOs com `class-validator`; rotas estáticas antes de `:id`; `@RequirePerm`.
- [ ] Respeita `effectiveTenantId` em modo platform-admin (ADR 025); ações irreversíveis auditadas.
- [ ] Teste(s) cobrindo list+filtro, update/delete e isolamento por tenant.

Frontend:
- [ ] Busca com debounce, filtros, paginação; reset de offset ao filtrar.
- [ ] Criar/editar no mesmo `Modal`; excluir via `useConfirm` + toast.
- [ ] Seleção e exclusão em lote com barra de ações.
- [ ] Estados `Empty`/`Loading`/`Error`; ações de escrita gated por permissão.
- [ ] Componentes do `components/ui/` (sem CSS/ópa fora do design system); stories quando novo.

---

## 8. Referências

- **Referência viva (copiar daqui):** `contacts.controller.ts` · `contacts.service.ts` · `ContactsPage.tsx` (CRUD/filtro/lote) · `CampaignsPage.tsx` (paginação UI)
- Paginação: `apps/backend/src/shared/dto/pagination.dto.ts`
- Design system / componentes: `apps/frontend/src/components/ui/` (Storybook: `pnpm storybook`)
- Padrões: `docs/api/api-standards.md` · `docs/api/naming-conventions.md`
- Segurança/tenant: `docs/security/security-overview.md` · ADR 005 · ADR 025
- Arquitetura: `docs/architecture/frontend-architecture.md` · `docs/architecture/codebase-structure.md`
