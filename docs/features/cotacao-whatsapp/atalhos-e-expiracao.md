# Cotação por WhatsApp — atalhos de escrita, expiração falante e "digitando..."

**Data:** 2026-08-19
**Status:** Implementado

Cinco melhorias de velocidade percebida, todas **determinísticas** — nada aqui contraria
o "sem IA de propósito" do ADR 031: nenhuma adivinha cidade, converte unidade ambígua ou
interpreta texto livre. O TMS continua decidindo qual cidade é, e o eco continua
confirmando.

## 1. Par origem→destino numa resposta só

`cotar Jacareí pra Taubaté` resolve as duas cidades numa mensagem — antes, o texto após
o gatilho era **jogado fora** e a primeira pergunta pedia a origem de novo.

- Funciona no gatilho (`cotar X pra Y`) e na resposta da pergunta de origem (`X para Y`).
- Separadores: `>`, `→`, `;` (explícitos, ganham) e ` para `/` pra ` (última ocorrência,
  por causa de cidades como *Pará de Minas* — ver comentário em `separarOrigemDestino`,
  `quote-city.ts`).
- Na pergunta de **destino**, "para" é enfeite (prefixo), nunca separador.
- Se a origem cai em menu de ambiguidade, o destino escrito espera (`destinoPendente`) e
  é buscado assim que a pessoa escolhe.
- Erro no destino do par ecoa a origem já gravada ("Origem: X ✓ / Não achei a cidade de
  destino") — sem isso a pessoa reescreveria o par inteiro e a busca trataria tudo como
  um nome só.
- Se a carga útil do gatilho não resolve, cai na abertura de sempre com tentativas
  zeradas — nunca pior do que era.

## 2. Palavra do menu vale tanto quanto o número

- Modalidade: `dedicado`/`fracionado` (prefixo `dedic`/`frac`) além de `1`/`2`.
- Veículo: nome **exato** do menu (`carreta`) — apelido (`caminhão`) continua erro.

## 3. Peso aceita a unidade que a pergunta pediu

`400kg`, `400 kg`, `400 quilos` valem. Tonelada (`1t`) **não converte** — conversão de
unidade é decisão, e decisão errada vira peso errado na cotação.

## 4. Sessão expirada fala, uma vez

O TTL de 10 min (renovado a cada resposta) matava a sessão em silêncio: responder "400"
no minuto 11 caía no descarte de número interno e a pessoa achava o robô quebrado.

Agora cada `gravar` também escreve uma **lápide** (`nexa:cotacao:lapide:{phone}`, TTL
60 min) que morre junto com a sessão em todo fim explícito (cotou, cancelou, desistiu) —
só sobra quando a sessão morreu **sozinha**, por TTL. A resposta atrasada recebe
`msg.expirada()` uma única vez (a lápide é consumida no aviso); a mensagem seguinte volta
ao descarte normal. `pareceCotacao` espia a lápide sem consumir, pro gate barato rotear.

## 5. "digitando..." enquanto o TMS calcula

`waha.startTyping()` fire-and-forget em `tentarCotacao`, depois do lookup de usuário —
busca de cidade e cálculo levam segundos, e segundos de silêncio no WhatsApp parecem robô
morto. Falha do indicador não atrasa nem derruba a resposta; o envio da mensagem limpa o
estado de "digitando" sozinho.

## Onde mexe

| Arquivo | Mudança |
|---|---|
| `quote-city.ts` | `separarOrigemDestino()` |
| `quote-flow.ts` | `cargaUtilDoGatilho()`, `destinoPendente` no estado, `buscar_cidade` com `estado` opcional (busca encadeada), modalidade/veículo por texto, peso com sufixo kg |
| `quote-conversation.service.ts` | `abrir()` aproveita a carga útil do gatilho; `avancar()` vira laço limitado (teto 3) pras buscas encadeadas; aviso de expirada |
| `quote-session.service.ts` | lápide de expiração (`expirouHaPouco`/`consumirExpirada`) |
| `quote-messages.ts` | `expirada()`; erro de destino ecoa a origem gravada |
| `whatsapp.service.ts` | `startTyping` fire-and-forget no caminho da cotação |
