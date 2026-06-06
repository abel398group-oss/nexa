# Auditoria Técnica Cirúrgica — Estado REAL do MVP n8n

> Relatório do que está IMPLEMENTADO de fato (não o documentado). Para validar com o GPT
> e cruzar contra a documentação de arquitetura — achar o que passou batido.
> Levantado direto do banco e dos containers em 2026-06.

---

## 1. INFRAESTRUTURA (real, via `docker ps` + env)

| Container | Imagem | Status |
|---|---|---|
| wa_leads_n8n (main) | n8nio/n8n:**1.123.49** | Up |
| wa_leads_n8n_worker | n8nio/n8n:1.123.49 | Up |
| wa_leads_waha | devlikeapro/waha:**latest** | Up |
| wa_leads_postgres | postgres:16.3-alpine | Up |
| wa_leads_redis | redis:7.2.5-alpine | Up |

**Configuração n8n (confirmada via env):**
- `EXECUTIONS_MODE=queue` ✅ (modo fila com Redis — production-ready)
- `EXECUTIONS_DATA_PRUNE=true`, `EXECUTIONS_DATA_MAX_AGE=336` (14 dias) ✅
- `N8N_PROTOCOL=http` ⚠️ (sem HTTPS)
- `WEBHOOK_URL=http://localhost:5688/` ⚠️ (localhost, não produção)
- `N8N_BASIC_AUTH` → **NÃO configurado** ⚠️ (painel n8n sem auth)

---

## 2. WORKFLOWS (4 — estado real)

| Workflow | ID | Ativo | Nós |
|---|---|---|---|
| WA Leads - Inbound | wvs5wxIm6OtVuZ51 | ✅ Sim | 34 |
| WA Leads - Sender | Jufscd5ptwXGm8CK | ❌ Manual | 12 |
| WA Leads - Follow Up | y5HOzgJ6a652hncF | ❌ Manual | 5 |
| WA Supervisor - IA | ZdX7oR57wYL6rKFU | ❌ Manual | 7 |

### Inbound (34 nós) — fluxo real
```
Webhook → Normalize → If Media → If Valid Inbound → Upsert Contact
→ Update Replied At (paralelo) → Check Rate Limit → If Not Rate Limited
→ Create Inbound Interaction → Fetch AI Knowledge → Fetch Conversation History
→ Build Claude Payload → Claude Classify Intent → Parse Classification
→ Save AI Classification → If (opt_out)
   TRUE: Upsert Opt Out → Update Contact Opted Out → Opt Out Finalizado
   FALSE: Update Lead Qualification → Reply Delay → Wait Reply
          → Send Lead Auto Reply → Save Auto Reply Interaction
          → Create Opportunity → Register Stage History → Check Seller Notification
          → If Not Notified → If Needs Human → Fetch Contact Name → Get Next Seller
          → Notify Seller WhatsApp → Create/Register Seller Notification
```

---

## 3. 🔴 SEGURANÇA (achados críticos)

| # | Achado | Severidade |
|---|---|---|
| 1 | **Anthropic API key hardcoded** (`sk-ant-...`) em Inbound + Supervisor | 🔴 Crítico |
| 2 | **WAHA key hardcoded** (`Inicial398!`) em TODOS os 4 workflows | 🔴 Crítico |
| 3 | **Webhook SEM autenticação** (`authentication=NENHUMA`, path `waha-inbound`) | 🔴 Crítico |
| 4 | **n8n sem HTTPS** (`N8N_PROTOCOL=http`) | 🔴 Crítico |
| 5 | **Painel n8n sem auth** (`N8N_BASIC_AUTH` não configurado) | 🔴 Crítico |
| 6 | **N8N_ENCRYPTION_KEY fraca** = `Inicial398!_n8n_local_key_2026` (contém a senha do WAHA) | 🟠 Alto |
| 7 | Senha Redis em texto no env (`wa_leads_redis_password_local`) | 🟡 Médio |
| 8 | Só 1 credencial gerenciada no n8n (Postgres). Resto é hardcoded | 🟠 Alto |

> Qualquer um que descobrir a URL do webhook pode injetar mensagens falsas (sem auth).

---

## 4. CAMADA DE DADOS

### Tabelas (16) + registros atuais (ambiente de teste)
```
contacts: 6 · contact_interactions: 26 · ai_classifications: 12
ai_knowledge_base: 10 · ai_quality_audits: 0 · opportunities: 0
opt_outs: 0 · sellers: 2 · seller_notifications: 0
campaigns: 2 · campaign_messages: 2 · message_logs: 2
follow_up_messages: 2 · number_pool: 1 · round_robin_state: 1
```

### Índices (bem cobertos ✅)
- contacts: phone (unique), status, email, company, cnpj, city
- contact_interactions: contact_id, phone, campaign_id, created_at
- ai_classifications: phone, intent, created_at
- message_logs: phone, campaign+status, sent_at
- opt_outs: phone (unique)

> Performance de leitura OK para o volume atual. Faltam índices em colunas novas
> (read_at, replied_at, follow_up_count) se forem muito consultadas.

---

