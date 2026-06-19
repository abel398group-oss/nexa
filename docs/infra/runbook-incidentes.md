# Runbook de Incidentes — Nexa

> Versão: 1.0 | Junho 2026
> Audiência: equipe de operações, plantão, DevOps

---

## Severidades

| SEV | Critério | SLA de resposta | Responsável |
|-----|----------|----------------|-------------|
| **SEV-1** | Plataforma fora do ar — 100% dos clientes afetados | 15 min | Plantão imediato |
| **SEV-2** | Feature crítica degradada (envio de mensagens, IA, login) | 30 min | Plantão |
| **SEV-3** | Feature secundária com problema (campanhas pausadas, IMAP lento) | 2h | Dev on-call |
| **SEV-4** | Bug sem impacto em produção, melhoria | Próximo sprint | Dev |

---

## 1. Backend fora do ar (API retornando 5xx / timeout)

**Sintoma:** `/api/health` retorna ≠ 200 ou não responde.

```bash
# 1. Ver status dos containers
ssh root@<DROPLET_IP>
cd ~/nexa
docker compose -f docker-compose.production.yml ps

# 2. Ver logs do backend (últimas 100 linhas)
docker compose -f docker-compose.production.yml logs --tail=100 backend

# 3. Reiniciar backend
docker compose -f docker-compose.production.yml restart backend

# 4. Verificar health após reinício
sleep 15 && curl -s http://localhost:3001/api/health
```

**Causas comuns:**
- Memória esgotada → `docker stats` → aumentar memory limit no compose
- Banco PostgreSQL fora → ver seção 4
- Variável de ambiente faltando → checar `.env` no droplet

---

## 2. WAHA desconectado (WhatsApp sem resposta)

**Sintoma:** Mensagens do WhatsApp chegam mas IA não responde. Status no painel fica "Desconectado".

```bash
# Ver logs do WAHA
docker compose -f docker-compose.production.yml logs --tail=50 waha

# Verificar sessão via API WAHA
curl http://localhost:3018/api/sessions

# Reiniciar sessão via WAHA
curl -X POST http://localhost:3018/api/sessions/default/start

# Se sessão perdeu autenticação (QR code expirou):
# 1. Abrir painel Nexa → Configurações → WhatsApp → Reconectar
# 2. Escanear novo QR Code com o celular do número comercial
```

**⚠️ Importante:** Não reiniciar o container WAHA sem antes tentar restart da sessão — perder a sessão exige novo QR scan.

---

## 3. Fila de eventos travada (EventDlq crescendo)

**Sintoma:** Notificações do painel sobre DLQ. Dashboard mostra `events.dlq > 0`.

```bash
# Ver eventos na DLQ via banco
# Conectar ao banco (ver seção 5 — acesso ao banco)
SELECT event_type, error, retry_count, created_at
FROM event_dlq
WHERE status = 'pending'
ORDER BY created_at DESC
LIMIT 20;

# Reprocessar via endpoint (admin)
curl -X POST https://app.nexa.com.br/api/admin/events/dlq/reprocess \
  -H "Cookie: <seu_cookie>" \
  -H "Content-Type: application/json"
```

**Causas comuns:**
- Serviço externo (WAHA, TMS) indisponível durante o processamento
- Payload malformado → o evento precisa ser descartado (`status = 'discarded'`)

---

## 4. Banco PostgreSQL lento / fora do ar

```bash
# Ver status do container do banco
docker compose -f docker-compose.production.yml ps postgres

# Ver logs
docker compose -f docker-compose.production.yml logs --tail=50 postgres

# Reiniciar banco (CUIDADO: interrompe todas as conexões)
docker compose -f docker-compose.production.yml restart postgres

# Verificar conexões ativas (dentro do container)
docker exec -it nexa-postgres-1 psql -U postgres -c "
  SELECT count(*), state FROM pg_stat_activity GROUP BY state;
"

# Queries lentas (> 5s)
docker exec -it nexa-postgres-1 psql -U postgres -c "
  SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
  FROM pg_stat_activity
  WHERE (now() - pg_stat_activity.query_start) > interval '5 seconds';
"

# Matar query travada
docker exec -it nexa-postgres-1 psql -U postgres -c "SELECT pg_terminate_backend(<pid>);"
```

---

## 5. Acesso ao banco em produção

```bash
# Conectar ao banco via container
docker exec -it nexa-postgres-1 psql -U postgres -d nexa

# Ou via port-forward SSH (mais seguro — sem expor porta)
ssh -L 5433:localhost:5432 root@<DROPLET_IP>
# Em outro terminal:
psql -h localhost -p 5433 -U postgres -d nexa
```

---

## 6. Deploy falhou / rollback

```bash
# Ver imagens disponíveis no droplet
docker images | grep nexa

# Rollback: subir versão anterior (substitua <SHA_ANTERIOR>)
cd ~/nexa
BACKEND_TAG=<SHA_ANTERIOR> FRONTEND_TAG=<SHA_ANTERIOR> \
  docker compose -f docker-compose.production.yml up -d

# Verificar health
sleep 20 && curl -s http://localhost:3001/api/health
```

---

## 7. Frontend não carrega (502/504)

```bash
# Ver logs do nginx/frontend
docker compose -f docker-compose.production.yml logs --tail=50 frontend

# Checar se o backend está respondendo (o frontend depende dele via proxy)
curl -s http://localhost:3001/api/health

# Reiniciar frontend
docker compose -f docker-compose.production.yml restart frontend
```

---

## 8. IA parando de responder sem erro visível

**Diagnóstico:**
1. Checar kill switch no painel: `/dashboard` → botão "IA ON/OFF"
2. Checar limite de rate da Anthropic: ver logs do backend por `429`
3. Checar `ANTHROPIC_API_KEY` válida:
```bash
docker exec nexa-backend-1 env | grep ANTHROPIC
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "content-type: application/json" \
  -d '{"model":"claude-haiku-4-5","max_tokens":10,"messages":[{"role":"user","content":"ok"}]}'
```

---

## 9. Checklist de Comunicação

- [ ] SEV-1/2: avisar equipe no canal de emergência (WhatsApp/Slack)
- [ ] SEV-1: avisar clientes afetados por e-mail em até 30min
- [ ] Após resolução: preencher postmortem em `docs/reviews/YYYY-MM-postmortem.md`
- [ ] Atualizar este runbook se o incidente revelou lacuna

---

## 10. Contatos de Emergência

| Serviço | Contato / Painel |
|---------|-----------------|
| DigitalOcean | console.digitalocean.com |
| Anthropic API | console.anthropic.com → Usage |
| Registro de domínio | verificar com time |
| SMTP (Hostgator) | suporte.hostgator.com.br |
