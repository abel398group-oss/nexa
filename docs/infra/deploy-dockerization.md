# Deploy — Dockerização (Backend, Frontend, Compose e Cache de IA)

> Especificação dos artefatos Docker do Nexa para produção, espelhando o padrão do
> HiperTMS. **Só documentação** — os arquivos serão criados na fase de código.
> Ver [`deploy/implementation.md`](../features/deploy/implementation.md).

## Visão geral

Quatro containers na rede `nexa-network`: **backend** (NestJS `:3001`), **frontend**
(nginx servindo o SPA), **redis** (interno) e **waha** (gateway WhatsApp, interno).
As imagens do app são publicadas no DockerHub (`nexa-backend`, `nexa-frontend`); o
WAHA usa a imagem oficial (`devlikeapro/waha`). Portas só em loopback (reverse proxy
do host).

> **WAHA é provisório.** Será trocado pela **API oficial do WhatsApp (Cloud API)** —
> ver o ADR do provider de WhatsApp. O deploy mantém o WAHA isolado num container
> próprio (rede interna, sem porta no host) justamente para facilitar a troca depois.

## 1. `apps/backend/Dockerfile.production`

Espelha o `apps/api/Dockerfile.production` do TMS: build em 2 estágios + `pnpm deploy`
(pacote standalone, evita symlinks/`MODULE_NOT_FOUND`). **Atenção:** o entrypoint do
Nexa é `dist/main.js` (`nest build`), **não** `dist/src/main.js`.

```dockerfile
# Estágio 1 — build
FROM node:24-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

# deps (maximiza cache)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/backend/prisma ./apps/backend/prisma
COPY apps/backend/tsconfig*.json apps/backend/nest-cli.json ./apps/backend/
COPY apps/backend/src ./apps/backend/src

RUN pnpm install --frozen-lockfile
RUN pnpm --filter backend exec prisma generate
RUN pnpm --filter backend build
# pacote standalone com node_modules portável
RUN pnpm deploy --filter=backend --prod /prod/backend

# (opcional — ver §4) pré-baixar o modelo de embeddings para dentro da imagem
# RUN node /prod/backend/scripts/warm-model.js

# Estágio 2 — runtime
FROM node:24-alpine
RUN apk add --no-cache ca-certificates openssl
ENV NODE_ENV=production
WORKDIR /usr/src/app
COPY --from=builder /prod/backend ./
# pnpm deploy não traz o .prisma/client gerado — gerar no stage final
RUN pnpm --filter . exec prisma generate || npx prisma generate
EXPOSE 3001
CMD ["node", "dist/main.js"]
```

> A versão do `prisma generate` no stage final deve casar com a do projeto (no TMS é
> `prisma@5`). Confirmar a major do Prisma no `apps/backend/package.json` e fixar.

## 2. `apps/frontend/Dockerfile` (nginx)

Igual ao TMS: imagem nginx servindo o `dist/` pré-compilado (Vite). O build do Vite
roda **na CI** (não no Dockerfile), como no TMS.

```dockerfile
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

- **`nginx.conf`** (novo): servir o SPA com fallback de rota
  (`try_files $uri /index.html;`). **Não** faz proxy de `/api` nem `/ws` — quem roteia
  é o **reverse proxy do host** (frontend e backend são origens separadas atrás dele).
- O `VITE_*` (ex.: URL da API/WS do Nexa) é resolvido **no build** da CI — documentar
  as variáveis de build no `deploy-env-production.md`.

## 3. `docker-compose.production.yml`

Espelha o do TMS, com portas/rede/serviços do Nexa e **Redis incluso**.

```yaml
services:
  backend:
    image: ${DOCKERHUB_USERNAME:-ueldermartin}/nexa-backend:${IMAGE_TAG:-latest}
    env_file: [.env]
    environment:
      - NODE_ENV=production
      - PORT=3001
    ports:
      - "127.0.0.1:3001:3001"   # loopback — atrás do reverse proxy
    depends_on:
      redis:
        condition: service_started
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3001/api/health"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 40s
    mem_limit: 768m          # ajustar à RAM do droplet (embeddings consomem memória)
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }
    restart: unless-stopped
    # volumes:                # só se optar por cache de modelo em runtime (§4)
    #   - nexa-models:/usr/src/app/.cache

  frontend:
    image: ${DOCKERHUB_USERNAME:-ueldermartin}/nexa-frontend:${IMAGE_TAG:-latest}
    ports:
      - "127.0.0.1:8081:80"   # 8081 p/ não colidir com o TMS (8080)
    depends_on:
      backend:
        condition: service_healthy
    mem_limit: 128m
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }
    restart: unless-stopped

  redis:
    image: redis:7.2-alpine
    command: ["redis-server", "--requirepass", "${REDIS_PASSWORD}"]
    # SEM portas no host — acessível só dentro da nexa-network
    volumes:
      - nexa-redis:/data
    mem_limit: 128m
    restart: unless-stopped

  waha:
    image: devlikeapro/waha:latest   # gateway WhatsApp (NÃO-oficial; será trocado pela Cloud API)
    environment:
      - WAHA_API_KEY=${WAHA_API_KEY}        # protege a API do WAHA (o backend manda no header X-Api-Key)
      - WAHA_PRINT_QR=false                 # QR via dashboard/endpoint, não no log
    # SEM porta no host — o backend chama http://waha:3000 pela nexa-network.
    # Para parear (1ª vez), abrir o dashboard via túnel SSH — ver deploy-runbook.md.
    volumes:
      - nexa-waha:/app/.sessions            # PERSISTE o pareamento (sobrevive a recreate — fix P5)
    mem_limit: 512m                         # WAHA (engine WhatsApp Web) consome memória — pesa no droplet
    restart: unless-stopped

