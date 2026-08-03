# Regra: Prisma Schema → Sempre rodar `generate` após qualquer mudança

## O problema

Quando alguém edita o `schema.prisma` e roda migrate, o banco de dados é atualizado
**mas o TypeScript não sabe disso**. O Prisma Client é um arquivo gerado separadamente —
ele fica desatualizado até ser regenerado manualmente.

Resultado: o projeto não sobe, com erros como:

```
Property 'calculationBase' does not exist on type '...'
Object literal may only specify known properties
```

---

## A regra

**Sempre que fizer `git pull` e o `schema.prisma` tiver mudado, rode:**

```bash
pnpm db:generate
```

Sem isso, o TypeScript não conhece os campos novos e o projeto não compila.

---

## Checklist obrigatório

### Quem CRIOU uma migration (Abel)

```
1. Editar apps/backend/prisma/schema.prisma
2. pnpm db:migrate       ← cria e aplica no banco local
3. Ler o SQL gerado em prisma/migrations/.../migration.sql
4. Confirmar que não tem DROP, DELETE, TRUNCATE
5. pnpm db:generate      ← atualiza o client TS
6. cd apps/backend && pnpm build   ← confirma que compila
7. git add + git commit + git push
```

### Quem RECEBEU uma migration via git pull

```
1. git pull
2. Verificar se schema.prisma mudou → se sim:
3. pnpm db:generate
4. cd apps/backend && pnpm dev
```

---

## Tipos de migration e risco

| SQL gerado | Risco | Pode aplicar? |
|---|---|---|
| `ADD COLUMN` com `DEFAULT` ou `?` | Nenhum | ✅ Sempre seguro |
| `CREATE TABLE` | Nenhum | ✅ Sempre seguro |
| `CREATE INDEX` | Nenhum | ✅ Sempre seguro |
| `ALTER COLUMN` (tipo ou constraint) | Médio | ⚠️ Avisar Abel antes |
| `DROP COLUMN` | Alto — perde dados | ❌ Só Abel aplica |
| `DROP TABLE` | Crítico — perde tudo | ❌ Só Abel aplica |
| `RENAME` de tabela ou coluna | Alto — quebra queries | ❌ Só Abel aplica |

---

## Comandos proibidos para o squad (apenas Abel executa)

```bash
pnpm db:migrate          # Cria e aplica migration — apenas Abel
prisma migrate reset     # APAGA O BANCO INTEIRO
prisma db push           # Aplica sem criar migration (perde histórico)
```

---

## Produção

Em produção **nunca** rodar `migrate dev` — apenas:

```bash
cd /root/nexa && docker compose -f docker-compose.production.yml exec backend npx prisma migrate deploy
```

---

## Resumo em uma linha

> **`git pull` com mudança no schema = sempre rodar `pnpm db:generate` antes de qualquer coisa.**
