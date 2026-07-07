# Migration Plan — MVP n8n → Plataforma NestJS

> Como migrar do MVP atual (n8n dono dos dados) para a plataforma, SEM perder histórico
> e SEM cair no Dual Write Problem. Derivado da análise do GPT.

**Status:** Proposto · **Data:** 2026-06

---

## O problema central: Dual Write

Durante a transição, há risco de **dois donos escrevendo o mesmo dado**:
```
          WAHA
           ↓
          n8n
        ↙     ↘
  BD antigo   Plataforma nova   ← DOIS donos = divergência/duplicidade
```

## A solução (decisão arquitetural)

**Quando a plataforma nascer, o n8n vira CONSUMIDOR, não dono dos dados.**
```
ANTES:  WAHA → n8n → Postgres (n8n é dono)
DEPOIS: WAHA → Backend NestJS → Banco (backend é dono)
                  ↑
                 n8n apenas executa automações pontuais (consumidor)
```
> Isso elimina ~80% dos problemas de sincronização. Um único dono de escrita.

---

## Dados a migrar (do MVP atual)
| Tabela MVP | Destino na plataforma | Observação |
|---|---|---|
| `contacts` | contacts (plataforma) | mapear campos; gerar `id` uuid |
| `contact_interactions` | ai_conversations + ai_messages | quebrar em conversa/mensagem |
| `ai_classifications` | ai_messages (intent/tokens) | alimentar histórico |
| `ai_knowledge_base` | ai_knowledge_base + versions | versionar + aprovar |
| `sellers` | sellers (ou config) | — |
| `number_pool` | number_pool | — |
| `opt_outs` | opt_outs (+ opt_out_at, consent_source) | enriquecer |
| `campaigns/campaign_messages/message_logs` | campanhas (plataforma) | — |

## Fases da migração

### Fase 1 — Plataforma lê, n8n ainda escreve (paralelo seguro)
- Backend sobe lendo o banco; n8n continua dono
- Validar que a plataforma lê corretamente os dados do MVP

### Fase 2 — Backend assume a escrita do INBOUND
- WAHA passa a chamar o **Backend** (não mais o n8n) no recebimento
- Backend grava conversa/mensagem/classificação
- n8n para de ser dono do inbound

### Fase 3 — Backend assume o resto (campanhas, follow-up)
- Sender/Follow-up migram para o backend (ou n8n chama a API do backend)
- n8n vira executor de automações pontuais, sem escrever dado de domínio

### Fase 4 — Backfill do histórico
- Script de migração (idempotente) move o histórico antigo para o novo modelo
- Preencher `correlation_id` retroativo onde possível (ou marcar legado)

---

## Cuidados
- **Idempotência:** usar `source_message_id` para não duplicar na migração
- **Janela de corte:** definir um momento claro onde a escrita passa do n8n para o backend
- **Rollback:** manter o MVP funcionando até a plataforma estar validada
- **Sem perda:** não desligar o n8n antes do backfill completo e conferido

## Pré-requisitos
- ADR 011 (source of truth) define quem assume cada dado
- Schema da plataforma pronto (✅ schema.prisma)
- `correlation_id` + `source_message_id` capturados antes do disparo real (AUDITORIA P0)

> Recomendação: executar este plano a partir do **Sprint 3** (quando o backend já grava
> conversas), não antes.
