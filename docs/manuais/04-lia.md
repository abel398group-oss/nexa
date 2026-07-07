---
type: manual
tags: [manual, lia, ia, configuracao]
updated: 2026-07-07
summary: Manual do usuário — usando e configurando a Lia (IA de vendas e suporte).
---

# Manual 04 — Lia: Sua IA de Vendas e Suporte

A **Lia** é a inteligência artificial do Nexa. Ela atende clientes via WhatsApp,
responde perguntas, qualifica leads e faz handoff para humanos quando necessário.

---

## O que a Lia faz

- Responde automaticamente conversas no inbox WhatsApp
- Qualifica leads (pergunta necessidade, empresa, volume)
- Consulta a base de conhecimento (KB) para responder perguntas técnicas
- Detecta urgência e escala para humano quando necessário
- Envia alertas proativos do TMS (embarques, financeiro, frota)
- Realiza cotações de frete via WhatsApp (quando ativo)

---

## Ativar a Lia

1. Acesse **Configurações → Lia**
2. Ative o toggle **"Lia ativa"**
3. Escolha o modo:
   - **Vendas** — foco em qualificação e conversão de leads
   - **Suporte** — foco em resolução de tickets de clientes TMS
   - **Híbrido** — ambos (recomendado)
4. Clique em **Salvar**

> A Lia só atua em conversas abertas. Conversas em atendimento humano
> ficam pausadas até o operador devolver o controle.

---

## Configurar o comportamento

Acesse **Configurações → Lia → Comportamento**:

| Configuração | Descrição |
|---|---|
| **Tom** | Formal, Casual, Técnico |
| **Nome da IA** | Como ela se apresenta (padrão: "Lia") |
| **Horário de atendimento** | Fora do horário → mensagem de ausência |
| **Tempo máximo sem resposta** | Após X min sem reply humano, Lia retoma |
| **Mensagem de boas-vindas** | Primeira mensagem ao contato |

---

## Base de Conhecimento (KB)

A Lia usa a KB para responder perguntas específicas do produto/cliente.

**Adicionar conteúdo:**
1. Acesse **Knowledge Base → Novo documento**
2. Escreva em linguagem natural (a Lia lê português)
3. Categorize: *Produto*, *Suporte*, *Preços*, *Processos*
4. Salve — a Lia já usa o conteúdo nas próximas conversas

**Boas práticas:**
- Prefira respostas curtas e diretas (a Lia reformula para WhatsApp)
- Inclua exemplos concretos (valores, prazos, etapas)
- Revise mensalmente — conteúdo desatualizado confunde a Lia


---

## Kill Switch — Pausar a Lia

O **Kill Switch** desativa a Lia imediatamente em toda a plataforma.

**Quando usar:**
- Incidente de produto (Lia respondendo errado)
- Manutenção programada
- Teste sem interferência da IA

**Como ativar:**
1. Clique no ícone ⚡ na barra superior (sempre visível)
2. Confirme a desativação
3. A Lia para de responder — conversas ficam aguardando humano

**Como reativar:**
1. Clique novamente no ícone ⚡
2. A Lia retoma todas as conversas abertas

> O kill switch não apaga histórico. Ao reativar, a Lia lê o contexto
> das conversas pausadas antes de responder.

---

## Handoff Humano → Lia e Lia → Humano

**Lia assume automaticamente quando:**
- Nova conversa chega no inbox
- Operador encerra atendimento sem resolver
- Timeout de inatividade (configurável)

**Lia transfere para humano quando:**
- Detecta insatisfação ("quero falar com um humano", raiva, urgência alta)
- Score de confiança da resposta abaixo do threshold
- Ticket marcado como crítico

**Operador assume manualmente:**
1. Abra a conversa no Inbox
2. Clique em **"Assumir conversa"**
3. A Lia para de responder nessa conversa

**Devolver para a Lia:**
1. Na conversa, clique em **"Devolver para Lia"**
2. A Lia lê o histórico e continua o atendimento

---

## Monitorar o desempenho da Lia

Acesse **Analytics → Lia**:

| Métrica | O que significa |
|---|---|
| **Taxa de resolução automática** | % de conversas resolvidas sem humano |
| **Taxa de handoff** | % que precisou de humano |
| **Tempo médio de resposta** | Velocidade da Lia |
| **Score de confiança médio** | Qualidade das respostas |
| **Tópicos mais frequentes** | O que os clientes mais perguntam |

**Revisão recomendada:** semanal. Se taxa de handoff > 30%, a KB precisa de conteúdo novo.

---

## Troubleshooting

| Problema | Solução |
|---|---|
| Lia não responde | Verifique se kill switch está desligado e WhatsApp conectado |
| Lia responde errado | Adicione/corrija conteúdo na KB; veja os logs da conversa |
| Lia não faz handoff | Verifique triggers em Configurações → Lia → Escalonamento |
| Lia duplica mensagens | Verifique se há dois webhooks ativos no WAHA |
