# Monitor Proativo — Orquestra Nexa support IA

> **Para:** Agente Orquestra Nexa support IA (Lia — comportamento e intents)  
> **Repo:** `github.com/hipervias/nexa`  
> **Depende de:** Orquestra Nexa entregar os endpoints `/monitor/alerts` primeiro

---

## Contexto

Além dos avisos automáticos, o cliente pode perguntar à Lia pelo WhatsApp a qualquer momento e receber informações do TMS em tempo real. A Lia usa o conector TMS existente para buscar os dados e responde em linguagem natural.

---

## Intents a implementar

### 1. Resumo de pendências

**Frases que ativam:**
- "quais são as pendências de hoje"
- "tem alguma pendência"
- "resumo do dia"
- "o que está pendente"

**Comportamento:**
Chamar `GET /monitor/alerts?tenantId=xxx&status=open` no Nexa e formatar a resposta agrupada por categoria e severidade. Críticos primeiro.

**Resposta modelo:**
```
Olá, João! Aqui estão as pendências abertas:

🔴 Crítico
• CT-e das NFs 4.521 e 4.522 sem retorno SEFAZ (emitidos há 4h)

🟡 Urgente
• 2 embarques com entrega atrasada (EMB-0892, EMB-0901)
• CNH do motorista Carlos vence em 7 dias

📋 Financeiro
• 3 contas vencem amanhã — R$ 4.820,00

Quer detalhes de algum item?
```

---

### 2. Pendências por categoria

**Frases que ativam:**
- "tem CT-e pendente" / "CT-e sem SEFAZ"
- "quais embarques estão atrasados"
- "manutenção chegando essa semana"
- "tem CNH vencendo"
- "contas a pagar hoje" / "faturas em aberto"

**Comportamento:**
Chamar o endpoint específico da categoria no TMS via conector e responder com os itens encontrados.

**Endpoints a usar (conector TMS):**
```
fiscal     → GET /monitor/fiscal/cte-pendentes
logistica  → GET /monitor/logistic/atrasados
frota      → GET /monitor/frota/cnh-vencendo + /manutencao-proxima
financeiro → GET /monitor/finance/contas-vencendo + /contas-vencidas
```

---

### 3. Consulta de item específico

**Frases que ativam:**
- "qual o status do CT-e da NF 1234"
- "onde está o embarque EMB-0892"
- "situação do motorista Carlos"

**Comportamento:**
Usar o conector TMS existente para buscar o item específico e responder com status atual + última atualização.

---

### 4. Snooze por WhatsApp

**Contexto:** após o resumo diário automático, o cliente responde com uma opção.

**Frases/opções que ativam:**
- "2" ou "me lembra amanhã" ou "lembra depois"

**Comportamento:**
Chamar `POST /monitor/alerts/:id/snooze` no Nexa com `{ hours: 24 }` para cada alerta aberto do resumo enviado. Confirmar: "Combinado! Te aviso novamente amanhã às 7h."

---

### 5. Marcar como resolvido por WhatsApp

**Frases que ativam:**
- "1" ou "já resolvi" ou "pode fechar" ou "resolvido"

**Comportamento:**
Chamar `POST /monitor/alerts/:id/resolve` no Nexa. Confirmar: "Ótimo! Fechei essa pendência. 👍"

---

### 6. Solicitar relatório semanal on-demand

**Frases que ativam:**
- "me manda o relatório da semana"
- "resumo semanal"
- "como foi a semana"

**Comportamento:**
Consolidar AlertStates resolvidos e abertos da última semana e montar um resumo:
- Quantos alertas foram detectados
- Quantos foram resolvidos
- Quantos ainda estão abertos
- Categoria com mais ocorrências

---

## Playbook de tom para o Monitor

- Direto e objetivo — o cliente está ocupado
- Nunca repetir o mesmo alerta mais de 2x no mesmo dia
- Se não houver pendências: "Tudo em ordem hoje! Nenhuma pendência encontrada. ✅"
- Sempre oferecer a opção de ver detalhes ou agir
- Não usar jargões técnicos — "CT-e sem SEFAZ" vira "nota fiscal sem autorização da Receita"

---

## Checklist de entrega

- [ ] Intent: resumo de pendências (todas as categorias)
- [ ] Intent: pendências por categoria (4 intents específicos)
- [ ] Intent: consulta de item específico
- [ ] Handler de snooze via resposta WhatsApp (opção "2")
- [ ] Handler de resolução via resposta WhatsApp (opção "1")
- [ ] Intent: relatório semanal on-demand
- [ ] Playbook de tom cadastrado no Nexa para o contexto "monitor"
- [ ] Testar com tenant piloto antes de liberar para base
