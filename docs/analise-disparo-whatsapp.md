# Nexa — Disparo por WhatsApp: estado técnico

> Documento para revisão externa. Pergunta que motivou: **"o e-mail está disparando;
> o WhatsApp está funcionando do mesmo jeito?"**
> Estado verificado no código e no banco de produção em **21/08/2026**.

---

## Resposta curta

**O caminho existe inteiro e é o mesmo do e-mail até a última etapa.** As quatro
primeiras — roteiro aprovado, modelo de mensagem, lista de leads, criação de campanha —
são literalmente o mesmo código, com o canal como parâmetro. A quinta (entrega) é
código diferente, com regras muito mais duras.

**Nunca foi exercido em produção.** O banco tem hoje:

```
campanhas:  email running 1   ·  whatsapp: nenhuma
modelos:    email approved 4  ·  whatsapp: nenhum
números:    1 (linha "principal", degrau 3, 14 envios hoje)
```

O número dispara — 14 mensagens hoje — mas por outros caminhos (alertas, cotação,
respostas). **Campanha de prospecção por WhatsApp nunca rodou.**

Há **dois bloqueios concretos** para o primeiro disparo, descritos na seção 4.

---

## 1. O que é idêntico ao e-mail

| Etapa | Como o canal entra |
|---|---|
| **Roteiro aprovado** | O parser lê `### W1 · D0 — Título` como WhatsApp e `### E1` como e-mail. Mesmo arquivo, mesma aprovação. |
| **Gerar modelos com IA** | Mesmo endpoint, parâmetro `channel`. O prompt muda as regras de formato (ver 2). |
| **Modelo de mensagem** | Mesma tabela, campo `channel`. Mesma trava: nasce `draft`, precisa aprovação para aparecer no Disparo. |
| **Seletor na tela de Disparo** | Filtra por canal — modelo de e-mail não aparece em campanha de WhatsApp. |
| **Público** | Mesmas quatro origens: todos os contatos, **lista importada**, tag, seleção manual. |
| **Peneira de elegibilidade** | Mesma: opt-out, bloqueado, já cliente no TMS, concorrente, dedup entre campanhas. |
| **Dono do lead** | Mesma regra: a conversa herda o dono do contato (distribuição do lote) e, na falta, o da campanha. |

Ou seja: **quem sabe montar uma campanha de e-mail já sabe montar uma de WhatsApp.**
A diferença está no que acontece depois de clicar em iniciar.

---

## 2. O que é diferente por natureza do canal

| | E-mail | WhatsApp |
|---|---|---|
| Assunto | Obrigatório | **Não existe** — o parser descarta se vier |
| Formatação | HTML ou texto puro | Sem markdown: `**negrito**` sai com os asteriscos literais |
| Tamanho | 6 a 12 linhas | Máximo 4 linhas curtas |
| Link no 1º toque | Aceitável | **Padrão clássico de bloqueio** — o gerador é instruído a não usar |
| Variação de texto | Não precisa | **Spintax obrigatório** (ver 3) |

---

## 3. A entrega: onde os dois caminhos divergem de verdade

O e-mail entrega por SMTP com controles de reputação. O WhatsApp entrega por **WAHA**
(WhatsApp HTTP API, não oficial) e passa por uma sequência de travas que o e-mail não
tem — porque o custo do erro é diferente: e-mail mal enviado vai para spam; WhatsApp
mal enviado **perde o chip**, e com ele o histórico de conversas daquele número.

Um worker roda a cada 15 segundos e dispara **um alvo por vez**, sob:

| Trava | Regra |
|---|---|
| Janela comercial | 07h–19h, fuso de Brasília |
| **Aquecimento** | Teto diário por degrau: 10 → 15 → 20 → 30 msg/dia. Sobe a cada 3 dias com engajamento saudável e uso efetivo do degrau |
| Teto horário | 8/hora |
| Espaçamento | 30 a 90 segundos entre envios, sorteado, compartilhado via Redis |
| Orçamento por linha | Teto cruzado entre canais, por chip |
| **Freio de engajamento** | Desativa o número se a resposta cair ou a falha subir |
| Confirmação de entrega | `requireDelivery: true` — só marca enviado com confirmação do WAHA |

**O freio de engajamento** é o controle mais incomum e merece nota: ele mede o que
**volta**, não só o que sai. Janela de 24h, amostra mínima de 30 envios, piso de 3% de
resposta, teto de 30% de falha. Fora disso, o número é desativado e o time avisado. A
razão: quem decide banir um chip é o WhatsApp, e o sinal que ele mais usa é gente que
recebe e não responde.

