# ADR 001 — Arquitetura de Agentes de IA

## Status: Aceito

## Contexto

Precisamos de uma IA que venda e suporte via WhatsApp sem duplo-envio, com kill switch e supervisão.

## Decisão

- **Orquestrador único** (ConversationAgentService): só ele envia mensagens. Agentes apenas geram rascunhos.
- **Supervisora** audita ANTES do envio — nunca bloqueia silenciosamente, usa safe fallback.
- **Kill switch** via AutonomyService: desliga auto-envio sem parar o sistema.
- **TMS routing**: se remetente é cliente TMS → rota muda de `sales` para `support` automaticamente.

## Consequências

- Elimina double-send (BUG-02 resolvido)
- Permite auditoria humana de qualquer rascunho
- TMS lookup acrescenta ~50ms por mensagem inbound (batchLookup otimizado)
