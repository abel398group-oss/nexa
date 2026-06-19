# Documentação LGPD — Nexa

> Lei nº 13.709/2018 — Lei Geral de Proteção de Dados Pessoais
> Versão: 1.0 | Junho 2026
> Revisar a cada 12 meses ou após mudança de features.

---

## 1. Papel da Hiperviás no Tratamento de Dados

| Papel | Entidade | Responsabilidade |
|-------|----------|-----------------|
| **Controlador** | Hiperviás (operadora do Nexa) | Define finalidade e meios do tratamento |
| **Operador** | Hiperviás (na relação com clientes B2B) | Processa dados a pedido do controlador-cliente |
| **Suboperador** | Anthropic (Claude API), DigitalOcean | Infraestrutura |

Quando um cliente (ex: HiperTMS) contrata o Nexa, a Hiperviás atua como **operador** dos dados dos leads/clientes finais desse cliente. O **controlador** é o cliente que contratou o serviço.

---

## 2. Dados Pessoais Tratados

### 2.1 Dados dos Leads / Contatos Finais

| Campo | Tabela | Base legal | Finalidade |
|-------|--------|-----------|-----------|
| Número de telefone (WhatsApp) | `contacts.phone` | Legítimo interesse / Contrato | Atendimento e comunicação |
| Nome (WhatsApp pushname) | `contacts.name` | Legítimo interesse | Personalização de mensagens |
| E-mail | `contacts.email` | Consentimento | Canal alternativo de comunicação |
| Empresa | `contacts.company` | Legítimo interesse | Qualificação comercial |
| Histórico de conversas | `ai_messages` | Contrato | Contexto para atendimento da IA |
| Score de interesse | `contacts.interest_score` | Legítimo interesse | Priorização de vendas |
| Status opt-out | `contacts.status`, `contacts.opt_out_at` | Cumprimento de obrigação legal | Respeitar pedido de descadastro |

### 2.2 Dados dos Usuários do Painel (Operadores)

| Campo | Tabela | Base legal | Finalidade |
|-------|--------|-----------|-----------|
| E-mail corporativo | `users.email` | Contrato | Autenticação |
| Hash de senha | `users.password_hash` | Contrato | Segurança de acesso |
| IP de sessão | `sessions.ip` | Legítimo interesse | Segurança e auditoria |
| User-agent | `sessions.user_agent` | Legítimo interesse | Segurança |
| Logs de ação | `audit_logs` | Cumprimento de obrigação legal | Auditoria e compliance |

---

## 3. Base Legal por Operação

| Operação | Base legal (LGPD Art. 7º) |
|----------|--------------------------|
| Armazenar contato via WhatsApp (número publicamente usado para negócio) | Art. 7º, II — Legítimo interesse |
| Enviar resposta automática (IA) a mensagem recebida | Art. 7º, V — Execução de contrato |
| Enviar campanha para lista de contatos | Art. 7º, I — Consentimento (deve ser coletado pelo cliente) |
| Gravar histórico de conversa | Art. 7º, V — Execução de contrato |
| Executar opt-out imediato quando solicitado | Art. 7º, VI — Cumprimento de obrigação legal |
| Processar e-mail recebido | Art. 7º, II — Legítimo interesse |

---

## 4. Direitos dos Titulares e Como Atendê-los

| Direito (Art. 18) | Como o sistema suporta |
|-------------------|----------------------|
| **Acesso** aos dados | Via painel: `Contatos → ver perfil` mostra todos os dados do contato |
| **Correção** | Via painel: editar contato |
| **Eliminação** | Via painel: excluir contato (cascade em conversas) |
| **Portabilidade** | ⚠️ **Pendente**: endpoint de exportação CSV do contato |
| **Oposição / Opt-out** | Automático: contato envia "SAIR" via WhatsApp ou clica no link de opt-out do e-mail |
| **Revogação de consentimento** | Opt-out remove contato de futuras campanhas imediatamente |
| **Informação sobre compartilhamento** | Este documento + contrato com o cliente |

---

## 5. Fluxo de Opt-out Implementado

