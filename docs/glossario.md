# Glossário — Nexa

> Definições dos termos usados no sistema, na documentação e nas conversas da equipe.
> Atualizar sempre que um novo conceito for introduzido.

---

## A

**Action Policy**
Regra que define quais ações da IA são irreversíveis e exigem aprovação humana antes de serem executadas. Implementada em `action-policy.service.ts` (ADR 012). Exemplos de ações bloqueadas: cancelar assinatura, emitir reembolso, excluir cliente.

**ADR (Architecture Decision Record)**
Documento que registra uma decisão de arquitetura tomada pela equipe, incluindo contexto, alternativas consideradas e consequências. O Nexa tem 27 ADRs em `docs/adr/`.

**Agente**
Componente de IA especializado em uma função específica. O Nexa tem 9 agentes: Router, Conversation (SDR de vendas), Sales, Support, Diagnostic, Resolution, CaseClassifier, Escalation e Supervisor. Cada agente tem um prompt e conjunto de responsabilidades próprios.

**Ack (Acknowledgment)**
Status de entrega de uma mensagem WhatsApp. 0 = pendente, 1 = enviado (✓), 2 = entregue (✓✓), 3 = lido (✓✓ azul). Armazenado em `ai_messages.ack`.

**Autonomia**
Capacidade da Lia de responder automaticamente sem intervenção humana. Controlada pelo `AutonomySetting` (kill switch) com três níveis: master (global), whatsapp e email.

---

## B

**Botão de pânico**
Nome informal para o kill switch master da Lia. Quando desligado, a Lia para de responder em todos os canais imediatamente. Acessível na topbar do painel pelo ícone de robô.

**Break-glass**
Padrão de segurança para ações administrativas de alto impacto feitas pelo Platform Admin operando como cliente. A ação é bloqueada por padrão e exige confirmação explícita. Referência: ADR 025.

---

## C

**Campanha**
Disparo em massa de mensagens WhatsApp ou e-mail para uma lista de contatos. Inclui proteção anti-bloqueio (limites diário/horário, horário comercial, warmup). Entidade: `Campaign` + `CampaignTarget`.

**Canal**
Meio de comunicação com o contato. Canais suportados: WhatsApp, E-mail. Planejado: Telegram, Portal Web. Controlado pelo campo `source_channel` nas conversas.

**CaseClassifier**
Agente de IA que classifica o tipo e a prioridade de um ticket de suporte ao ser aberto. Categorias: fiscal, cte, mdfe, frete, financeiro, sistema, outro.

**Conector (Connector)**
Integração com um produto externo (ex: HiperTMS). Responsável por buscar dados do produto para a Lia responder perguntas. Implementado em `application/connectors/`.

**Contato**
Pessoa física que interage com a Lia (lead, cliente ou usuário TMS). Identificado pelo telefone (WhatsApp) ou e-mail. Entidade: `Contact`.

**Conversa**
Sessão de interação entre a Lia e um contato. Uma conversa pode mudar de agente (ex: vendas → suporte) mas mantém o mesmo `id`. Entidade: `AiConversation`.

**Correlation ID**
UUID gerado a cada mensagem recebida. Rastreia toda a cadeia de processamento (webhook → agente → ação → resposta) nos logs. Propagado em todos os serviços.

---

## D

**Diagnostic**
Agente de suporte especializado em investigar a causa raiz de um problema técnico reportado pelo cliente. Usa a base de conhecimento e dados do TMS para diagnosticar.

**DLQ (Dead Letter Queue)**
Fila de eventos que falharam após múltiplas tentativas de processamento. Monitorada pelo dashboard em `events.dlq`. Entidade: `EventDlq`.

**Domain Event**
Evento de domínio publicado internamente no sistema (ex: `lead.qualified`, `message.created`). Processado de forma assíncrona pelo EventEmitter do NestJS. Entidade: `DomainEvent`.

---

## E

**Embeddings**
Vetores numéricos que representam o significado semântico de um texto. Usados para busca semântica na base de conhecimento. Gerados pelo modelo `multilingual-e5-small` (local, sem API externa). Armazenados na coluna `embedding vector(384)` com pgvector.

**Escalation**
Agente que decide quando uma conversa precisa de intervenção humana. Ao escalar, o status da conversa vai para `escalated` e o vendedor/operador é notificado.

**Externalid**
ID do contato ou conversa no sistema externo (ex: TMS). Usado para correlacionar dados entre Nexa e TMS sem precisar sincronizar todas as tabelas.

---

## F

**Feature-Sliced Design (FSD)**
Arquitetura de frontend que organiza o código por fatias de funcionalidade (`entities`, `features`, `pages`, `shared`). Adotada no frontend do Nexa a partir da sprint de junho/2026.