## 5. TRATAMENTO DE ERRO (lacunas)

| Nó HTTP | onError |
|---|---|
| Inbound / Claude Classify Intent | ✅ continueRegularOutput |
| Inbound / Send Lead Auto Reply | ✅ continueRegularOutput |
| Inbound / Notify Seller WhatsApp | ✅ continueRegularOutput |
| Sender / Send WhatsApp Message | ✅ continueRegularOutput |
| **Inbound / Send Media Reply** | ❌ **NENHUM** |
| **Follow Up / Send Follow Up** | ❌ **NENHUM** |
| **Supervisor / Claude Audit** | ❌ **NENHUM** |

> 3 nós HTTP sem proteção de erro — podem quebrar o fluxo em falha de rede.

### Taxa de erro (execuções últimos 7 dias)
```
success: 374 · error: 53 (~12%) · canceled: 1
Erros por workflow: Inbound 39 · Sender 10 · Follow-up 4
```
> Maioria dos erros é de desenvolvimento/testes (ajustes que fizemos). Mas a taxa
> precisa ser monitorada em produção (sem observabilidade hoje).

---

## 6. CONFIGURAÇÃO ATUAL (valores reais)

| Parâmetro | Valor atual | Produção? |
|---|---|---|
| Rate limit inbound | 12 segundos | ✅ |
| Reply delay (humanização) | 3-6 segundos | ✅ |
| Delay entre envios (Sender) | 2-10s | ⚠️ produção = 30-90s |
| Horário comercial (Sender) | 7h-19h | ✅ |
| Limite diário (number_pool) | 30/dia | ✅ (conservador) |
| Limite por hora | 10/hora | ✅ |
| Follow-up | 24h / 72h | ✅ |
| Modelo Claude | claude-haiku-4-5-20251001 | ✅ |

---

## 7. LACUNAS vs DOCUMENTAÇÃO (o que existe no doc mas NÃO no n8n)

| Item documentado | Existe no n8n? |
|---|---|
| correlationId (rastreio ponta a ponta) | ❌ Não existe |
| domain_events / outbox / DLQ | ❌ Não existe |
| Idempotência em ações | ❌ Não existe |
| Auditoria estruturada (ai_actions) | ❌ Não (só ai_classifications) |
| Agendamento automático (Follow-up/Supervisor) | ❌ Manual (cron não registra via banco) |
| Multi-tenant (tenant_id) | ❌ Single-tenant |
| Conectores / billing | ❌ Não existe |
| Observabilidade | ❌ Não existe |

> **Esperado:** o n8n é o MVP (Fase 0). Esses itens vêm na plataforma NestJS. O ponto é
> confirmar que NADA do MVP atual será desperdiçado e que a migração é incremental.

---

## 8. PONTOS POSITIVOS (o que está bem feito)

- ✅ Modo fila (Redis) desde já — pronto para escala
- ✅ Pruning de execuções configurado (não enche o banco)
- ✅ Índices bem distribuídos
- ✅ Tratamento de mídia, @lid, ofensas, saudação por horário
- ✅ Rate limiting + humanização + number_pool (anti-ban)
- ✅ Round robin + dedup de notificação
- ✅ IA Supervisora funcionando
- ✅ Base de conhecimento dinâmica (10 registros)
- ✅ Retry + continueOnFail na maioria dos HTTP

---

## 9. MATRIZ DE RISCO (priorizada para produção)

| Prioridade | Item | Ação |
|---|---|---|
| 🔴 P0 | Secrets hardcoded (Anthropic/WAHA) | Mover para env/credenciais |
| 🔴 P0 | Webhook sem auth | Token/assinatura no webhook |
| 🔴 P0 | Sem HTTPS | SSL + domínio |
| 🔴 P0 | Painel n8n sem auth | Ativar N8N_BASIC_AUTH |
| 🟠 P1 | Encryption key fraca | Gerar chave forte (e rotacionar credenciais) |
| 🟠 P1 | 3 nós HTTP sem onError | Adicionar continueOnFail |
| 🟠 P1 | Delay Sender 2-10s | Voltar 30-90s antes do disparo real |
| 🟡 P2 | Agendamento manual | Criar Schedule Trigger via UI |
| 🟡 P2 | Sem observabilidade | Logs/métricas (vem na plataforma) |
| 🟡 P2 | WAHA `latest` (sem versão fixa) | Pinar versão |

---

## 10. PERGUNTAS PARA O GPT (validação cruzada)

1. Olhando o estado real do n8n + a documentação, **algo passou batido**?
2. Os 4 itens P0 de segurança são suficientes antes de qualquer disparo real?
3. A migração n8n → plataforma NestJS aproveita 100% do MVP ou há retrabalho escondido?
4. Falta algum dado/tabela no MVP que deveria começar a ser coletado JÁ?
5. A taxa de erro de ~12% (dev) é aceitável ou indica fragilidade estrutural?

---

## 11. VALIDAÇÃO CRUZADA — achados adicionais do GPT (incorporados)

### Segurança que passou batido (além dos 8)
- **Webhook precisa de assinatura + anti-replay:** não basta token fixo. Ideal `x-signature`
  + timestamp + rejeitar replay (mensagem repetida/forjada).
