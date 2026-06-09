# ADR 002 — Campanhas e Filtro TMS

## Status: Aceito

## Contexto

Campanhas de prospecção não devem atingir quem já é cliente do HiperTMS.

## Decisão

- Antes de cada disparo: consulta banco TMS em lote (batchLookup — 2 queries independente do volume)
- Clientes TMS: status=skipped, tag=tms_cliente no Nexa, NENHUMA mensagem enviada
- Fail-open: se TMS_DB_URL não configurado ou TMS indisponível, campanha roda normalmente
- Regra LGPD separada: opt-out filtrado ANTES do filtro TMS (duas camadas independentes)

## Consequências

- Zero mensagens para clientes ativos do HiperTMS
- Transparência no relatório: coluna skippedTms mostra quantos foram filtrados
- Banco TMS nunca é modificado (apenas SELECT)