**FollowUp**
Cadência automática de mensagens enviadas para leads que não responderam. 2 estágios: 24h e 72h após o primeiro contato. Respeita horário comercial e opt-out.

**FSD** → ver *Feature-Sliced Design*

---

## H

**Handoff**
Transferência de contexto de uma conversa para um agente humano (vendedor) ou para o WhatsApp pessoal do usuário do TMS. Dois tipos: escalonamento (conversa existente) e iniciação via token (novo contexto).

**Handoff Token**
Token de uso único (TTL 5min) gerado pelo Nexa para o TMS iniciar uma conversa com contexto já preenchido. Evita que o usuário precise digitar seu nome/problema de novo.

---

## I

**Inbox**
Tela do painel onde os operadores acompanham conversas ativas em tempo real. Separado por módulo: Inbox de Vendas (leads) e Inbox de Suporte (tickets).

**Intenção (Intent)**
Classificação do objetivo de uma mensagem. Ex: `purchase_inquiry`, `support_request`, `opt_out`, `followup_1`. Armazenada em `ai_messages.intent`.

---

## K

**Kill switch** → ver *Botão de pânico*

**Knowledge Base (KB)**
Base de conhecimento alimentada pelo operador e usada pela Lia para fundamentar respostas. Suporta versionamento, curadoria (aprovação humana) e busca semântica. Entidade: `AiKnowledgeBase`.

---

## L

**Lead**
Contato que ainda não é cliente — está no funil de vendas. Classificado por `leadStatus`: new → cold → warm → hot.

**Lia**
Nome da IA do Nexa. Multi-agente, orquestrada pelo RouterAgent. Responde leads e clientes via WhatsApp e e-mail seguindo as regras do Playbook.

---

## M

**Motor Proativo**
Componente que dispara ações baseadas em tempo/eventos sem aguardar mensagem do contato. Ex: follow-up de vendas (24h/72h), SLA de suporte. Parcialmente implementado no `FollowUpService`.

**Multi-tenant**
Arquitetura onde múltiplos clientes (tenants) compartilham a mesma instância da plataforma com dados completamente isolados por `tenantId`.

---

## O

**Opt-out**
Descadastro de um contato — solicitação para não receber mais mensagens. Implementado automaticamente quando o contato envia "SAIR" (WhatsApp) ou clica no link de descadastro (e-mail). Obrigação LGPD.

**Outcome**
Resultado final de uma conversa: `won` (vendeu), `lost` (não vendeu), `no_response` (sem resposta), `opt_out`, `resolved` (suporte resolvido).

---

## P

**Platform Admin**
Usuário com `tenantId = null` que tem acesso a todos os tenants da plataforma. Usa o padrão break-glass para operar na conta de clientes. ADR 025.

**Playbook**
Configuração de persona, tom, objeções, CTAs e URL de cadastro da Lia. Editável pelo operador sem mexer no código. Entidade: `SalesPlaybook`.

**pgvector**
Extensão do PostgreSQL para busca vetorial (similaridade semântica). Usada na busca da base de conhecimento.

---

## R

**RAG (Retrieval-Augmented Generation)**
Técnica onde a IA busca documentos relevantes na KB antes de gerar uma resposta, reduzindo alucinações. O Nexa usa RAG semântico (embeddings + pgvector) com fallback textual.

**Resolution**
Agente de suporte que monta a solução técnica para o problema diagnosticado, usando a KB e dados do TMS.

---

## S

**Seller (Vendedor)**
Membro da equipe comercial cadastrado no Nexa. Recebe notificação no WhatsApp quando um lead quente é identificado. Atribuído às conversas por round-robin.

**Supervisor**
Agente de IA que audita o rascunho dos outros agentes antes do envio — verifica alucinações, tom inadequado e promessas não autorizadas. Blocos duros (regex) + IA.

---

## T

**Tenant**
Cliente que usa a plataforma Nexa. Cada tenant tem dados completamente isolados. Entidade: `Tenant`.

**Ticket**
Conversa de suporte técnico. Tem categoria (fiscal, cte, mdfe...), prioridade (critical, high, medium, low) e ciclo de vida: open → escalated → resolved.

**TMS (HiperTMS)**
Sistema de Gestão de Transportes da Hiperviás. Primeiro produto conectado ao Nexa via conector read-only (`tms-lookup.service.ts`) e API de ações.

---

## W

**WAHA (WhatsApp HTTP API)**
Gateway self-hosted que conecta o Nexa ao WhatsApp via protocolo não-oficial. Roda em container Docker na porta 3018. Gerencia sessões (QR code), envio e recebimento de mensagens.

**Warmup**
Processo de aquecimento de um número WhatsApp novo — começa com poucos disparos por dia e aumenta gradualmente para evitar bloqueio pelo WhatsApp.
