# Deploy — Runbook (Segurança, Operação, Rollback e Remoção)

> Procedimentos operacionais do deploy do Nexa no droplet compartilhado com o TMS.
> Ver [`deploy/implementation.md`](../features/deploy/implementation.md).

## 1. Segurança & operação

### 1.1. Reverse proxy + HTTPS (domínio do Nexa)

- O Nexa ganha um **domínio próprio** (ex.: `nexa.SEU_DOMINIO`), separado do TMS.
- No **reverse proxy do host** (o mesmo que já atende o TMS), adicionar um server block:
  - `/` → `http://127.0.0.1:8081` (frontend Nexa)
  - `/api` e `/ws` → `http://127.0.0.1:3001` (backend Nexa) — com upgrade de WebSocket
    (`Upgrade`/`Connection` headers) para o `/ws` (Socket.IO).
- **TLS** via Let's Encrypt (certbot) para o domínio do Nexa. Renovação automática.
- **Não** alterar os server blocks do TMS. Mudança **aditiva** (novo virtual host).

### 1.2. Firewall do droplet

- Manter só **80/443** (e **22** restrito) abertos no firewall (UFW/DO Firewall).
- As portas dos apps (`3001`, `8081`) ficam em **loopback** — nunca expostas.
- O **Redis** não tem porta no host (só `nexa-network`).
- No cluster Postgres gerenciado, em **Trusted Sources**, liberar **só o IP do droplet**.

### 1.3. Regra crítica — nunca migrar/escrever no banco do TMS

- O conector do TMS é **read-only** (`TMS_DB_URL` = SELECT-only; ADR 010/015).
- As migrations do Nexa rodam **exclusivamente** no `DATABASE_URL` do Nexa.
- **Proibido** apontar `prisma migrate` para `TMS_DB_URL`. Conferir antes de qualquer
  comando de migration que a env ativa é a do Nexa.

### 1.4. Swap no Ubuntu

- Embeddings (`@xenova/transformers`) e o build consomem memória. Garantir **swap**
  no droplet (ex.: 2 GB) para evitar OOM, especialmente se a RAM for compartilhada
  com o TMS:
  ```bash
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ```
- Ajustar `mem_limit` dos containers (compose) à RAM real do droplet.

### 1.5. WAHA — pareamento da sessão (1ª vez) e webhook

O WAHA roda **sem porta no host** (só na `nexa-network`). Para **parear o WhatsApp**
na primeira vez (escanear o QR), use um **túnel SSH** a partir da sua máquina —
nunca exponha a porta do WAHA publicamente:

```bash
# na sua máquina: encaminha o WAHA do droplet (container :3000) para o localhost
ssh -L 3018:127.0.0.1:3000 root@<IP_DO_DROPLET>
# (no droplet, garanta que o compose publica o waha SÓ em loopback enquanto pareia,
#  ou use `docker exec`/o endpoint de QR do WAHA — não abrir porta pública)
```

- Abra `http://localhost:3018` (dashboard do WAHA), inicie a sessão `default` e
  **escaneie o QR** com o WhatsApp do número de atendimento.
- A sessão fica salva no volume **`nexa-waha`** — sobrevive a `compose recreate` (fix P5).
- O **webhook** é registrado **automaticamente** no boot do backend
  (`WahaBootstrapService`) em `NEXA_PUBLIC_URL/api/webhooks/waha?token=WAHA_WEBHOOK_TOKEN`.
  Conferir no log do backend: `webhook registrado com sucesso`.
- `WAHA_API_KEY` no `.env` do backend deve ser **igual** à do container `waha`.
- ⚠️ WAHA usa WhatsApp Web (não-oficial). É **provisório** — destino é a Cloud API.

### 1.6. Snapshot antes do deploy

- **Antes do primeiro deploy** (e de deploys de risco): **snapshot do droplet** no DO
  e garantir **backup/PITR** do cluster gerenciado ativo. Permite voltar o droplet
  inteiro se algo sair muito errado.

## 2. Runbook de deploy (1ª vez)

Pré-requisitos concluídos: banco provisionado (`deploy-managed-postgres.md`),
baseline de migrations validada (`deploy-migrations-baseline.md`), imagens/compose
prontos (`deploy-dockerization.md`), `.env` montado (`deploy-env-production.md`).

