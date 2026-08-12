# Teste da esteira comercial — rodada de 12/08/2026

**Como usar:** troque `[ ]` por `[x]` no que funcionou. No que falhar, escreva do lado do
`→` o que aconteceu. Quando terminar (ou desistir no meio), salve e me avise — eu leio
daqui.

Arquivo descartável: some quando a rodada acabar.

---

## 0. Antes de começar

- [x] Backend local reiniciado
- [x] Menu **Vendas** mostra: Listas de lead · Roteiro do SDR · Mesa do SDR · Hoje (closer)

→

---

## 1. Mercados — `/markets`

- [x] Existe mercado com status **ativo**
- [x] Setinha do mercado abre **"Quem trabalha este mercado"**
- [x] Select lista os vendedores disponíveis
- [x] Vincular → aparece na lista **sem recarregar a página**
- ~~Ausente aparecendo aqui~~ → **pula, isso é a seção 7** (ninguém está ausente ainda)

→

---

## 2. Roteiro — `/roteiro`

- [x] Select de mercado vem preenchido
- [x] Avisa em vermelho que o mercado **não tem roteiro** ainda
- [x] **Duplo clique** em "Abertura da ligação" abre o popup
- [x] Salvei este texto: `{{saudacao}}, {{nome}}! Aqui é o {{remetente}}, da Hipervias.`
- [x] Toast disse **"Versão 1 publicada"**
- [x] A **setinha** (não o duplo clique) abre um resumo curto
- [x] Acrescentei uma resposta por situação: *"já tenho sistema"* + resposta
- [x] Agora diz **Versão 2**
- [x] Botão de publicar fica **travado** se a situação ficar sem resposta
- [x] **"Versões anteriores"** no fim da página mostra a versão 1
- [x] `Esc` fecha o popup

→

---

## 3. Listas de lead — `/lead-batches`

CSV de teste (cola num arquivo `teste.csv`):

```
nome;empresa;telefone;email
Carlos;Transportes Silva;(11) 99988-7766;carlos@silva.com
Ana;Log Minas;12 98807-3788;ana@log.com.br
;Sem Nome Ltda;11977665544;
Marcos;Repetido;11999887766;outro@x.com
Ruim;Ruim SA;abc;nao-tem-arroba
```

- [x] Escolhi mercado e nome da lista
- [x] **Arrastar** o arquivo funcionou (nome do arquivo apareceu)
- [x] "Ver o que entra" → **3 entram, 2 ficam de fora**
- [x] Mostra **1 sem nome**
- [x] Motivos aparecem: **repetido na própria lista** e **telefone inválido**
- [x] Cada motivo travado mostra **o porquê** do lado
- [x] "Acrescentar um lead na mão" → preencher → diz **"4 lead(s) digitado(s)"**
- [x] Trocar arquivo/mercado **apaga o relatório** da tela
- [x] Importar → toast + tela limpa
- [x] A lista aparece no **histórico** embaixo
- [x] Setinha do histórico mostra os contadores
- [x] **Distribuir** → marca vendedor → Dividir → toast com o número
- ~~Vendedor ausente desabilitado~~ → **pula, é a seção 7**

→

---

## 4. Mesa do SDR — `/sdr`

- [x] A fila da esquerda mostra os leads distribuídos
- [x] Badge de prioridade diz **"Nunca contatado"**
- [x] **O roteiro aparece na coluna da esquerda, maior que a ficha**
- [x] A saudação vem com o **nome do lead** e o **meu nome** preenchidos
- [x] "Respostas por situação" abre a objeção que escrevi
- [x] "Material de consulta" abre e tem campo de busca
- [x] A ficha mostra empresa, telefone, e-mail, frota e **nome da lista**
- [x] **Ligar / WhatsApp / E-mail** → conferi que os endereços estão certos
      (`tel:5511999887766`, `wa.me/...`, `mailto:...`). **Abrir o app de verdade só você
      consegue testar** — o navegador daqui não tem discador nem cliente de e-mail
- [x] Rodapé fixo — a página NÃO rola: fila e roteiro têm rolagem própria (roteiro:
      374px de conteúdo em 273px visíveis), então o rodapé não tem como sair de vista
- [x] **Não atendeu** → toast, e a tela **NÃO troca de lead**
- [x] O histórico do lead passou a mostrar essa tentativa
- [x] **Registrar contato** → canal + resultado + anotação → salvou
- [x] **Ligar depois** → data → sai da fila e **avança pro próximo**
- [x] **Descartar** → botão travado até escolher motivo
- [x] **Passar pro closer** → select mostra o vendedor vinculado
- [x] O select **não me mostra a mim mesmo** — provado criando um vendedor descartável,
      vinculando à conta admin e ao mercado: mesmo vinculado, ele NÃO apareceu no select.
      E mandando o id dele na mão pela API, o backend recusou com 403
