# Exposição por abertura do repositório — 2026-08-20

> O repositório `abel398group-oss/nexa` passou de privado para público em
> 20/08/2026, para destravar o GitHub Actions (a cota gratuita do plano Free
> acabou e o limite de gastos estava em `$0`, então os jobs paravam em 3s com
> _"recent account payments have failed or your spending limit needs to be
> increased"_). A decisão foi do Abel, ciente da exposição. Este documento
> registra **o que ficou exposto, o que já foi contido e o que continua aberto**.

## Resumo executivo

Nenhuma credencial vazou: não há chave de API, token, senha ou `.env` real
versionado — as strings de conexão no código apontam todas para o banco local de
desenvolvimento (`nexa_local_dev@localhost`), e os secrets do deploy
(`DROPLET_SSH_KEY`, `DOCKERHUB_TOKEN`) vivem no cofre do GitHub, que não os expõe
a repositório público nem a PR de fora.

O que vazou foi **dado pessoal, material comercial e o mapa da infraestrutura**.
O pior item não foi o esperado: `prisma/import-prod-data.js` carregava contatos e
conversas REAIS — nome, telefone e e-mail de pessoas — em código, para popular o
banco local. Foi encontrado durante a limpeza do material de marketing.

## 1. O que estava exposto

| # | Item | Gravidade | Por quê |
|---|------|-----------|---------|
| 1 | `apps/backend/prisma/import-prod-data.js` | **Alta** | Contatos e conversas reais (nome, telefone, e-mail) escritos no código. Dado pessoal — LGPD. |
| 2 | `marketing-social/` (20+ arquivos) | **Alta** | Posicionamento, cadência D0–D23 com a copy, script de discovery do SDR, battle card de objeções, decks e criativos. O código carrega a lista de concorrentes a bloquear — são eles que leriam isto. |
| 3 | `CLAUDE.md` | **Alta** | Host completo do Postgres gerenciado da DigitalOcean com porta e database, caminhos do servidor, nomes de containers, portas de cada serviço, telefone real. |
| 4 | Telefones e e-mails reais em testes e docs | Média | ~544 ocorrências em 99 arquivos; a maioria fictícia, mas misturada com reais da equipe e de clientes. |
| 5 | ADRs e comentários sobre incidentes | Baixa | Descrevem com honestidade cada furo já fechado (base apagada, LID do WhatsApp, envio duplicado). Ótimo para manutenção, e um índice de onde procurar para quem ataca. |

## 2. O que já foi feito (20/08/2026)

- **`import-prod-data.js`** e **`marketing-social/`** saíram do índice com
  `git rm --cached` (continuam no disco de quem os tem) e entraram no
  `.gitignore`. Confirmado: os dois respondem **404** na API do GitHub.
- **`CLAUDE.md`**: host do banco e telefone real substituídos. As instruções
  continuam — o endereço é que era o passivo.
- **Permissão do `GITHUB_TOKEN`** rebaixada para somente leitura
  (`default_workflow_permissions=read`), para que PR de terceiro não consiga
  escrever no repositório.
- Verificado que **nenhum workflow usa `pull_request_target`** e que o CI **não
  referencia secret nenhum** — os dois padrões que transformam repositório
  público em vetor de roubo de credencial de deploy.

Commit: `38f32fb`.

## 3. O que continua aberto

### 3.1. O histórico

`git rm --cached` limpa o estado atual, não o passado. **Todo o conteúdo dos itens
1 a 4 continua legível em commits anteriores**, por qualquer pessoa, sem
autenticação.

Limpar de verdade exige reescrever o histórico (`git filter-repo`) e `push
--force`. É uma operação destrutiva: quebra clones existentes, exige coordenação
com quem tiver o repositório na máquina, e **ainda assim não alcança forks nem
caches** de quem já clonou ou indexou. Decisão pendente do Abel.

### 3.2. Ações recomendadas e ainda não executadas

- [ ] **Confirmar Trusted Sources** no cluster Postgres da DigitalOcean, liberando
      apenas o IP do droplet. Com o host publicado, esta passou a ser a defesa
      principal do banco — sem ela, qualquer um pode tentar conectar direto.
      **É o item mais urgente desta lista.**
- [ ] Trocar telefones e e-mails reais por fictícios nos testes e docs (item 4).
- [ ] Avaliar rotação do `JWT_SECRET` e do `PORTAL_JWT_SECRET` — não vazaram, mas
      a política de rotação existe e um evento de exposição é o gatilho natural
      (ver `politica-secrets.md`).
- [ ] Decidir sobre a reescrita de histórico (§3.1).

## 4. Como não repetir

**A regra que faltava:** num repositório público, `.gitignore` protege só o que
**nunca** foi commitado. Arquivo já rastreado ignora o `.gitignore` — é preciso
`git rm --cached` antes.

Antes de versionar qualquer arquivo novo, perguntar:

1. **É dado de gente real?** Contato, conversa, telefone, e-mail, CNPJ de cliente
   — nunca entra. Nem em teste, nem em script de seed. Use fictícios.
2. **É endereço de produção?** Host, IP, caminho de servidor, nome de container —
   vive no `.env` e no painel do provedor, não no repositório.
3. **É material comercial?** Copy, posicionamento, script de venda, preço — não é
   código, e o repositório não é o lugar.
4. **É credencial?** Nunca, em nenhuma hipótese — ver `politica-secrets.md`.

O `.gitignore` já cobre `marketing-social/`, `**/import-prod-data.js`, `.env` e
backups pontuais. Toda vez que um caminho novo se encaixar nas perguntas acima,
ele entra nessa lista **junto com o commit que o cria**, não depois.

## 5. Se o repositório voltar a ser privado

Voltar a privado **não desfaz** a exposição: quem clonou, forkou ou indexou
manteve a cópia. Serve para conter dali em diante, não para reverter. As ações
do §3.2 continuam valendo integralmente.
