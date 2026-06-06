# Runtime & Versões — registrar no Sprint 1

> Registrar as versões exatas usadas. Daqui a 6 meses ninguém lembra. Preencher ao montar
> o ambiente (Sprint 1) e atualizar quando subir versão relevante.

## Versões (preencher na implementação)
| Componente | Versão | Observação |
|---|---|---|
| Node.js | _a definir_ | (TMS usa >=24) |
| PostgreSQL | _a definir_ | (TMS usa 16) |
| Prisma | _a definir_ | |
| NestJS | _a definir_ | |
| Redis | _a definir_ | (fila/eventos) |
| Docker | _a definir_ | |
| Docker Compose | _a definir_ | |
| pnpm | _a definir_ | (TMS usa 9) |
| pgvector | _a definir_ | (se usar RAG) |

## Decisões de runtime (preencher)
- [ ] Hospedagem: Digital Ocean (droplet / app platform?)
- [ ] Onde ficam os secrets: Docker Secrets (MVP) → DO Secrets (prod)
- [ ] Estratégia de deploy (CI/CD): _a definir_
- [ ] Backup do PostgreSQL: _a definir_ (frequência, destino)

## Referência
- Stack espelha o HiperTMS (mesma família de versões quando fizer sentido)
- Atualizações de versão major → planejar (não no meio de sprint)
