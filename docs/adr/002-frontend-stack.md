# ADR 002 — Stack e Padrões do Frontend

**Status:** Proposto (a validar) · **Data:** 2026-06

---

## Contexto

O sistema hoje não tem frontend — toda operação é via banco e n8n. Precisamos de um
painel para: importar contatos, criar campanhas, ver dashboard, gerenciar leads e
acompanhar conversas. Decidimos usar o **HiperTMS v12 como referência de construção**.

## Decisão

Adotar a **mesma stack e padrões do HiperTMS**, para reaproveitar conhecimento,
componentes e convenções.

### D1 — Stack do frontend
| Camada | Tecnologia (igual TMS) |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite |
| Estilo | Tailwind CSS + FlyonUI |
| Forms | react-hook-form + zod |
| Dados | @tanstack/react-query + axios (axiosTransport) |
| Tabelas | @tanstack/react-table |
| Ícones | lucide-react / heroicons |
| Gráficos | recharts |
| Permissões | CASL |

### D2 — Backend do frontend
- **NestJS + Prisma + PostgreSQL** (mesmo padrão TMS)
- API REST como ponte entre o front e o banco (n8n não serve para isso)
- Reaproveitar o PostgreSQL existente (mesmas tabelas de leads)

### D3 — Taxonomia de páginas (ADR 003 do TMS)
Quatro tipos canônicos:
- **List** (StandardListPage) — listas com filtro/paginação
- **Form** (StandardFormPage) — criar/editar
- **View** (StandardViewPage) — leitura
- **Edit** — edição com proteção de mudanças não-salvas

### D4 — Segurança (espelhar TMS)
- JWT via cookie HttpOnly
- Multi-tenant preparado (tenantId no contexto, nunca no body)
- CASL para permissões granulares
- Secrets fora do repo (.env / secret manager)

### D5 — Integração com o n8n
- O frontend escreve/lê no PostgreSQL via API
- O n8n continua consumindo o mesmo banco
- Eventualmente, seguir o padrão do ADR 024 do TMS (eventos + ações idempotentes)

## Consequências

**Positivas**
- Reaproveita design system, componentes e padrões já maduros do TMS
- Curva de aprendizado menor (mesma stack)
- Caminho natural para o sistema virar módulo/integração do TMS

**A decidir**
- Standalone vs módulo dentro do TMS (há sobreposição: TMS já tem features de lead)
- Multi-tenant agora ou depois

## Telas do MVP (primeira leva)
1. Login / Auth
2. Dashboard (métricas — queries já prontas)
3. Importar contatos
4. Lista de contatos / CRM
5. Campanhas (criar + acompanhar)
6. Saúde dos números
7. Inbox de conversas (mais complexo — fase 2)
