# Manual do Operador — Operação Diária

> Para: operadores e gestores que usam o Nexa no dia a dia.
> Versão: 1.0 | Junho 2026

---

## 1. Rotina Matinal (checklist)

Todo dia ao começar o expediente:

- [ ] Abrir o painel e conferir o **Painel** (dashboard) — KPIs do dia anterior
- [ ] Verificar o **Inbox de Vendas** — conversas abertas ou aguardando resposta
- [ ] Verificar o **Inbox de Suporte** — tickets novos ou escalados
- [ ] Checar o sino de **Notificações** — leads quentes, opt-outs, reclamações
- [ ] Confirmar que a **IA está ON** — botão "IA" na topbar deve estar azul (ligado)
- [ ] Verificar status do WhatsApp — ícone de conexão na barra superior

---

## 2. Inbox de Vendas — Atendendo Leads

### Abrindo uma conversa
1. Clique em **Inbox de Vendas** no menu lateral
2. A lista mostra conversas ordenadas por atividade mais recente
3. Clique em qualquer conversa para ver o histórico completo

### Respondendo manualmente
- A Lia responde automaticamente na maioria dos casos
- Para intervir: clique no campo de mensagem na parte inferior e escreva
- Clique em **Enviar** ou pressione Enter
- A resposta é enviada via WhatsApp e registrada no histórico

### Encaminhando para um vendedor
1. Abra a conversa
2. Clique em **Atribuir** (ícone de pessoa)
3. Selecione o vendedor — o contato recebe uma mensagem e o vendedor é notificado no WhatsApp dele

### Encerrando uma conversa
1. Clique em **Encerrar** na conversa
2. Selecione o outcome: Ganhou / Perdeu / Sem resposta
3. A conversa vai para o histórico

---

## 3. Inbox de Suporte — Gerenciando Tickets

### Diferença de Vendas vs Suporte
- **Vendas**: leads que ainda não são clientes, no funil de conversão
- **Suporte**: clientes existentes com dúvidas ou problemas técnicos (CT-e, MDF-e, frete, financeiro)

### Fluxo normal de um ticket
```
Cliente envia mensagem
  → CaseClassifier categoriza e define prioridade
  → Diagnostic investiga a causa
  → Resolution monta a solução (usando KB + dados TMS)
  → Supervisor revisa a resposta
  → Lia envia resposta ao cliente
```

### Quando um ticket é escalado
Se a Lia não consegue resolver (problema complexo, sem informação suficiente na KB), o ticket é escalado:
- Status muda para **Escalado** (ícone vermelho)
- O operador recebe notificação no sino
- O ticket aparece destacado no Inbox de Suporte
- **O operador deve entrar na conversa e resolver manualmente**

### Marcar como resolvido
Após resolver manualmente: clique em **Marcar como Resolvido** na conversa.

---

## 4. Base de Conhecimento — Mantendo a Lia Atualizada

A KB é o que a Lia usa para responder perguntas técnicas. Mantê-la atualizada é fundamental para a qualidade das respostas.

### Quando atualizar a KB
- Quando a Lia der uma resposta errada (criar ou corrigir artigo)
- Quando houver mudança de produto/preço/funcionalidade no TMS
- Quando surgir uma dúvida nova que se repete com frequência

### Criando um artigo
1. Vá em **Base de Conhecimento** → **Novo artigo**
2. Preencha: Título, Categoria, Tópico, Conteúdo
3. **Tags**: palavras-chave que ajudam a Lia a encontrar o artigo (ex: "CT-e", "rejeição", "SEFAZ")
4. Clique em **Salvar**
5. O artigo criado fica como **rascunho** (não aprovado)
6. Um gestor deve **Aprovar** o artigo para que a Lia passe a usá-lo

### Aprovando artigos
Somente admins e gestores podem aprovar:
1. Abra o artigo
2. Clique em **Aprovar versão**
3. A Lia começa a usar o conteúdo aprovado imediatamente

### Importar conhecimento do TMS
1. Base de Conhecimento → **Importar do TMS**
2. O sistema busca automaticamente os manuais do HiperTMS
3. Artigos novos ficam aguardando aprovação

---

## 5. Controle da IA (Kill Switch)

O botão **"IA"** na topbar controla a autonomia da Lia.

| Estado | O que acontece |
|--------|---------------|
| **IA ON** (azul) | Lia responde automaticamente em todos os canais |
| **IA OFF** (cinza) | Mensagens chegam mas ficam no inbox sem resposta automática |
| **WhatsApp OFF** | Lia para só no WhatsApp; continua respondendo e-mails |
| **E-mail OFF** | Lia para só no e-mail; continua respondendo WhatsApp |

### Quando desligar a IA
- Campanha de marketing em andamento (para não misturar com atendimento)
- Problema técnico grave no sistema (usar como precaução)
- Treinamento da equipe (modo manual para praticar)
- **Emergência**: desligar o **Master** desliga tudo instantaneamente

---

## 6. Notificações

O sino (🔔) na topbar mostra alertas importantes:

| Tipo | O que significa | Ação recomendada |
|------|----------------|-----------------|
| 🔥 Lead quente | Contato com score ≥ 70 — provável compra | Abrir conversa e ligar/mensagem pessoal |
| ⚠️ Reclamação | Lia detectou insatisfação ou reclamação | Revisar conversa, intervir se necessário |
| 🚫 Opt-out | Contato pediu para sair | Nenhuma ação necessária (automático) |
| ℹ️ Info | Avisos gerais do sistema | Verificar conforme necessidade |

---

## 7. Usando a Busca Rápida (Ctrl+K)

Pressione **Ctrl+K** (ou Cmd+K no Mac) em qualquer tela para abrir a busca rápida.

Você pode digitar o nome de qualquer tela para navegar diretamente. Exemplos:
- "inbox" → vai para Inbox de Vendas
- "campanhas" → vai para Disparo de Leads
- "escuro" → alterna para tema escuro

---

## 8. Relatório Semanal Sugerido

Toda sexta-feira, revisar no Dashboard:

1. **Conversas da semana**: total, abertas, ganhas, perdidas
2. **Taxa de resposta da IA** (`messages.aiSharePct`): quanto a Lia respondeu sem intervenção
3. **Taxa de entrega de campanhas**: delivered%, read%, replied%
4. **Tickets de suporte**: resolvidos sem escalonamento vs. escalados
5. **Leads quentes**: oportunidades abertas para acompanhar na semana seguinte
