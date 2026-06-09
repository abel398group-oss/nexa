# ADR 002 — Frontend Stack

- **Status**: Aceito (revisado em 2026-06-09 — ver nota de atualização)
- **Revisado por**: ADR 014

---

## Contexto

Definição da stack de frontend do Nexa, plataforma de IA comercial B2B.
O frontend é o painel de operação da Lia (assistente de vendas/suporte via WhatsApp).

---

## Decisão

### Stack instalada e em uso

| Dependência | Versão | Papel |
|-------------|--------|-------|
| React | 18.3 | UI framework |
| Vite | 5.4 | Build tool e dev server |
| TypeScript | 5.5 | Tipagem estática |
| Tailwind CSS | 3.4 | Utilitários CSS |
| React Router DOM | 6.26 | Roteamento SPA |
| Axios | 1.7 | Cliente HTTP |
| Socket.io-client | 4.8 | Websocket para Inbox em tempo real |
| PostCSS + Autoprefixer | — | Pipeline CSS |

### Design system

Proprietário, espelhando o HiperTMS (referência visual do Uelder).
Tokens CSS em `index.css` + extensões de tema em `tailwind.config.js`.
Não utiliza biblioteca de componentes externa.
**Ver ADR 014 para inventário completo e regras de uso.**

### Dark mode

Implementado via classe `html.dark` (Tailwind `darkMode: 'class'`).
Tokens CSS em `:root` são sobrescritos em `html.dark` — componentes adaptam automaticamente.

---

## Nota de Atualização (2026-06-09)

Dependências citadas em versões anteriores desta ADR mas **nunca instaladas**.
O ADR 014 formalizou as decisões atualizadas:

| Item | Status | Decisão atual |
|------|--------|---------------|
| FlyonUI | ❌ Não instalado | **Não instalar** — design system próprio é suficiente |
| recharts | ❌ Não instalado | Instalar quando dashboard precisar de gráficos (backlog) |
| CASL | ❌ Não instalado | Instalar quando RBAC front ficar complexo (backlog) |
| lucide / heroicons | ❌ Não instalado | Instalar lucide quando houver demanda de ícones consistentes |

---

## Consequências

- Sem lock-in de biblioteca de componentes externa
- Stack mínima: bundle pequeno, build rápido (~1s dev HMR)
- Responsabilidade de manter os átomos CSS é do time Nexa