volumes:
  nexa-redis:
  nexa-waha:
  # nexa-models:   # habilitar se usar cache de modelo em runtime (§4, opção B)

networks:
  default:
    name: nexa-network
    driver: bridge
```

- **Portas distintas do TMS** (`3001`/`8081`), **loopback**, **rede própria**.
- `REDIS_URL` da app aponta para `redis://:${REDIS_PASSWORD}@redis:6379` (host
  interno `redis` da rede). Sem porta exposta no droplet.
- `WAHA_API_URL` da app aponta para `http://waha:3000` (host interno `waha` da rede).
  O WAHA **não** tem porta no host; o `WahaBootstrapService` registra o webhook no boot
  usando `NEXA_PUBLIC_URL` (o WAHA precisa alcançar o backend pela URL pública).
- ⚠️ **Sizing:** somando WAHA (~512 MB) ao backend (embeddings), o droplet de 2 GB
  compartilhado com o TMS fica apertado — revisar o plano se travar (ver `deploy-runbook.md`).

## 4. Cache dos modelos de IA (`@xenova/transformers`) — decisão

O backend usa `@xenova/transformers` para embeddings (KB/pgvector). Por padrão a lib
**baixa o modelo na 1ª execução** e cacheia em disco. Em container isso é um risco
(cold start lento, dependência de rede em runtime, perda do cache a cada recriação).

| Opção | Como | Prós | Contras |
|---|---|---|---|
| **A — Pré-baixar no build (recomendada)** | Script `warm-model` no Dockerfile que baixa o modelo para o cache **dentro da imagem** (`ENV TRANSFORMERS_CACHE=/usr/src/app/.cache`) | Boot rápido, **sem rede em runtime**, reproduzível | Imagem maior; rebuild ao trocar o modelo |
| **B — Runtime + volume** | Sem baixar no build; montar volume `nexa-models` no dir de cache; baixa na 1ª requisição e persiste | Imagem menor | 1ª requisição lenta; precisa rede no droplet; gerenciar volume |

**Recomendação:** **Opção A** para o primeiro deploy (determinismo e resiliência).
Fixar o **nome/versão do modelo** e o `TRANSFORMERS_CACHE` para o mesmo caminho no
build e no runtime. Se a imagem ficar grande demais para o droplet, migrar para a B
(volume `nexa-models`, já deixado comentado no compose).

> Em ambos os casos: definir `TRANSFORMERS_CACHE` (ou o `env.cacheDir` da lib) de
> forma **explícita** e igual em build e runtime, senão o cache "some".

## 5. Checklist

- [ ] `apps/backend/Dockerfile.production` (2 estágios + `pnpm deploy`, `CMD node dist/main.js`).
- [ ] `apps/frontend/Dockerfile` + `apps/frontend/nginx.conf` (SPA fallback, sem proxy de API).
- [ ] `docker-compose.production.yml` (backend/frontend/redis/**waha**, loopback, `nexa-network`, `mem_limit`, healthcheck).
- [ ] WAHA: volume `nexa-waha` (persiste sessão), sem porta no host, `WAHA_API_URL=http://waha:3000`.
- [ ] Decisão do cache de IA (A pré-baixar / B volume) implementada e `TRANSFORMERS_CACHE` fixo.
- [ ] Major do Prisma fixada no stage final.
- [ ] Confirmado que `8081` está livre no droplet.

## Relacionados

- [`deploy/implementation.md`](../features/deploy/implementation.md) ·
  [`deploy-env-production.md`](deploy-env-production.md) ·
  [`deploy-runbook.md`](deploy-runbook.md)
- Modelo: `hipertms_v12/apps/api/Dockerfile.production`, `docker-compose.production.yml`.