```bash
# No droplet
mkdir -p ~/nexa && cd ~/nexa
# copiar docker-compose.production.yml e .env.production.example (via SCP/CI)
cp .env.production.example .env && nano .env     # preencher segredos reais

# 1) Migrations no banco NOVO (uma vez, manual no 1º deploy) — usa o DATABASE_URL do Nexa
docker compose -f docker-compose.production.yml run --rm backend \
  pnpm --filter backend exec prisma migrate deploy
#   ^ confirmar no log que aplicou a baseline e o schema ficou completo

# 2) Subir os serviços
docker login
docker compose -f docker-compose.production.yml pull
docker compose -f docker-compose.production.yml up -d

# 3) Healthcheck
for i in $(seq 1 7); do
  sleep 12
  curl -s -o /dev/null -w "back:%{http_code}\n" http://localhost:3001/api/health
  curl -s -o /dev/null -w "front:%{http_code}\n" http://localhost:8081/
done
docker compose -f docker-compose.production.yml ps
```

- Deploys seguintes: automatizados pelo workflow `deploy.yml` (espelha o do TMS:
  build→DockerHub→SCP→SSH `pull`/`up`→healthcheck 7×→prune das imagens, mantendo as
  3 mais novas + as em uso). **`migrate deploy` dos deploys seguintes** pode ser um
  passo do script SSH (rodando no container backend) — decidir no workflow; sempre
  com o `DATABASE_URL` do Nexa e nunca o do TMS.

## 3. Rollback

Espelha o TMS (rollback por imagem anterior):

1. O workflow guarda o **ID da imagem anterior** antes do `up`. Se o healthcheck
   falhar, reapontar o serviço para a imagem anterior e subir:
   ```bash
   IMAGE_TAG=<tag_anterior> docker compose -f docker-compose.production.yml up -d
   ```
2. Verificar healthcheck de novo. Logs: `docker compose ... logs --tail=50 backend`.
3. **Migrations não revertem sozinhas.** Como as migrations do Nexa são **aditivas**
   (campos opcionais), um rollback de imagem normalmente convive com o schema novo.
   Se uma migration for incompatível, restaurar o banco pelo **backup/PITR** do
   cluster (e, em último caso, o **snapshot** do droplet).
4. Nunca rodar `migrate dev`/reset em produção (ADR 013).

## 4. Runbook de remoção (apagar o Nexa sem afetar o TMS)

```bash
cd ~/nexa
# 1) Derrubar só os containers do Nexa + remover volumes do Nexa
docker compose -f docker-compose.production.yml down -v   # -v remove nexa-redis, nexa-waha (e nexa-models, se houver)

# 2) Remover a rede e as imagens do Nexa (NÃO tocar nas do TMS)
docker network rm nexa-network 2>/dev/null || true
docker images "*/nexa-backend" -q | xargs -r docker rmi -f
docker images "*/nexa-frontend" -q | xargs -r docker rmi -f

# 3) Remover o diretório do Nexa
cd ~ && rm -rf ~/nexa
```

- No **reverse proxy**, remover **apenas** o server block do domínio do Nexa
  (deixar os do TMS intactos) e recarregar.
- No **cluster gerenciado**, opcionalmente dropar o database `nexa` e o usuário
  `nexa_app` (não afeta o database do TMS).
- **Conferir** que os containers/rede/portas do TMS (`3000`/`8080`,
  `hipertms-network`) seguem de pé: `docker ps` e healthcheck do TMS.

## 5. Checklist operacional

- [ ] Domínio do Nexa + TLS no reverse proxy (server block aditivo; TMS intocado).
- [ ] Firewall: só 80/443/22; apps em loopback; Redis e WAHA sem porta; PG Trusted Source = IP do droplet.
- [ ] WAHA: sessão pareada (QR via túnel SSH), volume `nexa-waha` persistindo, webhook registrado no boot.
- [ ] Swap configurado; `mem_limit` ajustado à RAM.
- [ ] Snapshot do droplet + backup/PITR do cluster antes do 1º deploy.
- [ ] `migrate deploy` rodou no banco do **Nexa** (nunca no do TMS) e o schema ficou completo.
- [ ] Healthcheck OK (back `:3001/api/health`, front `:8081/`).
- [ ] Procedimento de rollback testado/entendido.
- [ ] Runbook de remoção valida que o TMS continua de pé.

## Relacionados

- ADR 013 · `docs/security/secrets-management.md` · `docs/security/security-overview.md`
- [`deploy/implementation.md`](../features/deploy/implementation.md) ·
  [`deploy-migrations-baseline.md`](deploy-migrations-baseline.md)
