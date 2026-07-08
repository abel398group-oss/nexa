# Runtime & Versões

> Última atualização: 2026-07-08

## Versões em produção
| Componente | Versão | Observação |
|---|---|---|
| Node.js | >=20 (engines.node em package.json) | Produção usa Node 20 LTS |
| PostgreSQL | 16 | Banco gerenciado DigitalOcean (`db-postgresql-nyc3-37059`) |
| Prisma | ^5.0.0 | `@prisma/client` + `prisma` CLI |
| NestJS | ^10.3.0 | `@nestjs/common`, `@nestjs/core` etc. |
| Redis | 5.x (ioredis ^5.4.0) | Local dev: :6388 · Produção: `REDIS_URL` env |
| Socket.io | ^4.7.0 | WebSocket (inbox em tempo real) + Redis Adapter |
| Docker / Compose | versão do host | Usado apenas para Redis+WAHA em dev (Postgres é externo) |
| pnpm | 9.0.0 (packageManager) | Monorepo workspace manager |
| pgvector | — | Extensão no Postgres DO; em uso pelo `embeddings.service.ts` |
| TypeScript | ^5.3.0 (backend) / ^5.5 (frontend) | Strict mode |
| React | 18.3 | Frontend SPA |
| Vite | 5.4 | Frontend build / dev server |
| Tailwind CSS | 3.4 | Design system |
| Sentry | ^8.0.0 | Monitoramento de erros em produção |

## Decisões de runtime (resolvidas)
- [x] **Hospedagem:** DigitalOcean Droplet (`hiperTMS`) — Docker Compose em `/root/nexa/`
- [x] **Banco:** PostgreSQL gerenciado DO — `DATABASE_URL` aponta direto para DO (mesmo em dev local)
- [x] **Secrets:** variáveis de ambiente no `.env` de produção (`/root/nexa/.env`)
- [x] **Deploy (CI/CD):** GitHub Actions — build Docker + deploy no Droplet
- [x] **Backup do PostgreSQL:** backup automático gerenciado pelo DigitalOcean (banco gerenciado)
- [x] **Prisma em produção:** `prisma migrate deploy` via `docker exec` (CLI NÃO está na imagem — instalar temporariamente se necessário)

## Notas de compatibilidade
- `psql` NÃO existe no host nem nos containers — usar `node -e` com `pg` para queries SQL diretas
- `DATABASE_URL` usa `sslmode=require` → adicionar `uselibpqcompat=true` para `pg` moderno
- Shell local = PowerShell (Windows) → usar `;` em vez de `&&` para encadear comandos

## Referência
- Detalhes de comandos e gotchas: `CLAUDE.md` (raiz)
- Stack espelha o HiperTMS (mesma família de versões quando fizer sentido)
- Atualizações de versão major → planejar fora de sprint ativo
