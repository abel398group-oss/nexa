# PRD — Regras de Negócio

> Regras de negócio consolidadas do sistema de automação de leads.
> Fonte de verdade para qualquer feature que toque essas regras.

**Última atualização:** 2026-06

---

## 1. Qualificação de leads (score)

A IA atribui um `interest_score` (0-100) a cada interação.

| Faixa | Classificação | Ação |
|---|---|---|
| score >= 70 | **Hot lead** | Cria oportunidade + notifica vendedor |
| score >= 40 | **Warm lead** | Acompanha, sem notificação |
| score > 0 | **Cold lead** | Mantém no funil |
| score = 0 | **Sem interesse / opt-out** | — |

### Score mínimo por intenção
- `meeting_request` ou demo → mínimo **80** + needs_human
- `interested` claro → mínimo **60**
- saudação inicial → **20**

---

## 2. Intenções classificadas

`opt_out | interested | pricing_question | meeting_request | not_now | wrong_person | human_needed | unknown`

---

## 3. Telefone válido (Brasil)

- Prefixo **55**
- **12 a 13 dígitos**
- Trata sufixo de dispositivo (`:1`) e formato novo `@lid` do WhatsApp
- Seleção inteligente: testa todos os campos do payload e escolhe o primeiro telefone BR válido

---

## 4. Opt-out (descadastro)

- **Palavras-gatilho:** SAIR, PARAR, STOP, DESCADASTRAR, CANCELAR, REMOVER, NÃO QUERO, PARE, UNSUBSCRIBE
- **Efeito:** zera score, status `opted_out`, registra em `opt_outs`
- **Bloqueio:** nunca mais recebe campanha nem follow-up
- **Compliance:** toda mensagem de campanha traz "_responda SAIR_" no rodapé
- `created_at` do opt_out NÃO deve ser sobrescrito em conflito

---

## 5. Rate limiting (anti-spam inbound)

- Ignora nova mensagem se houve **classificação nos últimos 12 segundos**
- Evita resposta dupla quando o lead manda várias mensagens seguidas
- Baseado na tabela `ai_classifications`

---

## 6. Distribuição de leads (round robin)

- Vendedores ativos na tabela `sellers`
- Round robin via `round_robin_state` (alterna entre vendedores)
- Atual: Mateus e Uelder, ambos DDD São Paulo
- Notificação deduplicada via `seller_notifications` (não notifica 2x o mesmo lead)
- Regra futura: distribuição por DDD/região quando houver mais vendedores

---

## 7. Follow-up automático

- **Nível 1:** 24h sem resposta
- **Nível 2:** 72h sem resposta
- Máximo **2 follow-ups** por contato
- Exclui quem respondeu ou fez opt-out

---

## 8. Campanha (outbound)

- **Horário comercial:** 7h-19h (fora disso não dispara)
- **Limite diário:** definido no `number_pool` (atual 30/dia)
- **Delay entre envios:** 30-90s em produção (anti-ban)
- **Deduplicação:** não reenvia para sent/pending/opted_out
- **Personalização:** saudação por horário + primeiro nome

---

## 9. Saúde dos números (number_pool)

- Cada número tem limite **diário** e **por hora**
- Contador `sent_today` zera à meia-noite (Reset Daily Counter)
- Fases de aquecimento (`warmup_stage`): número novo começa baixo e cresce
- Status: `aquecendo` / `ativo` / `bloqueado`
- Sender só usa números ativos e respeita a cota restante

---

## 10. Comportamento da IA (atendimento)

### Tom e formato
- Máximo 3-4 linhas, objetivo, sem redundância
- Tom humano e direto (como vendedor no WhatsApp)
- Sem frases de preenchimento ("Ótimo!", "Que bom!")
- Máximo 1 emoji

### Saudação por horário (Brasília)
- 5h-12h → Bom dia
- 12h-18h → Boa tarde
- 18h-5h → Boa noite

### Entender a dor antes de vender
- Quando o lead fala de problema, faz 1 pergunta diagnóstica antes de apresentar solução
- Apresenta a parte da HiperTMS que resolve AQUELA dor

### Captura de contato
- Lead interessado → pede email/WhatsApp para o time comercial
- Na despedida → tenta capturar antes de encerrar

### Ofensas
- Nunca revida
- Ofensa leve → segue normal
- Agressivo repetido → needs_human (passa pro vendedor)

### Mídia
- Áudio/foto/figurinha → responde pedindo texto (não processa IA)

---

## 11. Monitoramento interno de reclamações

- **Interno** — o cliente não sabe; só registro
- IA marca `is_complaint` + `complaint_topic` (lentidao/bug/preco/atendimento/fiscal/outro)
- Não altera a resposta ao cliente
- Permite medir e agir (relatório de reclamações)

---

## 12. Observabilidade de qualidade

- IA Supervisora audita conversas: nota 0-100, repetição, confusão, sugestões
- Não altera nada — só gera feedback para ajuste manual do prompt
- Ciclo: IA atende → Supervisora analisa → humano valida → ajusta prompt

---

## Contatos de referência

| Item | Valor |
|---|---|
| Vendedor Mateus | 5511994327713 |
| Vendedor Uelder | 5511974869142 |
| Modelo Claude | claude-haiku-4-5-20251001 |
| Número de envio atual | 5512997880659 |
| Limite diário atual | 30 |
