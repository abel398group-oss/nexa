# Glossário — Nexa (Linguagem Ubíqua)

## Termos do Nexa

- **Tenant**: empresa cliente isolada dentro da plataforma Nexa.
- **Lead**: contato que ainda não é cliente do produto conectado (ex: HiperTMS).
- **Prospect**: sinônimo de lead — ainda não comprou.
- **Cliente TMS**: empresa ou usuário já cadastrado no HiperTMS — recebe tratamento de suporte, não vendas.
- **Lia**: nome da assistente de IA (vendas + suporte) que opera via WhatsApp.
- **Intent (intenção)**: classificação da mensagem do lead (sales, support, optout, human, etc.).
- **Lead Score**: pontuação de 0-100 indicando nível de interesse do lead.
- **Lead quente**: score >= 70 — gera oportunidade e notifica vendedor.
- **Lead morno**: score >= 40.
- **Lead frio**: score > 0.
- **Opt-out**: pedido de descadastro (SAIR, PARAR, STOP) — bloqueia envios futuros (LGPD).
- **Handoff**: transferência da conversa para um vendedor humano.
- **Knowledge Base (KB)**: base de conhecimento RAG que a Lia consulta para responder.
- **RAG**: Retrieval-Augmented Generation — a Lia busca trechos relevantes antes de gerar a resposta.
- **Supervisora**: agente IA que audita o rascunho da Lia antes do envio (gate de qualidade).
- **Kill switch**: botão que desativa o auto-envio da IA sem parar o sistema.
- **Campaign**: disparo em lote de mensagens WhatsApp para uma lista de contatos.
- **Conector**: integração com um produto externo (ex: HiperTMS).
- **TMS_DB_URL**: variável de ambiente com a string de conexão ao banco do HiperTMS (read-only).

## Termos do HiperTMS (relevantes para a Lia)

- **TMS**: Transportation Management System — sistema de gestão de transporte.
- **CT-e**: Conhecimento de Transporte eletrônico — documento fiscal obrigatório.
- **MDF-e**: Manifesto Eletrônico de Documentos Fiscais — obrigatório em viagens interestaduais.
- **Embarque (Shipment)**: operação principal do TMS — o que vai, de onde para onde.
- **Viagem (Trip)**: agrupa embarques para execução na estrada.
- **Cotação (Quote)**: proposta antes do embarque.
- **FCL**: Carga Completa (Full Container Load).
- **LCL**: Carga Fracionada (Less than Container Load).
- **Tenant (TMS)**: empresa cliente do HiperTMS — equivale ao "cliente" no contexto de suporte.
