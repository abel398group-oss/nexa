# Runbook de Incidentes — Nexa

> Guia prático: "deu pau, e agora?". Para cada incidente: **sintoma → diagnóstico →
> resolução**. Foco no ambiente atual (local/dev no PC; produção no DigitalOcean é fase
> futura). Atualize quando aparecer um caso novo.

## Mapa rápido do sistema

| Componente | Onde | Porta | Observação |
|---|---|---|---|
| Backend (NestJS) | `apps/backend` (`pnpm dev`) | **3001** | API `/api/*` + WebSocket `/ws` |
| Frontend (Vite) | `apps/frontend` (`pnpm dev`) | **5174/5173** | proxy `/api` → 3001 |
| PostgreSQL | container `nexa_postgres` | **5433** | banco `nexa`, user `nexa` |
| Redis | container | **6380** | filas/estado |
| WAHA (WhatsApp) | container | **3018** | gateway; webhook → `/api/webhooks/waha` |
| IA (Lia) | API Anthropic (Claude) | — | `ANTHROPIC_API_KEY` no `.env` |
| TMS lookup | Postgres do HiperTMS | — | **read-only**; opcional (`TMS_DB_URL`) |

**Botão de pânico:** desligar a IA em runtime → `POST /api/admin/autonomy {"enabled": false}`
(ou o botão de IA no topo do app). Ver "Kill switch" abaixo.

---

## 1. Backend não sobe / porta ocupada (`EADDRINUSE :3001`)

**Sintoma:** ao rodar `pnpm dev` aparece `Error: listen EADDRINUSE :::3001`.
**Causa:** já existe um backend rodando na 3001 (instância antiga não morreu).
**Resolução (PowerShell):**
```powershell
Get-NetTCPConnection -LocalPort 3001 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
cd "C:\Users\Hipervias - Abel\Documents\GitHub\nexa\apps\backend"
pnpm dev
```
Espere `Nest application successfully started`.

> Erro `EPERM ... query_engine-windows.dll` ao rodar `prisma generate`: é o backend
> rodando segurando o arquivo. Pare o backend (Ctrl+C) antes do `generate`.

---

## 2. Lia não responde às mensagens

Checar nesta ordem (do mais comum ao menos):

1. **Autonomia desligada?** `GET /api/admin/autonomy`. Se `autonomyEnabled:false`, a Lia só
   sugere, não envia. Ligar pelo botão de IA no topo ou `POST /api/admin/autonomy {"enabled":true}`.
2. **Backend no ar?** Ver incidente 1. Sem backend, nada responde.
3. **Coluna/tabela faltando no banco (drift)** — foi a causa do incidente de 2026-06-13.
   Sintoma no log: `The column "campaigns.channel" does not exist` (ou outra). Ver incidente 5.
4. **Chave da IA inválida/sem crédito:** log do `Anthropic`. Conferir `ANTHROPIC_API_KEY` no `.env`
   e o saldo no console.anthropic.com.
5. **WAHA fora** (não recebe/envia WhatsApp): ver incidente 3.
6. **Allowlist do WAHA:** em dev, o envio pode estar restrito a um número de teste. Conferir
   a config de allowlist antes de cobrar resposta para números reais.

---

## 3. WhatsApp (WAHA) não envia/recebe

**Sintoma:** mensagens não chegam no inbox, ou a Lia "responde" mas nada sai no WhatsApp.
**Diagnóstico:**
- Painel do WAHA (`:3018`) — sessão **conectada** (QR lido)?
- O webhook inbound aponta para o backend? Log no boot:
  `WahaBootstrap: webhook já registrado — http://host.docker.internal:3001/api/webhooks/waha?token=...`
- Requests `POST /api/webhooks/waha` retornando **403** = token errado/ausente na URL do webhook.
**Resolução:**
- Reler o QR no painel WAHA se a sessão caiu.
- Reaplicar o webhook (o backend tenta no boot; reiniciar o backend re-registra).
- Conferir `WAHA_API_URL`, `WAHA_API_KEY`, `WAHA_SESSION` e o token do webhook no `.env`.

> Observação: a sessão/webhook do WAHA pode sumir num recreate do container — reiniciar o
> backend reaplica via boot.

---

## 4. Banco indisponível / erro de conexão

**Sintoma:** `Can't reach database server at 127.0.0.1:5433`.
**Resolução:**
```powershell
cd "C:\Users\Hipervias - Abel\Documents\GitHub\nexa"
docker compose up -d           # sobe Postgres + Redis + WAHA
docker ps                       # confirmar que nexa_postgres está "Up"
```
Se o container sobe e cai, ver logs: `docker logs nexa_postgres`.

---

## 5. Erro "column/table does not exist" (drift de migrations)

