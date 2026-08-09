# ADR 037 — Mercados: vender para mais de um cliente no mesmo Nexa

**Status:** aceito · **Data:** 2026-08-09

## Contexto

O Nexa nasceu vendendo o HiperTMS. Agora vai prospectar para **empresas parceiras** —
a primeira é uma fabricante de pneus. O modelo é o mesmo: o Nexa gera e qualifica leads,
o parceiro recebe.

Sem estrutura para isso, cada parceiro novo significaria: um prompt com o nome do
produto chumbado, uma persona compartilhada com o produto errado, e um e-mail saindo com
a marca do HiperTMS para o lead de outra empresa.

## Decisão

**Mercado é a unidade.** Uma caixa com tudo necessário para vender uma coisa, de um
cliente: a marca do e-mail, o que a Lia pode afirmar, como ela fala, as mensagens
prontas e quem atende o lead quente.

### Mercado É o produto, não uma dimensão nova

`productCode` já existe e já separa conhecimento, campanha e conector. Criar `marketId`
ao lado significaria duas chaves para o mesmo conceito, presentes em toda consulta, e
divergindo no primeiro esquecimento.

Então **a tabela `products` vira a tabela de mercados**, ganhando os campos que faltavam
(status, marca, liberação). Nada que hoje escopa por `productCode` muda. "Mercado" é o
nome na tela; `productCode` continua sendo a chave no banco.

### Um número de WhatsApp, uma conversa

O mesmo lead vai receber campanha de mais de um mercado — é o caso esperado, não a
exceção. Com um número só, o WhatsApp dá **uma thread por telefone**: o lead vê as duas
campanhas na mesma conversa e não faz ideia de que existem "mercados".

Portanto:

- **A base de contatos continua única por tenant.** Dois cadastros para a mesma pessoa
  criariam dois donos para uma thread só. Isto reverte uma decisão anterior de bases
  separadas: ela não sobrevive a um número compartilhado.
- **A conversa carrega o mercado atual.** Ele é resolvido pela ÚLTIMA campanha enviada
  àquele contato — que é exatamente o que o lead entende, já que ele responde à última
  mensagem que recebeu. Se a resposta citar uma mensagem específica, vale o mercado
  daquela mensagem.
- **O histórico fica junto.** O vendedor vê "ofereceram TMS em agosto, ignorou;
  ofereceram pneu em setembro, respondeu". Isso é contexto, não bagunça.

E-mail é diferente: lá cada mercado pode ter remetente próprio, então o canal é
naturalmente separável. A restrição é do WhatsApp.

### Trava de liberação

Mercado nasce em `draft` e o vendedor não o enxerga. Só vira `active` quando tem:
conhecimento aprovado, ao menos um modelo de mensagem e ao menos um vendedor ativo.

Não é burocracia — cada peça faltando tem consequência: sem conhecimento a Lia improvisa
(ou trava, porque é proibida de afirmar o que não está na base); sem modelo o operador
digita do zero e nasce mais um "Cópia de Cópia de teste"; sem vendedor o lead quente não
tem para quem ir. Liberar um mercado vazio é soltar a Lia falando de um produto que ela
não conhece, com um parceiro assistindo.

### Conteúdo entra com pesos diferentes

O material vem de uma IA externa (o parceiro ou o time escreve no ChatGPT/Gemini) e é
colado ou subido no Nexa. IA inventa número: o próprio material do HiperTMS afirma
"+5.500 municípios" e "mais de 30 anos", nenhum verificável.

| Tipo | Tratamento | Por quê |
|---|---|---|
| Fato (o que a Lia afirma) | entra **não aprovado** | errar aqui é mentir para o cliente do parceiro |
| Conduta (como abordar) | entra direto | errar o tom é chato, não é mentira |
| Copy (as mensagens) | passa pela pré-visualização | o olho humano vê antes de sair |

Número sem fonte ("X anos", "Y%", "mais de N") recebe `requiresSource` e não conta para
a trava de liberação enquanto não for confirmado.

### Pré-visualização usa o render real

O teste de mensagem renderiza pelo mesmo código que monta o e-mail de verdade. Prévia
que diverge do resultado é pior que prévia nenhuma: dá confiança errada. Mesma regra já
aplicada na lista de destinatários do disparo.

## Consequências

**Fica mais simples do que parecia.** Some do escopo a migração de unicidade do contato
(`tenantId_phone` é usado em 15 lugares), a tabela `MarketSellers` (com um número e um
time, o rodízio atual serve) e o `marketId` paralelo ao `productCode`.

**Riscos operacionais que o código não resolve:**

- Dois assuntos sem relação, do mesmo número, para a mesma lista, é o sinal de banimento
  mais forte do WhatsApp. Mitigações: não enviar mercado B para quem está em conversa
  aberta do mercado A; carência entre mercados (a janela de dedup do
  `campaign-dedup.ts`); a Lia se apresentar pelo parceiro, não como "a Lia" genérica.
- O limite diário anti-ban é por NÚMERO. Com um número só, os mercados dividem a mesma
  cota.
- Subdomínio de envio por mercado isola reputação de **domínio**, não de IP — o IP segue
  compartilhado. Cada subdomínio novo exige SPF/DKIM/DMARC próprios e aquecimento.

**Adiado de propósito:** cadência automática (toque 1 → 2 → 3 disparando sozinho),
magic link para o parceiro aprovar fatos, e relatório periódico ao parceiro. O primeiro
exige decidir o que fazer quando o lead responde no meio da sequência; os outros dois só
fazem sentido depois que existir um parceiro real usando.

## Alternativas descartadas

- **`marketId` como dimensão nova, ao lado de `productCode`.** Duas chaves para o mesmo
  conceito divergem.
- **Base de contatos por mercado.** Não sobrevive a um número de WhatsApp compartilhado.
- **Um número de WhatsApp por mercado.** Resolve o roteamento de vez e continua sendo o
  destino provável, mas custa um chip e um aquecimento por parceiro. Adiado, não
  descartado — a resolução por última campanha é compatível com essa evolução.
