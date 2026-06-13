# Auditoria Fina de Fidelidade — Nexa × HiperTMS (Fase 5)

> Objetivo: depois das Fases 1–4 (shell, moldura de página, componentes, remoção de
> emoji), validar **tela a tela** que o Nexa pertence à mesma família visual do
> HiperTMS e corrigir desvios finos de pixel, cor, espaçamento e tipografia.

Este documento tem duas partes: (1) o **estado atual verificado por código** e
(2) o **checklist de comparação visual lado a lado** — que precisa ser rodado com
os dois apps abertos no navegador, pois é a única forma de pegar desvios de pixel.

---

## 1. Estado atual (verificado por código)

### Tokens de identidade — espelhados ✅

Conferidos em `apps/frontend/src/index.css`:

- **Sidebar**: `--sidebar-bg #16181d`, `--sidebar-icon-accent #ff7a47`, hover/active
  em `rgba(255,255,255,.07/.13)`, texto `.56 → .93` no hover — mesma escala do TMS.
- **Surfaces**: `--surface`, `--surface-muted`, `--surface-elevated #fff`.
- **Borders**: `--border #e6e6e3`, `--border-input #d4d4d8`.
- **Texto**: `--text-primary/secondary/muted`.
- **Sombras**: `--shadow-card`, `--shadow-card-hover`, `--shadow-elevated`,
  `--shadow-up`, `--shadow-inner-soft`.
- **Glows**: `--shadow-glow-brand/danger/success`.
- **Dark** por `.dark` com a paleta de sidebar reescalada.

### Shell e moldura — em paridade ✅

- **Sidebar** rail-que-expande-no-hover, grupos com seções UPPERCASE, marca
  símbolo→wordmark, ícone ativo laranja + barra à esquerda (`components/Layout.tsx`).
- **Header** com `TenantSelector` (reusa `@/contexts/TenantContext`,
  `X-Acting-Tenant-Id`), `DateRangePicker`, `NotificationBell`, tema claro/escuro,
  command palette (Ctrl+K) com ícones de linha.
- **Moldura de página** `PageContainer` + `PageHeader` + `Breadcrumb` aplicada em
  Dashboard, Disparo, Vendedores, Usuários, Canal de E-mail, Playbook e Suporte.

### Componentes — paridade de comportamento ✅

- **Chart** (Recharts) aplicado no funil de campanhas do Dashboard.
- **Tabela** com ordenação por coluna (`SortableTH` + `useTableSort`).
- **Button** com tamanhos `xs`/`icon-xs|sm|lg` e focus ring 3px.
- **Calendar** (react-day-picker) + **DateRangePicker** no design system.
- **EmptyState/ErrorState/LoadingState/Skeleton** padronizados.

### Sem emoji no produto ✅

Todo o produto renderizado usa o icon set de linha (`components/ui/icons.tsx`,
~45 ícones). Nenhum `.emoji` é mais lido em render. **Única exceção intencional**:
os recibos de entrega `✓ / ✓✓` no Inbox (`pages/InboxPage.tsx`), convenção
monocromática do WhatsApp — não são emoji colorido.

---

## 2. Desvios finos identificados (código) e recomendações

| # | Onde | Observação | Recomendação |
|---|------|-----------|--------------|
| F5-1 | `ContactsPage`, `KnowledgePage` | Cabeçalho próprio usa `<h1 text-lg>` em vez do `text-xl` do `PageHeader` | Manter (são *list/master-detail* com toolbar compacta) **ou** subir para `text-xl` se quiser título idêntico ao das demais telas |
| F5-2 | `InboxPage`, `KnowledgePage`, `ContactsPage` | Layout próprio (3 colunas / master-detail / toolbar fixa) fora do `PageContainer` | Correto — são os moldes *Detail/List* do TMS; só receberam `Breadcrumb` |
| F5-3 | `DateRangePicker` | Período personalizado usa `<input type=date>` nativo | Funciona; se quiser o popover de calendário do TMS, trocar pelo `Calendar` (react-day-picker) já disponível |
| F5-4 | `lib/conversation-status.ts`, `lib/ticket-category.ts` | Campos `emoji:` continuam nos dados, mas **nenhum render os lê** | Dados mortos — remover numa limpeza para reduzir ruído |
| F5-5 | Ícones novos | `play/pause/trash/...` desenhados à mão (stroke 1.8, 24×24) | Conferir no claro/escuro lado a lado; ajustar paths se algum destoar do Heroicons do TMS |

> Dependências: `recharts`, `react-day-picker`, `date-fns` já estão no
> `package.json` — rodar `pnpm install` antes do build. Validar com `pnpm build`
> (o `tsc` confere todos os nomes de ícone novos).

---

## 3. Checklist de comparação visual (lado a lado)

Rodar com **HiperTMS** e **Nexa** abertos lado a lado (mesma tela, claro e escuro).
Marcar ✅ quando idêntico ou anotar o desvio.

### Global
- [ ] Sidebar: largura colapsada/expandida, easing do hover, sombra ao expandir
- [ ] Sidebar: cor do ícone ativo, barra à esquerda, peso do label
- [ ] Header: altura, alinhamento, espaçamento entre ações
- [ ] Tipografia: família (Inter), pesos, tracking dos títulos; tabular nos números
- [ ] Raios (`rounded-md/lg/xl/3xl`) e sombras dos cards
- [ ] Dark mode: contraste de surface/border/texto

### Por tela (Dashboard, Disparo, Contatos, Vendedores, Suporte, Conhecimento, Usuários, Inbox, Playbook, Canal de E-mail)
- [ ] Cabeçalho: breadcrumb, título, subtítulo, ações alinhados como no TMS
- [ ] Grid/spacing dos cards e seções
- [ ] Tabela: altura de linha, header, hover, ordenação
- [ ] Estados: loading/skeleton, vazio, erro
- [ ] Cores exatas de badges/status
- [ ] Botões: tamanhos, ícones, estados (hover/focus/disabled/loading)

### Aceite final
- [ ] Abrir TMS e Nexa lado a lado: percepção de **mesma família** em < 2s
- [ ] Nenhum emoji visível no produto (exceto recibos `✓/✓✓` do Inbox)
- [ ] `pnpm build` sem erros

---

## 4. Como rodar o diff visual

1. Subir o HiperTMS (portas do MVP) e o Nexa (`:5174`).
2. Abrir as duas no navegador, mesma rota, lado a lado.
3. Alternar claro/escuro nas duas.
4. Para cada item do checklist acima, anotar o desvio (cor/spacing/tamanho) com
   print, e abrir tarefa de ajuste fino referenciando o arquivo/linha.
