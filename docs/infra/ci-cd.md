# CI/CD — Nexa

> Pipeline de integração e entrega. Estratégia de ambientes em **ADR 013**.

## CI (GitHub Actions)

Workflow em `.github/workflows/ci.yml`, disparado em `push` e `pull_request` para
`main` e `develop`:

1. Checkout + Node 20 + pnpm 9 (com cache do store).
2. `pnpm install --frozen-lockfile`.
3. **Testes**: `pnpm --filter backend test`.
4. **Build backend**: `pnpm --filter backend build`.
5. **Build frontend**: `pnpm --filter frontend build`.
6. **Valida schema**: `pnpm --filter backend exec prisma validate`.

> A CI valida o schema, mas **não aplica migrations** — `prisma validate` apenas
> confere a consistência. Migrations são aplicadas no deploy (`migrate deploy`).

## Ambientes (ADR 013)

| Ambiente | Uso | Dados | Branch |
|---|---|---|---|
| **dev** | desenvolvimento local | fake/seed | `feature/*` |
| **staging** | homologação (espelha prod) | cópia anonimizada | `staging` |
| **production** | clientes reais | reais | `main` |

Cada ambiente tem **PostgreSQL e Redis próprios** (nunca compartilhar) e
`DATABASE_URL` próprio via secrets. Nunca reusar chave entre ambientes.

## CD (deploy)

- **main → production**: deploy automático após CI verde.
- **staging → staging**.
- Passos de deploy: `build → test → prisma migrate deploy → start`.
- **Sempre `prisma migrate deploy`** em staging/prod (nunca `migrate dev`).
- **Rollback**: manter a versão anterior pronta para retomar.
- Segredos via Docker Secrets → DigitalOcean Secrets (ver
  `docs/security/secrets-management.md`).

## Domínios (exemplo, ADR 013)

```
dev        → localhost
staging    → staging.leads.hipervias.com
production → leads.hipervias.com
```

## Pendências

- [ ] Adicionar job de deploy automático (main → production) no GitHub Actions
- [ ] Configurar secrets do repositório (ANTHROPIC_API_KEY, TMS_DB_URL, etc.) no GitHub → Settings → Secrets
- [ ] Estratégia de desligamento do MVP n8n após validar paridade na nova plataforma

## Relacionados

- ADR 013 — Environment Strategy · `docs/infra/deploy.md`
- `docs/infra/prisma-migrations.md` · `docs/security/secrets-management.md`
