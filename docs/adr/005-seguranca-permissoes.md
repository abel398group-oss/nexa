# ADR 005 — Segurança e Permissões (RBAC, LGPD, Retenção)

**Status:** Proposto · **Data:** 2026-06

## Contexto
Sistema SaaS multitenant com IA que toca dados pessoais, financeiro e acesso. Precisa de
controle de quem faz o quê, conformidade legal e gestão de dados.

## Decisão

### D1 — RBAC (quem pode pedir)
Controlar o solicitante, não só a ação da IA:

| Perfil | Pode |
|---|---|
| Admin | Tudo |
| Gestor | Operação |
| Operacional | Uso do sistema |
| Financeiro | Cobranças |
| IA | Read-only (solicita; backend executa conforme perfil do solicitante) |

### D2 — Isolamento por tenant
`tenant_id` derivado do contexto autenticado, em TODA query. Nunca do body/da fala do lead.

### D3 — Autorização granular (CASL)
Espelhar o HiperTMS: abilities no backend, UI consome para esconder/mostrar.

### D4 — LGPD operacional
- Direito de exclusão, exportação, consentimento, anonimização
- Conversas/memória/health score = dado pessoal → tratados sob LGPD

### D5 — Política de retenção
- Mensagens: 24 meses · Auditoria: 60 meses · Financeiro: conforme legislação
- Após prazo → anonimizar ou expurgar (tabela `audit_retention`)

### D6 — Secrets
- Fora do repo (.env / secret manager)
- Nunca logar JWT, keys, credenciais, payloads sensíveis

## Consequências
- (+) Reduz risco de vazamento, fraude e problema jurídico
- (+) Conformidade legal desde o design
- (−) Mais validações no backend (custo de desenvolvimento)

## Regra de ouro
A IA conversa e recomenda; o backend valida identidade, tenant, perfil e executa.
