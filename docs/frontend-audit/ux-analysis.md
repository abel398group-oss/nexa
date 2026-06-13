# Análise de UX + Inventário de Telas — HiperTMS → Nexa

> Padrões de experiência do HiperTMS e o inventário de telas (TMS e Nexa).
> **Importante:** o HiperTMS é um TMS (frete); suas telas de negócio (fiscal, frota,
> financeiro…) **não** se replicam 1:1 no Nexa (produto diferente — IA comercial/suporte).
> O que se replica são os **padrões visuais e de UX**, não os módulos específicos.

## 1. Padrões de UX

### Fluxos CRUD

| Fluxo | Padrão |
|---|---|
| **Cadastro** | Botão primário "+ Novo" no header → **modal com formulário** (ou página de formulário em telas grandes) → salvar → toast de sucesso → recarrega a lista |
| **Edição** | Ícone ✏️ na linha → mesmo modal/página pré-preenchido → salvar → toast |
| **Exclusão** | Ícone 🗑️ → **ConfirmModal** ("Tem certeza? Não pode ser desfeito") → confirma → toast |
| **Confirmação** | `ConfirmModal` (TMS) / `useConfirm()` (Nexa) com variantes `danger`/`warning`/`info`; Esc=cancela, Enter=confirma |
| **Ação em massa** | Seleção por checkbox → barra de ações contextual (ex.: Nexa Contatos: criar campanha / +tag / excluir) |

### Feedback visual (não negociável)

- **Toast** para sucesso/erro de ações (`ToastContext` no Nexa).
- **Validação inline** em formulários (mensagem vermelha sob o campo / erro do backend).
- **Estados de coleção:**
  - **Loading** → `LoadingState` (spinner + label) ou `Skeleton`/`SkeletonList`.
  - **Vazio** → `EmptyState` (ícone + título + descrição + ação).
  - **Erro** → `ErrorState` (moldura de alerta + botão "Recarregar").
- **Status como pílulas de tinta** (`StatusBadge`) com vocabulário semântico (success/warning/danger/info/neutral).
- **Highlight de atenção:** cards/itens que exigem ação ganham anel/acento na cor do estado
  (ex.: conversas escaladas, prioridade crítica pulsando).

### Voz / copy

- **pt-BR sempre.** Direta, segunda pessoa, foco em benefício. Sentence case em títulos/botões;
  UPPERCASE só em eyebrows. CTAs verbo-primeiro. Moeda `R$` formatação pt-BR.
- **TMS:** **sem emoji** no produto. **Nexa:** usa emoji em alguns lugares (decisão a alinhar —
  ver gap-analysis).
- **Anti-alucinação** (IA): se a Lia não sabe, diz "não encontrei, vou encaminhar" — nunca inventa.

### Motion / microinterações

- Entradas suaves (`ease-entrance`), transições de layout (`ease-layout`), hover com leve
  elevação em cards. Respeita `prefers-reduced-motion`. Tour guiado com highlight laranja.

## 2. Inventário de telas

### HiperTMS (por módulo — padrões a observar)

| Módulo | Telas (exemplos) | Padrão de tela |
|---|---|---|
| **auth** (público) | LoginPage, SignupPage, ForgotPasswordPage | Card centralizado com borda laranja em degradê + glow |
| **public/landing** | LandingPage (hero, bento, pricing, FAQ) | Hero escuro com glows + card de exemplo |
| **dashboard** | DashboardPage, TodayCockpitPage | Grid de `MetricCard` + gráficos |
| **directory** | Company List/Detail/Create/Edit, Clients, Carriers, Suppliers | **List page** (tabela + filtros) / **Detail page** / **Form page** |
| **finance** | Accounts, Receivables, Sales Invoices, Budget, FinanceDashboard | List + detail + dashboard |
| **fiscal** | CTe List/Detail, MDFe List/Detail | List + detail |
| **fleet** | Drivers, Maintenance, Fuel… | List + form |
| **logistic** | Quotes (cotações), criar cotação | List + form complexo |
| **commercial / pricing / platform-admin / account / onboarding** | contratos, planos, admin de plataforma, conta, wizard | List/form/wizard |

**Padrões de tela canônicos (o que importa replicar):**
1. **List page:** header (título + ação) → filtros/busca → tabela (paginação/seleção) → estados.
2. **Detail page:** header com status → blocos de informação em cards → ações.
3. **Form page/modal:** campos agrupados → validação → footer com Cancelar/Salvar.
4. **Dashboard:** eyebrow de seção → grid de `MetricCard` → gráficos → detalhes.

### Nexa (telas atuais)

| Tela | Finalidade | Componentes | Layout |
|---|---|---|---|
| **LandingPage** (`/`) | Apresentação do produto | hero, cards, CTA, signature | público |
| **LoginPage** (`/login`) | Autenticação | Input, Button, Alert, card glow | centralizado |
| **DashboardPage** | Métricas (contatos, conversas, IA, **engajamento de campanhas**) | MetricCard, SectionTitle | app + grid |
| **InboxPage** | Atendimento em tempo real | lista (avatar+badges), bolhas, timeline, composer | 3 colunas |
| **SupportPage** | Tickets de suporte da Lia | Card, Table, Select, StatusBadge, estados | app + tabela |
| **ContactsPage** | CRM de contatos | Table, **tags+seleção em massa+histórico**, Modal, Input/Select | app + tabela |
| **KnowledgePage** | Base de conhecimento da Lia | lista + editor (Input/Textarea), Card | 2 colunas |
| **SellersPage** | Vendedores (round-robin) | Card, Input, Button, Badge | app |
| **CampaignsPage** (Disparo) | Campanhas WhatsApp/e-mail | Card clicável, Modal (público/detalhe/engajamento), Button | app |
| **PlaybookPage** | Playbook de vendas da Lia | Card, Input, Textarea, Button | app |
| **UsersPage** | Usuários & acessos | Card, Modal, Input, Select | app |
| **EmailChannelSettingsPage** | Config do canal de e-mail | form (Input, Switch), Button | settings |
| **DevTokensPage** | Vitrine de tokens (dev) | demonstração das classes | — |

## 3. Lacunas de UX no Nexa

- **Breadcrumb** ausente (TMS tem `PageBreadcrumbs`).
- **PageHeader/PageContainer** padronizados (cada tela monta o próprio header).
- **Emoji no produto:** o TMS não usa; o Nexa usa em vários lugares — decisão de padronização.
- **Ordenação de tabela** por coluna não padronizada.
- Sidebar sem **agrupamento por seções** (o TMS agrupa por módulo).
