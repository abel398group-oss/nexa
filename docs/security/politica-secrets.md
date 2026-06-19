# Política de Secrets e Rotação de Credenciais

> Versão: 1.0 | Junho 2026

---

## 1. Inventário de Secrets

| Secret | Onde fica | TTL recomendado | Impacto se comprometido |
|--------|-----------|----------------|------------------------|
| `JWT_SECRET` | `.env` + GitHub Secret | 90 dias | Todos os tokens ativos ficam inválidos após rotação |
| `DATABASE_URL` (senha PostgreSQL) | `.env` + GitHub Secret | 180 dias | Acesso total ao banco |
| `ANTHROPIC_API_KEY` | `.env` + GitHub Secret | 90 dias | Custo inesperado + acesso à IA |
| `WAHA_API_KEY` | `.env` | 180 dias | Controle total do WhatsApp |
| `SMTP_PASS` / `IMAP_PASS` | banco (`email_channels`) | 180 dias | Envio de e-mails não autorizados |
| `DOCKERHUB_TOKEN` | GitHub Secret | 90 dias | Push de imagens maliciosas |
| `DROPLET_SSH_KEY` | GitHub Secret + local | 1 ano | Acesso root ao servidor |
| `TMS_SERVICE_TOKEN` | `.env` | 90 dias | Acesso à API do TMS |

---

## 2. Onde NÃO guardar secrets

- ❌ Jamais em código-fonte (arquivos `.ts`, `.js`, `.env.example` com valores reais)
- ❌ Jamais em logs do servidor (verificar que nenhuma variável de env é logada no boot)
- ❌ Jamais em comentários de PRs ou issues do GitHub
- ❌ Jamais em variáveis de ambiente não criptografadas em imagens Docker

---

## 3. Onde guardar secrets

| Ambiente | Onde guardar |
|----------|-------------|
| Produção (Droplet) | Arquivo `.env` no Droplet com `chmod 600`, apenas root lê |
| CI/CD (GitHub Actions) | GitHub Secrets (Settings → Secrets → Actions) |
| Time de desenvolvimento | Gestor de senhas compartilhado (1Password Team / Bitwarden Business) |
| Backup | Cofre offline criptografado (gestor de senhas ou KMS) |

---

## 4. Procedimento de Rotação

### 4.1 Rotar `JWT_SECRET`

```bash
# 1. Gerar novo secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# 2. Atualizar .env no Droplet
ssh root@<DROPLET_IP>
nano ~/nexa/.env
# Substituir JWT_SECRET=<novo_valor>

# 3. Atualizar GitHub Secret
# Settings → Secrets → JWT_SECRET → Update

# 4. Reiniciar backend (invalida todos os tokens ativos — usuários precisam relogar)
docker compose -f docker-compose.production.yml restart backend

# 5. Documentar rotação neste arquivo (seção 7)
```

**Atenção:** Rotar o JWT_SECRET desconecta TODOS os usuários ativos. Fazer em janela de baixo uso.

### 4.2 Rotar senha do PostgreSQL

```bash
# 1. Gerar nova senha
openssl rand -base64 32

# 2. Alterar no banco
docker exec nexa-postgres-1 psql -U postgres -c \
  "ALTER USER postgres PASSWORD '<nova_senha>';"

# 3. Atualizar DATABASE_URL no .env e GitHub Secret

# 4. Reiniciar backend
docker compose -f docker-compose.production.yml restart backend
```

### 4.3 Rotar chave SSH do Droplet

```bash
# 1. Gerar novo par de chaves localmente
ssh-keygen -t ed25519 -C "deploy-nexa-$(date +%Y%m)" -f ~/.ssh/nexa_deploy_new

# 2. Adicionar nova chave pública ao Droplet
ssh root@<DROPLET_IP> "echo '$(cat ~/.ssh/nexa_deploy_new.pub)' >> ~/.ssh/authorized_keys"

# 3. Testar login com a nova chave
ssh -i ~/.ssh/nexa_deploy_new root@<DROPLET_IP> echo "OK"

# 4. Remover chave antiga do Droplet
# nano ~/.ssh/authorized_keys → deletar linha da chave antiga

# 5. Atualizar GitHub Secret DROPLET_SSH_KEY com o conteúdo da nova chave privada
```

---

## 5. Detecção de Vazamento

Se suspeitar que um secret foi comprometido:

1. **Revogar imediatamente** — não esperar confirmação
2. Gerar e aplicar novo valor (seção 4)
3. Verificar logs de acesso para identificar uso indevido:
   ```bash
   # Acessos ao banco fora do horário normal
   docker exec nexa-postgres-1 psql -U postgres -c \
     "SELECT * FROM audit_logs WHERE created_at > now() - interval '7 days' ORDER BY created_at DESC LIMIT 50;"
   ```
4. Verificar uso da Anthropic API key em `console.anthropic.com`
5. Registrar incidente em `docs/reviews/YYYY-MM-incidente-seguranca.md`
6. Se dados pessoais expostos → notificar ANPD em 72h (ver LGPD.md)

---

## 6. Secrets que precisam de implementação adicional

| Item | Status | Ação necessária |
|------|--------|----------------|
| Senhas SMTP/IMAP no banco em texto plano | ⚠️ **Pendente** | Criptografar com chave derivada de `APP_SECRET` antes de salvar |
| `TMS_SERVICE_TOKEN` ainda não validado em prod | ⚠️ **Pendente** | Validar com time TMS |
| Rotação automática de JWT (sem logout forçado) | 🔵 Melhoria futura | Implementar refresh token sliding window |

---

## 7. Log de Rotações

| Data | Secret | Rotacionado por | Motivo |
|------|--------|----------------|--------|
| *(a preencher)* | | | Primeira rotação pós-deploy |
