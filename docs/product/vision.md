# Visão do Produto — Nexa

## O que é

Nexa é uma plataforma de automação comercial B2B com IA. O núcleo é a Lia — uma assistente de vendas e suporte que opera via WhatsApp, qualifica leads, responde dúvidas com base em conhecimento real do produto e distribui leads quentes para vendedores humanos.

## Problema que resolve

- Time de vendas sobrecarregado com leads frios e perguntas repetitivas
- Leads que chegam fora do horário comercial sem atendimento
- Falta de qualificação antes de enviar para o vendedor
- Custo alto de SDR para prospecção em lote
- Clientes TMS existentes sendo abordados como prospects (desperdício)

## Princípios do produto

- IA sempre transparente: a Lia nunca inventa — só responde com base na knowledge base
- Kill switch: autonomia pode ser desligada a qualquer momento sem parar o sistema
- Fail-open: se TMS ou IA estiver indisponível, o fluxo continua degradado (nunca quebra)
- Multi-tenant: cada empresa tem seu próprio contexto isolado
- Auditabilidade: toda mensagem gerada pela IA é registrada com tokens, custo e supervisão

## Fluxo principal

1. Lead manda mensagem no WhatsApp
2. Lia classifica a intenção (vendas ou suporte?)
3. Se vendas: RAG no knowledge do HiperTMS → responde, qualifica, pontua
4. Se suporte (cliente TMS detectado): RAG + contexto do cliente → resolve ou escala
5. Lead quente (score >= 70): notifica vendedor + abre oportunidade
6. Follow-up automático se lead não responder (24h/72h)

## Produtos conectados

- **HiperTMS** (1º conector): sistema de gestão de transporte para transportadoras