- [x] Passei um lead com reunião marcada para **hoje**

→

---

## 5. Painel do closer — `/closer`

- [x] O lead que passei apareceu
- [x] Caiu em **"Agora"** (reunião hoje) ou **"Precisa de você"**
- [x] Bloco vazio **não aparece** na tela
- [x] **Proposta** → 1200 → aparece **R$ 1.200,00** na linha
- [x] **Remarcar** → mudou a data
- [x] **Perdeu** → o texto sugere usar **Adiar** quando é questão de momento
- [x] **Adiar** → data futura + motivo → sai do painel
- [x] **Ganhou** → confirmei → saiu do painel

→

---

## 6. Fechando o ciclo — `/lead-batches`

- [x] Subi **o mesmo CSV** de novo
- [x] O lead que fechei aparece como **"Já é cliente"**
- [x] E **não** tem opção de forçar a entrada dele

→

---

## 7. Ausente — deixa pro fim, porque tira o vendedor de circulação

**7a. Marcar — em `/sellers`**

Na tabela de vendedores, a coluna **Ausente** é a **última antes do botão Desativar** —
depois da coluna "Estou fora".

- [x] A coluna **Ausente** existe
- [x] Na linha do vendedor que você vinculou, aparece a palavra **"marcar"**
- [x] Clicar em "marcar" troca o texto por um **campo de data**
- [x] Escolher uma data de semana que vem → **salva sozinho**, sem botão de confirmar
- [x] Toast diz "não recebe lead até <data>"
- [x] No lugar do "marcar" agora tem um **badge amarelo com a data** e um link **"voltou"**

**7b. Onde a ausência aparece** (é o que você não achou antes)

- [x] `/markets` → setinha do mercado → na linha dele, ao lado do nome, aparece
      **"ausente até <data>"** em amarelo
- [x] `/lead-batches` → setinha de um lote → **Distribuir** → o nome dele aparece
      **apagado, com "(ausente)"**, e a caixinha **não deixa marcar**
- [x] `/sdr` → escolhe um lead → **Passar pro closer** → ele **não está** no select

**7c. Desmarcar**

- [x] Volta em `/sellers` → clica **"voltou"** → o badge vira "marcar" de novo
- [x] `/markets` → o "ausente até" desapareceu
- [x] `/sdr` → transferir → ele voltou a aparecer no select

→

---

## Sobrou alguma coisa estranha?

Rodada feita pelo Claude no navegador em 12/08, `localhost:5174`, logado como
`admin@nexa.local`.

**Achados e corrigidos durante o teste:**

1. **`e48daec`** — menu de Vendas cortava os últimos 8 itens (`maxHeight: 20rem` fixo com
   `overflow: hidden`). Era o motivo de "as telas novas não aparecem".
2. **`763f34b`** — o switch "Importar também quem já está na base" se apagava depois de
   ligado: ele só existia enquanto houvesse alguém em "já na base", e forçar removia o
   próprio gatilho. Sem como desligar.
3. **`849b552`** — botão "Ligar" montava `tel:email:abel.ramos@hipertms.com.br` numa
   oportunidade cujo campo telefone guardava um e-mail. O `wa.me` tinha o mesmo problema,
   e esse era pior: podia cair na conversa de outra pessoa.

**Observado, não é bug:**

- A fila do SDR leva **~3 segundos** para atualizar o número depois de uma ação. É a
  consulta agregada indo ao banco da DigitalOcean. Cheguei a achar que não atualizava
  porque medi em 2,5s.
- Desvincular vendedor em `/markets` pede confirmação ("Ação irreversível em modo
  cliente"). É a trava de break-glass do admin de plataforma, não é desta feature.
- Subir o mesmo CSV três vezes com "forçar" cria **3 oportunidades por pessoa**. É o
  comportamento correto (o lote pertence ao trabalho, não à pessoa), mas rende nomes
  repetidos na fila.

**Dois enganos meus durante a rodada, registrados para não se repetirem:**

- Investiguei permissão, deploy, cache e container por causa do menu, antes de ler as
  vinte linhas do meu próprio código que desenham o menu. Abrir a rota direto
  (`/lead-batches`) teria mostrado em um clique que o app estava atualizado.
- Afirmei que a reunião gravava com 6 horas de diferença. Era o meu script de conferência:
  a coluna é `timestamp` sem fuso, e a biblioteca `pg` lê valor naive como hora local. O
  Prisma lê certo, o banco tem 18:00 UTC = 15:00 BRT, como marcado.

→
