---
type: manual
tags: [manual, administracao, usuarios, platform-admin, permissoes]
updated: 2026-07-07
summary: Manual do usuário — administração do Nexa (usuários, permissões, platform admin).
---

# Manual 08 — Administração

---

## Gerenciar usuários

Acesse **Configurações → Usuários**.

### Convidar usuário

1. Clique em **"Convidar usuário"**
2. Insira o e-mail
3. Selecione o papel (role):
   - **Admin** — acesso total, pode gerenciar usuários e configurações
   - **Operador** — atende conversas, acessa inbox e contatos
   - **Visualizador** — somente leitura (analytics, relatórios)
4. Clique em **Enviar convite**

O usuário recebe um e-mail com link para criar senha.

### Remover usuário

1. Na lista de usuários, clique no usuário
2. **"Remover acesso"**
3. Conversas em andamento são devolvidas ao inbox geral

### Alterar papel

1. Clique no usuário
2. **"Alterar papel"** → selecione o novo papel
3. Confirme

---

## Papéis e permissões

| Permissão | Admin | Operador | Visualizador |
|---|---|---|---|
| Atender conversas | ✅ | ✅ | ❌ |
| Ver analytics | ✅ | ✅ | ✅ |
| Configurar Lia | ✅ | ❌ | ❌ |
| Gerenciar KB | ✅ | ✅ | ❌ |
| Convidar usuários | ✅ | ❌ | ❌ |
| Ver dados de faturamento | ✅ | ❌ | ❌ |
| Conectar WhatsApp | ✅ | ❌ | ❌ |
| Configurar Monitor TMS | ✅ | ❌ | ❌ |

---

## Platform Admin (multi-tenant)

> Funcionalidade disponível apenas para a equipe interna Hipervias.

O **Platform Admin** permite atuar dentro de um tenant específico para diagnóstico
e suporte sem precisar de credenciais do cliente.

### Acessar como tenant (acting-as)

1. Acesse **Platform Admin → Tenants**
2. Busque o tenant pelo nome ou ID
3. Clique em **"Atuar como"**
4. Um banner laranja aparece: *"Atuando como: Nome do Tenant"*
5. Tudo que você fizer é registrado no audit log

### Encerrar sessão acting-as

Clique em **"Sair do modo acting-as"** no banner laranja.

> Toda sessão de acting-as fica registrada em `audit_log` com timestamp,
> usuário e ações realizadas. Não é possível apagar esse log.

---

## Monitorar uso da plataforma

Acesse **Analytics → Uso da plataforma**:

| Métrica | Descrição |
|---|---|
| **Conversas este mês** | Total e por canal |
| **Usuários ativos** | Quem está usando e com que frequência |
| **Respostas da Lia** | Volume de mensagens automáticas |
| **Taxa de disponibilidade** | Uptime do WhatsApp e sistemas |
| **Tickets abertos vs. fechados** | Saúde do suporte |

**Exportar relatório:** clique em **"Exportar"** → CSV ou PDF.

---

## Audit Log

Acesse **Configurações → Audit Log** para ver:

- Logins e logouts
- Mudanças de configuração
- Sessões de acting-as
- Exportações de dados
- Alterações de permissão

O log é imutável — não pode ser apagado ou editado.

---

## Backup e dados

Para solicitar exportação completa dos dados da conta:

1. Acesse **Configurações → Dados**
2. Clique em **"Solicitar exportação"**
3. Receba por e-mail em até 24h (arquivo ZIP com JSON)

> Ao encerrar contrato, os dados ficam disponíveis por 30 dias para exportação.
> Após esse período, são apagados conforme política LGPD.