**Spintax** (`{Oi|Olá|Opa}`) existe porque texto idêntico repetido para números que
nunca falaram com o remetente é o sinal de spam mais direto que a plataforma lê.

Efeito prático dessas travas no volume: com um chip no degrau máximo, o teto é **30
mensagens/dia**. O e-mail não tem nada equivalente.

---

## 4. Os dois bloqueios para o primeiro disparo

### 4.1 A linha `vendas` não tem chip pareado

Campanha nova de WhatsApp nasce na linha `vendas` por padrão — foi a decisão de separar
o número de prospecção do número de atendimento. Mas o banco tem **um só número, na
linha `principal`**.

O que acontece hoje se alguém disparar:

1. O sistema cria automaticamente um registro para a linha `vendas`, perguntando ao
   WAHA qual chip está pareado nela.
2. Se o WAHA não tiver a sessão `vendas` configurada (`WAHA_VENDAS_API_URL` etc.), a
   linha **cai na principal** — por desenho, para uma linha mal configurada enviar pelo
   número certo em vez de falhar em silêncio.
3. **Consequência:** a prospecção fria sai pelo mesmo chip que atende cliente e manda
   alerta. Se o freio de engajamento desativar esse número por causa da campanha, o
   atendimento cai junto.

O registro novo também nasce no **degrau 0 (10 msg/dia)**, mesmo que o chip real seja
o principal, que já está no degrau 3 — dois registros, dois contadores, o mesmo
telefone.

**Decisão pendente:** parear um segundo chip em `vendas`, ou assumir conscientemente
que a prospecção sai pela principal.

### 4.2 Não existe nenhum modelo de WhatsApp

Zero modelos com `channel = whatsapp`. O seletor da tela de Disparo filtra por canal,
então hoje ele aparece **vazio** numa campanha de WhatsApp.

**Caminho:** escrever blocos `### W1 · D0 — …` num roteiro, aprovar em Validação de
Campanha, e usar "Gerar do roteiro" com o canal WhatsApp — ou escrever os modelos à
mão. Depois **aprovar** cada um, senão não aparecem no Disparo.

---

## 5. O que não dá para verificar daqui

O ambiente de desenvolvimento **não tem WAHA configurado**, deliberadamente: os
workers de disparo e follow-up batem a cada 15–20 segundos e não consultam o kill
switch da IA, então uma máquina de dev apontada para o banco de produção com WAHA
ligado viraria uma segunda esteira de envio sobre os mesmos leads.

Portanto, o teste real de ponta a ponta depende de:

- [ ] Confirmar que a sessão WAHA está pareada e respondendo (`/api/sessions`)
- [ ] Decidir a linha (`vendas` própria ou assumir a principal)
- [ ] Criar e aprovar ao menos um modelo de WhatsApp
- [ ] Disparar para uma lista de **teste** com número próprio, não para a base fria

---

## 6. Perguntas para o revisor

1. Vale mesmo separar o chip de prospecção do chip de atendimento, dado que o freio de
   engajamento pode desativar o número que também atende cliente? Ou o risco de ter
   dois chips (dois aquecimentos, dois históricos) é pior?

2. O teto de **30 mensagens/dia** por chip no degrau máximo é o gargalo central da
   operação — com ~30 mil leads frios, um chip levaria anos. A saída é mais chips, ou
   é aceitar que o WhatsApp seja canal de **retomada** (para quem abriu e-mail e não
   respondeu) em vez de canal de **entrada**?

3. Os limiares do freio — 3% de resposta mínima em 24h, amostra de 30 — são razoáveis
   para prospecção fria B2B, ou vão desativar o chip cedo demais?

4. A cadência de follow-up automático (24h e 72h) **não consulta** o kill switch da IA
   e só para quando o lead responde — não quando o vendedor humano trabalha o lead.
   Já existe correção para o caso do SDR; vale estender para qualquer atividade humana?

---

## 7. Resumo para decisão

**O que está pronto:** todo o caminho até a campanha criada, idêntico ao e-mail, com
travas anti-bloqueio bem construídas e mais cuidadosas que o comum.

**O que falta:** um chip decidido, um modelo aprovado, e um disparo de teste. Nada
disso é desenvolvimento — é configuração e decisão operacional.

**O risco real não é técnico:** é disparar prospecção fria pelo mesmo número que
atende cliente, e perder os dois de uma vez.
