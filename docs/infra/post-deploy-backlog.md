# Backlog pós-deploy — Nexa (itens que NÃO tocam no TMS)

> Lista consolidada do que ficou pendente depois do primeiro deploy em produção
> (Nexa no ar em https://nexa.hipertms.com.br, CI/CD funcionando). Todos os itens
> abaixo são do **lado do Nexa** (não exigem alteração no repositório do HiperTMS).
> Ordem sugerida de ataque no topo. Atualizar o status conforme formos fazendo.

## 1. Consertar o CI (`ci.yml`) — ✅ FEITO (verde apos push; era commit antigo)

**O quê:** o workflow `.github/workflows/ci.yml` ("Build & Lint") falha em todo push
desde commits do squad (testes do backend OU build do frontend). O lint é não-bloqueante,
então a falha vem de outro passo (tests / build front / prisma validate).

**Por quê:** sem o CI verde, a checagem de qualidade não protege os merges.

**Onde:** `.github/workflows/ci.yml` (passos: tests, build backend, build frontend, validate).

**Como começar:** abrir o último run vermelho do "CI" e ver qual passo falha; reproduzir
local (`pnpm --filter backend test`, `pnpm --filter frontend build`). Corrigir a causa
(teste quebrado ou erro de TS) — não mascarar.

**Aceite:** CI verde num push limpo.

## 2. Mudança 1 (login na raiz) — ✅ FEITO (no ar)

**O quê:** o código já está pronto (`RootRedirect` em `RouteGuards.tsx`, `/` → login,
landing preservada em `/landing`). Falta **commit + push** para o deploy automático subir.

**Aceite:** abrir `nexa.hipertms.com.br` cai no login (não na landing). Ver
`docs/features/internal-mode/implementation.md`.

## 3. Lado-Nexa do suporte nativo do TMS — ✅ FEITO (Nexa pronto; falta o TMS)

**O quê:** preparar a parte que vive NO NEXA para a tela de suporte nativa que o TMS vai
consumir — sem tocar no TMS. Inclui: confirmar/ajustar CORS para o domínio do TMS na API
do portal (`/api/portal/*`), e decidir/expor a autenticação (cookie cross-subdomínio que
já existe vs. bearer token). Deixar a API pronta e documentada para o TMS plugar depois.

**Onde:** `application/portal/*`, `presentation/http/portal/portal.controller.ts`,
config de CORS no `main.ts` / `CORS_ORIGINS`.

**Aceite:** a API do portal responde para chamadas autenticadas vindas do domínio do TMS
(CORS + credenciais OK). Spec completa em `docs/features/tms-native-support/implementation.md`.

## 4. Revisar os docs `tms-native-support` e `sales-improvements`  — [prioridade: média]

**O quê:** revisar a fundo as duas specs que o squad gerou (a `tms-native-support` é a mais
delicada — auth cross-domínio, contrato da API) antes de implementar.

**Aceite:** docs validados, sem lacunas técnicas.

## 5. Segurança — rotacionar segredos expostos  — [prioridade: média]

**O quê:** a `ANTHROPIC_API_KEY` e a senha do banco apareceram em texto durante o setup.
Agora que estamos em produção (regra: trocar a chave ao subir no DigitalOcean), rotacionar:
gerar nova `ANTHROPIC_API_KEY` no console da Anthropic; (opcional) trocar a senha do
usuário `nexa_app` no cluster. Atualizar o `.env` em `~/nexa/.env` no droplet e reiniciar
o backend (`docker compose -f docker-compose.production.yml up -d`).

**Aceite:** chaves novas no `.env` do droplet; backend `healthy`; chaves antigas revogadas.
Ver `docs/security/secrets-management.md` e [[nexa-rotate-secrets-at-deploy]].

## 6. Fail-closed do tenant (`?? 'default'`)  — [prioridade: média/segurança]

**O quê:** ~81 ocorrências de `tenantId ?? 'default'`. Em rotas autenticadas isso deve
**falhar fechado** (recusar) em vez de cair no `default`. Separar os casos autenticados
dos legítimos de sistema/webhook (onde `default` é aceitável).

**Aceite:** rotas autenticadas sem tenant resolvido → erro (não `default`); webhooks/jobs
inalterados.

## 7. Testes de frontend  — [prioridade: baixa]

**O quê:** o backend tem ~132 testes; o frontend não tem. Adicionar Vitest + Testing Library
(e, opcional, Playwright) nas telas críticas (login, inbox, portal).

## 8. Limpar dados de teste de produção  — [prioridade: quando terminar de validar]

**O quê:** o banco de prod recebeu um clone dos dados de dev para testes. Quando a validação
acabar, limpar os dados de teste (manter só admin + produto + config), deixando o tenant
real do HiperTMS.

## 9. (Opcional) Tornar o lint bloqueante no CI

**O quê:** depois de zerar os warnings, remover o `continue-on-error` do passo de lint no
`ci.yml` para o lint passar a bloquear merges.

---

### Já feito (referência)
- Deploy em produção + CI/CD (`docs/infra/deploy-*.md`, `.github/workflows/deploy.yml`).
- Baseline de migrations (squash) + banco gerenciado + pgvector.
- Mudança 1 (login na raiz) — implementada, falta subir (item 2).
- Docs: `internal-mode`, `tms-native-support`, `sales-improvements`.
- WAHA: pareamento documentado em `docs/infra/deploy-runbook.md` (item de execução, não código).

---

## Progresso — sessao 2026-06-16

- [x] **1. CI** — verde apos push (era commit antigo).
- [x] **2. Login na raiz** — RootRedirect; landing preservada em /landing. No ar.
- [x] **3. Lado-Nexa do suporte nativo** — PortalSessionGuard aceita Bearer alem do cookie;
      POST /api/portal/session devolve `session` (JWT) no corpo. + teste do guard.
- [x] **4. Revisao dos docs** — internal-mode, tms-native-support e sales-improvements OK.
- [~] **6. Fail-closed do tenant** — removido `?? 'default'` de 14 controllers autenticados
      (13 via sed + email-channel via @CurrentTenant). FALTA so o `admin.controller` (1x),
      deixado de proposito (contexto platform-admin, sensivel).
- [ ] **5. Rotacionar segredos** — STAND-BY (decisao do usuario). ANTHROPIC_API_KEY, senha
      nexa_app e chave SSH de deploy apareceram no chat; rotacionar quando quiser.
- [ ] **7. Testes de frontend** — front squad.
- [ ] **8. Limpar dados de teste** — quando terminar de validar.
- [ ] **9. Lint bloqueante no CI** — depois de zerar os warnings.

> Nota: o mount do Windows ficou instavel pra escrita nesta sessao (truncou arquivos).
> Edicoes de codigo feitas via sandbox (git show + sed + cp) com verificacao de chaves.