- **WAHA exposto?** Confirmar que a porta/API do WAHA NÃO está acessível externamente.
- **Postgres/Redis expostos?** Confirmar que as portas internas (5432/6379) NÃO estão abertas
  para a internet.
- **Execuções do n8n guardam segredo:** se a API key aparece em payload/log de execução,
  limpar o histórico DEPOIS de rotacionar a key.
- **Trocar N8N_ENCRYPTION_KEY com cuidado:** se houver credencial criptografada pelo n8n,
  trocar a key sem migração quebra as credenciais. Planejar.
- **Backup só vale com teste de RESTORE:** backup automático + testar restauração de verdade.
- **WAHA `latest`:** pinar versão (update pode quebrar).

### P0 OBRIGATÓRIO antes de disparo real (lista refinada do GPT)
```
1. Revogar e trocar a Anthropic key
2. Trocar a WAHA key
3. Tirar TODOS os secrets hardcoded dos workflows
4. Webhook com autenticação/assinatura (+ anti-replay)
5. HTTPS com domínio
6. n8n protegido com auth/user management
7. WAHA, Postgres e Redis NÃO expostos publicamente
8. Backup + teste de restore
```
> Sem TODOS esses, não fazer disparo real.

### Migração n8n → NestJS (estimativa honesta do GPT)
- **70-80% reaproveitável** como regra/experiência (negócio, prompts, tabelas, conhecimento,
  classificação, opt-out, round robin, number pool, supervisora)
- **40-50% reaproveitável** como implementação direta
- **Retrabalho escondido:** transformar nodes em serviços NestJS, criar idempotência,
  padronizar eventos, criar correlationId, normalizar histórico, separar regra/integração/prompt

### 🟢 DADOS A COLETAR JÁ no MVP (evita dor na migração)
Adicionar agora, mesmo no n8n (principalmente os 2 primeiros):
```
correlation_id ⭐ · source_message_id (wa_message_id) ⭐ · provider_message_id ·
workflow_execution_id · prompt_version · kb_version · ai_model · error_code ·
error_message · retry_count · idempotency_key · opt_out_at · consent_source
```
> `correlation_id` e `source_message_id` são os que mais evitam retrabalho. O
> `source_message_id` também resolve **idempotência por mensagem** (não responder duplicado).

### Metas de taxa de erro
- Dev: ~12% aceitável
- Produção: **< 5%** no começo, **< 2%** estabilizado
- Erro de envio/pagamento/opt-out: **quase zero**

---

## 12. PRIORIZAÇÃO FINAL (consolidada com o GPT)
```
P0 (antes de QUALQUER produção):
   Secrets + webhook(assinatura+anti-replay) + HTTPS + auth n8n + firewall
   + WAHA/PG/Redis não expostos + backup com teste de restore

P1 (robustez):
   onError nos 3 nós HTTP + delay Sender 30-90s + pinar versão WAHA

P2 (preparar migração):
   correlation_id + source_message_id (idempotência) + agendamentos automáticos
```

### ⚠️ DECISÃO: tudo fica para o momento do 1º disparo real
Nada será alterado no MVP agora. No momento em que o usuário decidir disparar de verdade,
ele decide TAMBÉM se sobe para o Digital Ocean ou dispara no localhost. Os itens abaixo
são preparados nesse momento, conforme a escolha.

### CHECKLIST — ANTES DO 1º DISPARO REAL (decidir local vs Digital Ocean)

**Se disparar no LOCALHOST (mínimo obrigatório):**
- [ ] Delay Sender → 30-90s (hoje 2-10s — evitar ban do número)
- [ ] Adicionar `source_message_id` (wa_message_id) → idempotência (não responder duplicado)
- [ ] Adicionar `correlation_id` (rastreio — aproveitar que vai mexer)
- [ ] Backup do PostgreSQL (não perder leads reais se a máquina/docker quebrar)
- [ ] Garantir máquina sempre ligada (senão lead manda msg e ninguém responde)
- [ ] Confirmar número aquecido (30/dia é conservador p/ número novo — ok começar)

**Se subir para o DIGITAL OCEAN (tudo acima + hardening completo):**
- [ ] Os 8 itens P0 de segurança (secrets, webhook auth+assinatura, HTTPS, n8n auth,
      WAHA/PG/Redis não expostos, backup com teste de restore)
- [ ] P1: onError nos 3 nós HTTP, pinar versão WAHA
- [ ] Delay 30-90s + source_message_id + correlation_id (mesmos do localhost)

> Risco dos secrets hardcoded é MENOR no localhost (não exposto à internet) — por isso
> HTTPS/firewall/secrets podem esperar o DO. Mas anti-ban, idempotência e backup valem
> nos DOIS cenários.

### Veredito
> O MVP está **bem construído para validação**, mas **NÃO está seguro para produção** ainda.
> A arquitetura futura está certa. O trabalho imediato é **hardening do n8n**, não mais
> planejamento. Tudo isso é resolvido na **migração para o Digital Ocean** (fase de deploy).
