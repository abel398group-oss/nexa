# Plano de Backup e Recuperação de Desastres (DR)

> Versão: 1.0 | Junho 2026

## RTO / RPO

| Métrica | Alvo | Atual |
|---------|------|-------|
| **RPO** (máx. dados perdidos) | 24h | 24h (backup diário) |
| **RTO** (tempo p/ restaurar) | 4h | Estimado — não testado ainda |

---

## 1. O que precisa de backup

| Dado | Criticidade | Onde fica |
|------|------------|-----------|
| PostgreSQL (banco principal) | **Crítico** | Container Docker no Droplet |
| Sessões WAHA (autenticação WhatsApp) | **Alto** | Volume Docker `/waha-data` |
| Variáveis de ambiente (`.env`) | **Crítico** | Droplet + cofre de secrets |
| Arquivos de mídia (uploads) | Médio | Volume Docker `/uploads` |
| Código-fonte | Baixo | GitHub (já versionado) |

---

## 2. Backup do PostgreSQL

### 2.1 Backup manual

```bash
# No Droplet — dump completo
docker exec nexa-postgres-1 pg_dump -U postgres nexa | \
  gzip > /root/backups/nexa_$(date +%Y%m%d_%H%M).sql.gz

# Verificar integridade
gunzip -t /root/backups/nexa_<timestamp>.sql.gz && echo "OK"
```

### 2.2 Backup automatizado (⚠️ PENDENTE IMPLEMENTAÇÃO)

```bash
# Criar cron job no Droplet — rodar uma vez, configuração permanente
crontab -e

# Adicionar linha (backup diário às 03h, mantém 7 dias):
0 3 * * * docker exec nexa-postgres-1 pg_dump -U postgres nexa | \
  gzip > /root/backups/nexa_$(date +\%Y\%m\%d).sql.gz && \
  find /root/backups -name "nexa_*.sql.gz" -mtime +7 -delete
```

**⚠️ Para equipe:** Configurar este cron no Droplet de produção. Também avaliar uso do
**DigitalOcean Managed PostgreSQL** que inclui backup automático com point-in-time recovery.

### 2.3 Enviar backup para DigitalOcean Spaces (⚠️ PENDENTE)

```bash
# Instalar s3cmd no Droplet e configurar com credenciais DO Spaces
s3cmd put /root/backups/nexa_$(date +%Y%m%d).sql.gz \
  s3://nexa-backups/postgres/
```

---

## 3. Backup das sessões WAHA

```bash
# Volume de sessões WAHA (autenticação WhatsApp — perder = exige novo QR scan)
docker run --rm \
  -v nexa_waha-data:/data \
  -v /root/backups:/backup \
  alpine tar czf /backup/waha_$(date +%Y%m%d).tar.gz /data

# Restauração
docker run --rm \
  -v nexa_waha-data:/data \
  -v /root/backups:/backup \
  alpine tar xzf /backup/waha_<data>.tar.gz -C /
```

---

## 4. Restauração do PostgreSQL

```bash
# 1. Parar o backend (evitar writes durante restore)
docker compose -f docker-compose.production.yml stop backend

# 2. Criar banco limpo
docker exec nexa-postgres-1 psql -U postgres -c "DROP DATABASE IF EXISTS nexa_restore;"
docker exec nexa-postgres-1 psql -U postgres -c "CREATE DATABASE nexa_restore;"

# 3. Restaurar
gunzip -c /root/backups/nexa_<timestamp>.sql.gz | \
  docker exec -i nexa-postgres-1 psql -U postgres nexa_restore

# 4. Validar contagem de tabelas
docker exec nexa-postgres-1 psql -U postgres nexa_restore -c "\dt" | wc -l

# 5. Renomear (prod → old, restore → prod)
docker exec nexa-postgres-1 psql -U postgres -c "ALTER DATABASE nexa RENAME TO nexa_old;"
docker exec nexa-postgres-1 psql -U postgres -c "ALTER DATABASE nexa_restore RENAME TO nexa;"

# 6. Subir backend
docker compose -f docker-compose.production.yml start backend
sleep 20 && curl -s http://localhost:3001/api/health
```

---

## 5. Plano de Recuperação Completa (Droplet perdido)

Sequência para recriar o ambiente do zero:

1. **Criar novo Droplet** — Ubuntu 22.04, mínimo 2GB RAM, mesma região
2. **Instalar Docker e Docker Compose**
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
3. **Clonar configuração**
   ```bash
   git clone https://github.com/<org>/nexa.git ~/nexa
   ```
4. **Restaurar `.env`** a partir do cofre de secrets (1Password / Vault / GitHub Secrets)
5. **Subir stack**
   ```bash
   cd ~/nexa
   docker compose -f docker-compose.production.yml pull
   docker compose -f docker-compose.production.yml up -d
   ```
6. **Restaurar banco** conforme seção 4
7. **Restaurar sessões WAHA** conforme seção 3
8. **Atualizar DNS** para apontar para o IP do novo Droplet
9. **Verificar health**: `curl https://app.nexa.com.br/api/health`
10. **Reconectar WhatsApp** se sessão WAHA não restaurada (novo QR scan)

---

## 6. Checklist Mensal de DR

- [ ] Fazer backup manual e restaurar em ambiente de staging
- [ ] Verificar que os crons de backup automático estão rodando
- [ ] Confirmar que os backups do Spaces têm arquivos recentes (< 25h)
- [ ] Rever RTO — tempo real de restauração vs. alvo de 4h
- [ ] Atualizar cofre de secrets com novos valores rotacionados

---

## 7. Itens Pendentes de Implementação

| Item | Prioridade | Responsável |
|------|-----------|-------------|
| Cron de backup diário PostgreSQL no Droplet | 🔴 Alta | DevOps |
| Envio automático para DO Spaces | 🔴 Alta | DevOps |
| Backup automático das sessões WAHA | 🟡 Média | DevOps |
| Migrar para DigitalOcean Managed PostgreSQL | 🟡 Média | Arquitetura |
| Teste de DR documentado (simulação de falha) | 🟡 Média | Time |
