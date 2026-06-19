# Manual do Operador — Campanhas de Disparo

> Para: operadores e gestores que gerenciam disparos de WhatsApp e e-mail.
> Versão: 1.0 | Junho 2026

---

## 1. O que é uma campanha

Uma campanha é o envio de uma mesma mensagem para uma lista de contatos. O Nexa inclui proteções automáticas contra bloqueio do WhatsApp:

- **Limite diário**: 30 mensagens por número (configurável)
- **Limite horário**: 8 mensagens por número
- **Horário comercial**: envios apenas entre 7h e 19h (hora de Brasília)
- **Warmup**: novos números começam com limite menor e aumentam gradualmente
- **Follow-up automático**: 2 mensagens de acompanhamento (24h e 72h) para quem não respondeu

---

## 2. Criando uma campanha WhatsApp

1. Vá em **Disparo de Leads** no menu lateral
2. Clique em **Nova campanha**
3. Preencha:
   - **Nome**: identificação interna (ex: "Prospecção Junho 2026")
   - **Mensagem**: use `{{nome}}` para personalizar com o primeiro nome do contato e `{{saudacao}}` para "Bom dia/tarde/noite" automático
   - **Mídia** (opcional): imagem ou PDF para anexar
   - **Link** (opcional): URL para incluir na mensagem
4. Adicione os destinatários (próxima seção)
5. Clique em **Salvar** (fica como rascunho)
6. Clique em **Iniciar** para começar o disparo

### Exemplo de mensagem
```
{{saudacao}}, {{nome}}! 👋

Sou a Lia da HiperTMS. Soube que você trabalha com transporte de cargas e quero te mostrar como nosso sistema pode ajudar a reduzir custos e burocracia no dia a dia.

Posso te explicar em 2 minutinhos? 😊
```

---

## 3. Adicionando destinatários

### Opção A — Importar da lista de contatos
1. Ao criar a campanha, clique em **Adicionar da lista de contatos**
2. Filtre por tag, status de lead ou nome
3. Selecione os contatos desejados
4. Clique em **Adicionar selecionados**

### Opção B — Importar arquivo CSV
Formato esperado:
```csv
telefone,nome
5511994327713,João Silva
5521987654321,Maria Costa
```

1. Clique em **Importar CSV**
2. Selecione o arquivo
3. Confirme o mapeamento das colunas
4. Clique em **Importar**

### Opção C — Usar contatos existentes com tag
Contatos com a tag "campanha-junho" → criar campanha filtrando por essa tag.

---

## 4. Agendamento

Para iniciar o disparo em um horário específico:
1. Ao criar a campanha, marque **Agendar para mais tarde**
2. Selecione data e hora (o sistema respeita o horário comercial automaticamente)
3. A campanha iniciará automaticamente no horário definido

---

## 5. Monitorando o andamento

Na tela de Disparo → clique na campanha para ver:

| Métrica | O que significa |
|---------|----------------|
| **Enviado** | Mensagem saiu do número WhatsApp |
| **Entregue** | WhatsApp do destinatário confirmou recebimento (✓✓) |
| **Lido** | Destinatário abriu a mensagem (✓✓ azul) |
| **Respondeu** | Destinatário mandou qualquer mensagem de volta |
| **Falhou** | Não foi possível enviar (número inválido, bloqueado) |

### Taxa de resposta saudável
- Entrega ≥ 85%: normal
- Leitura ≥ 40%: bom engajamento
- Resposta ≥ 5%: campanha funcionando
- Resposta < 2%: revisar mensagem ou lista de contatos

---

## 6. Parar / Pausar uma campanha

- **Pausar**: clique em **Pausar** — para temporariamente, pode retomar depois
- **Parar definitivamente**: clique em **Encerrar** — não pode ser retomado

---

## 7. WhatsApp Status (Stories)

Para publicar um **Status** (como um story) ao invés de mensagem direta:

1. Ao criar campanha, selecione **Tipo: Status (Story)**
2. Adicione a mídia (imagem ou vídeo) — obrigatório para status
3. Escreva o texto (aparece sobreposto na mídia)
4. Clique em **Publicar**

O status é publicado no número configurado e fica visível por 24h.

---

## 8. Campanha de E-mail

Para disparos por e-mail (requer canal de e-mail configurado):

1. Clique em **Nova campanha** → selecione **Canal: E-mail**
2. Preencha o **Assunto** do e-mail (obrigatório)
3. Escreva o corpo da mensagem (HTML ou texto)
4. Adicione destinatários com e-mail cadastrado
5. Inicie normalmente

O rodapé de opt-out é adicionado automaticamente (`_Responda SAIR para não receber mais mensagens._`).

---

## 9. Boas práticas anti-bloqueio

| ✅ Fazer | ❌ Evitar |
|---------|---------|
| Usar listas com contatos que já tiveram alguma interação | Disparar para listas compradas ou sem histórico |
| Personalizar com `{{nome}}` | Mensagens genéricas sem personalização |
| Respeitar o horário comercial (automático) | Forçar envios fora do horário |
| Começar com 20-30 contatos/dia em número novo | Disparar 500 mensagens no primeiro dia |
| Verificar taxa de resposta antes de escalar | Escalar uma campanha sem validar a mensagem |
| Ter um link ou CTA claro | Deixar a mensagem sem propósito claro |

---

## 10. Follow-up automático

Quando um contato não responde a campanha, o sistema envia automaticamente:

- **24h depois**: mensagem de acompanhamento amigável
- **72h depois**: segunda e última mensagem de acompanhamento

O follow-up para automaticamente quando o contato responde ou pede opt-out. Não é necessário configurar nada — funciona para todas as campanhas.