### 5.1 Via WhatsApp (automático)
```
Contato envia "SAIR" ou "DESCADASTRAR"
  → RouterAgent detecta intenção opt-out
  → contacts.status = 'opted_out', contacts.opt_out_at = now()
  → Conversa encerrada com outcome = 'opt_out'
  → Nenhuma mensagem futura enviada para este contato
  → IA responde confirmando o opt-out
```

### 5.2 Via E-mail (link em 2 passos)
```
Link no rodapé: "Responda SAIR para não receber mais mensagens"
  → Gera EmailOptOutToken (TTL 30 dias)
  → Contato clica no link de confirmação
  → contacts.status = 'opted_out'
  → EmailOptOutToken.used_at = now()
```

### 5.3 Via Painel (manual pelo operador)
```
Painel → Contatos → Contato → "Marcar como opt-out"
  → PATCH /contacts/:id/opt-out
  → contacts.status = 'opted_out'
```

---

## 6. Retenção e Exclusão de Dados

| Dado | Retenção | Justificativa |
|------|----------|---------------|
| Histórico de conversas | 2 anos | Compliance, disputas comerciais |
| Audit logs | 5 anos | Obrigação legal (Art. 37 LGPD) |
| Sessões expiradas/revogadas | 90 dias | Segurança e investigação |
| Dados de contato com opt-out | 6 meses | Período para atender solicitações de titulares |
| Tokens de opt-out expirados | 90 dias | Auditoria |

**⚠️ Para equipe:** Implementar job de limpeza automática (cron) para excluir dados além do período de retenção. Atualmente, os dados não são excluídos automaticamente.

---

## 7. Suboperadores e Transferência Internacional

| Suboperador | País | Dado transferido | Base legal para transferência |
|-------------|------|-----------------|------------------------------|
| Anthropic (Claude API) | EUA | Conteúdo das mensagens (sem nome/telefone) | Art. 33, VI — Cláusulas contratuais específicas |
| DigitalOcean | EUA | Todos os dados (hospedagem) | Art. 33, I — País com nível adequado de proteção |

**Mitigação Anthropic:** O conteúdo enviado à API da Anthropic nunca contém nome completo, CPF ou telefone do contato — apenas o texto da mensagem e o histórico anonimizado da conversa.

---

## 8. Medidas Técnicas de Segurança

| Medida | Status |
|--------|--------|
| HTTPS em todas as rotas | ✅ Implementado |
| Senhas com bcrypt (salt rounds 10) | ✅ Implementado |
| Credenciais de e-mail (SMTP/IMAP) não retornadas nas APIs | ✅ Implementado (`SAFE_SELECT`) |
| JWT com refresh token rotacionado | ✅ Implementado |
| Cookies HttpOnly + Secure | ✅ Implementado |
| Audit log de todas as ações administrativas | ✅ Implementado |
| Rate-limit em endpoints públicos (throttler) | ✅ Implementado |
| Rate-limit específico no canal e-mail (10/hora por remetente) | ✅ Implementado |
| Endpoint de exportação de dados (portabilidade) | ⚠️ Pendente |
| Criptografia em repouso no banco | ⚠️ Pendente (DO Managed DB oferece isso) |
| Job automático de exclusão de dados expirados | ⚠️ Pendente |

---

## 9. DPO (Data Protection Officer)

| Campo | Valor |
|-------|-------|
| DPO responsável | *(definir — pode ser o próprio responsável técnico)* |
| Canal para titulares | *(definir e-mail público, ex: privacidade@hipertms.com.br)* |
| Prazo de resposta | 15 dias úteis (conforme Art. 18 §3º LGPD) |

**⚠️ Para equipe:** Definir DPO e criar canal público de privacidade antes do go-to-market com múltiplos clientes.

---

## 10. Registro de Incidentes de Segurança

Incidentes que envolvam dados pessoais devem ser reportados à ANPD em até **72 horas** (Art. 48 LGPD) quando houver risco ou dano relevante aos titulares.

Template de registro: `docs/reviews/YYYY-MM-incidente-seguranca.md`