**Sintoma:** runtime quebra com `The column "X" does not exist` / `table "Y" does not exist`,
repetindo no log (ex.: `Sender` a cada 15s). Causa: o banco está **atrás** do schema (uma
migration não foi aplicada neste banco).
**Diagnóstico (só leitura):**
```powershell
cd "C:\Users\Hipervias - Abel\Documents\GitHub\nexa\apps\backend"
pnpm prisma migrate status
```
**Resolução segura (sem perder dados):**
1. **Backup primeiro:** `powershell -ExecutionPolicy Bypass -File scripts\backup.ps1`
2. Se faltam migrations cujo conteúdo **já existe** no banco → marcar como aplicadas:
   `pnpm prisma migrate resolve --applied <nome_da_migration>`
3. Se falta a estrutura de fato → aplicar de forma aditiva. Preferir um SQL idempotente
   (`ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`) via:
   `pnpm prisma db execute --schema prisma/schema.prisma --file prisma/sql/<arquivo>.sql`
4. Conferir: `pnpm prisma migrate status` deve dizer **"Database schema is up to date!"**.

> ⛔ **NUNCA** responder `y` ao prompt de reset do `prisma migrate dev`
> ("We need to reset the schema... All data will be lost") — isso APAGA o banco. Responder **N**.
> Em dev, para sincronizar use `prisma db push` (responder "no" a avisos de perda) ou SQL aditivo.

---

## 6. Redis fora

**Sintoma:** erros de conexão Redis; filas/estado não funcionam.
**Resolução:** `docker compose up -d` (sobe junto). Conferir `REDIS_HOST/PORT/PASSWORD` no `.env`.

---

## 7. E-mail (campanha/inbound) falhando

**Sintoma:** `EmailCampaignSender tick falhou` ou IMAP não puxa respostas.
**Diagnóstico/resolução:**
- Credenciais SMTP/IMAP no `.env` (`EMAIL_SMTP_PASS`, `EMAIL_IMAP_PASS`) preenchidas?
- Config por tenant em `Settings → Canal de E-mail` (host/porta/usuário corretos —
  Hostgator: SMTP `465` SSL, IMAP `993`).
- Se o erro for `email_channels does not exist` → é drift (incidente 5).

---

## 8. TMS lookup indisponível

**Sintoma:** `WARN [TmsLookup] TMS DB indisponível: self-signed certificate...`.
**Impacto:** **baixo** — sem o TMS, a campanha roda normal, só não filtra quem já é cliente.
**Resolução:** opcional. Ajustar `TMS_DB_URL` (SSL) ou deixar vazio para desativar o filtro.

---

## 9. Kill switch — desligar a IA em emergência

Se a Lia estiver respondendo errado / mandando coisa indevida:
- App: botão de **IA** no topo (desliga a autonomia em runtime).
- API: `POST /api/admin/autonomy` com `{"enabled": false}` (requer admin/permissão `ai_control`).
- Efeito: a Lia para de **enviar** automaticamente (passa a só sugerir). Reverter com `true`.

---

## 10. Custo da IA disparando

**Sintoma:** consumo Anthropic acima do esperado.
**Ação imediata:** kill switch (incidente 9) para estancar envios automáticos.
**Investigar:** loop de mensagens, campanha grande sem `sendLimit`, ou reprocessamento.
Conferir o modelo em uso (`AI_MODEL`, default Haiku) e os contadores de token/custo nos logs.

---

## 11. Backup e restore do banco

**Backup (manual):**
```powershell
cd "C:\Users\Hipervias - Abel\Documents\GitHub\nexa"
powershell -ExecutionPolicy Bypass -File scripts\backup.ps1
```
Roda automático **diariamente às 02:00** (mantém os 14 últimos em `backups\`).

**Restore (CUIDADO — sobrescreve o banco atual):**
```powershell
Get-Content backups\nexa_AAAA-MM-DD_HHMMSS.sql | docker exec -i nexa_postgres psql -U nexa -d nexa
```
Sempre fazer um backup novo ANTES de restaurar, para poder voltar.

> Pendência (P6): testar um restore num banco descartável pelo menos uma vez, para garantir
> que o procedimento funciona de ponta a ponta.

---

## Contatos de escalonamento

- Responsável técnico: **Uelder**.
- Provedores externos: Anthropic (IA), WAHA (WhatsApp), Hostgator (e-mail), Asaas (pagamento, via TMS).

> Quando subir para o DigitalOcean (produção), revisar este runbook: portas, nomes de
> container, HTTPS, e o hardening de segredos (rotacionar `ANTHROPIC_API_KEY`, `JWT_SECRET`
> forte) — itens P1–P9 do `GAP_ANALYSIS.md`.
