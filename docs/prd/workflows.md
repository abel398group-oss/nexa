# PRD — Workflows n8n

> Especificação detalhada dos 4 workflows que compõem o sistema. Documenta o que cada
> um faz, nós, regras e critérios de aceite. Spec retroativa (o que já existe e funciona).

**Última atualização:** 2026-06

---

## Workflow 1 — WA Leads - Inbound

**ID:** `wvs5wxIm6OtVuZ51` · **Gatilho:** Webhook (ativo 24h) · **Status:** ✅ Produção

### Objetivo
Receber mensagens do WhatsApp, classificar a intenção com IA e responder
automaticamente, mantendo contexto e cordialidade.

### Fluxo de nós
```
Webhook
 → Normalize Inbound Message  (extrai phone, detecta mídia e opt-out, trata @lid)
 → If Media?
     SIM → Send Media Reply ("manda por texto") → fim
     NÃO → If Valid Inbound
 → Upsert Inbound Contact
 → Check Rate Limit (ignora se classificou nos últimos 12s)
 → If Not Rate Limited
 → Create Inbound Interaction
     ├→ Update Replied At (marca resposta no message_logs — ramo paralelo)
     └→ Fetch AI Knowledge → Fetch Conversation History
 → Build Claude Payload  (monta prompt: conhecimento + histórico + regras)
 → Claude Classify Intent (HTTP Anthropic, retry 2x)
 → Parse Claude Classification (limpa markdown, fallback seguro)
 → Save AI Classification
 → If (opt_out?)
     TRUE  → Upsert Opt Out → Update Contact Opted Out → Opt Out Finalizado
     FALSE → Update Lead Qualification
             → Reply Delay (3-6s) → Wait → Send Lead Auto Reply
             → Save Auto Reply Interaction (salva resposta no histórico)
             → Create Opportunity → Register Opportunity Stage History
             → Check Seller Notification → If Not Notified → If Needs Human
             → Fetch Contact Name → Get Next Seller (round robin)
             → Notify Seller WhatsApp → Create/Register Seller Notification
```

### Regras
- **Telefone válido:** prefixo 55, 12-13 dígitos. Trata sufixo `:device` e `@lid`
- **Mídia** (áudio/foto sem texto): responde pedindo texto, não processa IA
- **Rate limit:** 12s desde a última classificação (anti-spam, anti-resposta-dupla)
- **Saudação:** adaptada ao horário de Brasília (bom dia/tarde/noite)
- **Despedida:** cordial, tenta capturar contato
- **Ofensas:** IA não revida; se agressivo repetido → needs_human
- **Reclamação:** detecta e categoriza internamente (is_complaint + topic)
- **Histórico:** últimas 24h injetadas no prompt (a IA lembra o que já disse)

### Critérios de aceite
- [x] Responde mensagem de texto com contexto
- [x] Não repete informações já ditas
- [x] Opt-out (SAIR) zera score e bloqueia
- [x] Score >= 70 cria oportunidade e notifica vendedor
- [x] Mídia recebe resposta automática
- [x] Telefone @lid é extraído corretamente

---

## Workflow 2 — WA Leads - Sender

**ID:** `Jufscd5ptwXGm8CK` · **Gatilho:** Manual · **Status:** ✅ Funcional

### Objetivo
Disparar campanha de prospecção respeitando horário comercial, limite diário do
número e personalizando a mensagem.

### Fluxo de nós
```
Manual Trigger
 → If Horário Comercial (7h-19h)
 → Reset Daily Counter (zera sent_today se virou o dia)
 → Fetch Campaign Contacts (LIMIT = cota restante do dia no number_pool)
 → Loop Over Items
     → Create Pending Log
     → Random Delay (personaliza: nome + saudação por horário; delay 2-10s teste)
     → Wait
     → Send WhatsApp Message
     → Update Log Sent
     → Increment Sent Counter (+1 no number_pool)
     → Create Outbound Interaction → loop
```

### Regras
- **Horário comercial:** só dispara entre 7h e 19h
- **Limite diário:** definido no `number_pool` (atual: 30/dia)
- **Deduplicação:** não reenvia para quem já recebeu (sent/pending/opted_out)
- **Opt-out:** exclui quem está em `opt_outs`
- **Personalização:** "Boa tarde, João!" (saudação por horário + primeiro nome)
- **Rodapé:** "_Para não receber mais mensagens, responda SAIR_"
- **Delay produção:** 30-90s entre envios (hoje em 2-10s para teste)

### Critérios de aceite
- [x] Não dispara fora do horário comercial
- [x] Para automaticamente ao atingir o limite diário
- [x] Personaliza com nome e saudação correta
- [x] Não reenvia para quem já recebeu

---

## Workflow 3 — WA Leads - Follow Up

**ID:** `y5HOzgJ6a652hncF` · **Gatilho:** Manual (agendamento 10h pendente) · **Status:** ✅ Funcional

### Objetivo
Recontatar automaticamente leads que receberam a campanha mas não responderam.

### Fluxo de nós
```
Manual Trigger
 → Fetch Follow Up Contacts (status sent, sem replied_at, passou o tempo)
 → Loop Over Items → Send Follow Up → Update Follow Up Log → loop
```

### Regras
- **Follow-up 1:** 24h sem resposta (minutes_after usado em teste)
- **Follow-up 2:** 72h sem resposta
- **Máximo:** 2 follow-ups por contato
- **Exclusões:** quem respondeu (replied_at), quem fez opt-out
- **Personalização:** primeiro nome

### Critérios de aceite
- [x] Só envia para quem NÃO respondeu
- [x] Respeita o tempo configurado
- [x] Não envia mais de 2 follow-ups
- [ ] Roda automaticamente às 10h (pendente: criar Schedule Trigger via UI)

---

## Workflow 4 — WA Supervisor - IA

**ID:** `ZdX7oR57wYL6rKFU` · **Gatilho:** Manual (agendamento 22h pendente) · **Status:** ✅ Funcional

### Objetivo
Auditar a qualidade do atendimento da IA usando uma 2ª IA (mesma Claude, prompt
de auditor). Gera nota e sugestões de melhoria — feedback para ajuste manual do prompt.

### Fluxo de nós
```
Manual Trigger
 → Fetch Conversations (conversas das últimas 24h com auto_reply)
 → Loop Over Items
     → Build Audit Payload (prompt de auditor)
     → Claude Audit (HTTP Anthropic, retry 2x)
     → Parse Audit (limpa markdown)
     → Save Audit (ai_quality_audits) → loop
```

### Saída por conversa
- `quality_score` (0-100)
- `has_repetition` (IA repetiu?)
- `lead_confused` (lead confuso?)
- `problems` (problemas detectados)
- `suggestion` (como melhorar o prompt)
- `summary` (resumo)

### Critérios de aceite
- [x] Analisa cada conversa do dia
- [x] Gera nota e sugestões acionáveis
- [x] Não altera nada no atendimento (só observa)
- [ ] Roda automaticamente às 22h (pendente: criar Schedule Trigger via UI)

---

## Observação sobre agendamento

Gatilhos de horário (Schedule Trigger) devem ser criados **pela interface do n8n** —
injeção via banco de dados não registra o trigger corretamente neste setup.
Workflows 3 e 4 rodam manual por enquanto; agendamento será configurado na migração.
