# PRD — Campanhas (Disparos em Lote)

## Visão geral

Campanhas permitem disparar mensagens WhatsApp em lote para uma lista de contatos. O sistema respeita opt-out (LGPD), filtra clientes TMS ativos, aplica anti-ban (delay 30-90s entre envios) e controla limite diário por aquecimento do número.

## Personas

- Vendedor/SDR: cria campanhas de prospecção com templates personalizados.
- Gestor: monitora status dos disparos (enviado/falhou/pulado).

## Escopo

- Criação de campanha com: nome, template, lista de phones ou "todos os contatos ativos"
- Filtros automáticos antes do disparo:
  1. Opt-out (LGPD): contatos com status opted_out nunca recebem
  2. Filtro TMS: clientes já cadastrados no HiperTMS são pulados e marcados com tag `tms_cliente`
- Envio com anti-ban: delay aleatório 30-90s entre mensagens
- Limite diário por aquecimento (warmup): começa em 10/dia, sobe gradualmente
- Horário comercial: dispara apenas entre 7h e 19h
- Follow-up automático: agenda mensagem se lead não responder em 24h/72h
- Anexos: suporte a PDF/Word via link público
- Relatório: contadores por status (queued/sending/sent/failed/skipped)

## Filtro TMS (regra de negócio)

Antes de disparar, o sistema consulta o banco do HiperTMS em lote:
- Clientes encontrados: status = `skipped`, error = `tms_cliente`, tag adicionada no Nexa
- Clientes NÃO encontrados: entram na fila de envio normalmente
- Se TMS_DB_URL não configurado: filtro desativado, todos entram na fila

## Regras anti-ban

- Delay: aleatório 30-90s (configurável via env SENDER_DELAY_MIN_MS / MAX_MS)
- Warmup stages: [10, 15, 20, 30] disparos/dia (sobe de stage com o tempo)
- Limite horário configurável por número
- Claim atômico: evita envio duplicado se dois workers rodarem ao mesmo tempo

## Referências

- Service: `apps/backend/src/application/sender/sender.service.ts`
- ADR: `docs/adr/024-campanhas-filtro-tms.md`
