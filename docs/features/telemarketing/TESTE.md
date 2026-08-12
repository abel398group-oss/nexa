# Teste da esteira comercial — rodada de 12/08/2026

**Como usar:** troque `[ ]` por `[x]` no que funcionou. No que falhar, escreva do lado do
`→` o que aconteceu. Quando terminar (ou desistir no meio), salve e me avise — eu leio
daqui.

Arquivo descartável: some quando a rodada acabar.

---

## 0. Antes de começar

- [ x] Backend local reiniciado
- [ ] Menu **Vendas** mostra: Listas de lead · Roteiro do SDR · Mesa do SDR · Hoje (closer)

→

---

## 1. Mercados — `/markets`

- [ ] Existe mercado com status **ativo**
- [ ] Setinha do mercado abre **"Quem trabalha este mercado"**
- [ ] Select lista os vendedores disponíveis
- [ ] Vincular → aparece na lista **sem recarregar a página**
- [ ] Se algum vendedor estiver ausente, aparece **"ausente até <data>"**

→

---

## 2. Roteiro — `/roteiro`

- [ ] Select de mercado vem preenchido
- [ ] Avisa em vermelho que o mercado **não tem roteiro** ainda
- [ ] **Duplo clique** em "Abertura da ligação" abre o popup
- [ ] Salvei este texto: `{{saudacao}}, {{nome}}! Aqui é o {{remetente}}, da Hipervias.`
- [ ] Toast disse **"Versão 1 publicada"**
- [ ] A **setinha** (não o duplo clique) abre um resumo curto
- [ ] Acrescentei uma resposta por situação: *"já tenho sistema"* + resposta
- [ ] Agora diz **Versão 2**
- [ ] Botão de publicar fica **travado** se a situação ficar sem resposta
- [ ] **"Versões anteriores"** no fim da página mostra a versão 1
- [ ] `Esc` fecha o popup

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

- [ ] Escolhi mercado e nome da lista
- [ ] **Arrastar** o arquivo funcionou (nome do arquivo apareceu)
- [ ] "Ver o que entra" → **3 entram, 2 ficam de fora**
- [ ] Mostra **1 sem nome**
- [ ] Motivos aparecem: **repetido na própria lista** e **telefone inválido**
- [ ] Cada motivo travado mostra **o porquê** do lado
- [ ] "Acrescentar um lead na mão" → preencher → diz **"4 lead(s) digitado(s)"**
- [ ] Trocar o arquivo **apaga o relatório** da tela
- [ ] Importar → toast + tela limpa
- [ ] A lista aparece no **histórico** embaixo
- [ ] Setinha do histórico mostra os contadores
- [ ] **Distribuir** → marca vendedor → Dividir → toast com o número
- [ ] Vendedor ausente aparece **desabilitado com "(ausente)"**

→

---

## 4. Mesa do SDR — `/sdr`

- [ ] A fila da esquerda mostra os leads distribuídos
- [ ] Badge de prioridade diz **"Nunca contatado"**
- [ ] **O roteiro aparece na coluna da esquerda, maior que a ficha**
- [ ] A saudação vem com o **nome do lead** e o **meu nome** preenchidos
- [ ] "Respostas por situação" abre a objeção que escrevi
- [ ] "Material de consulta" abre e tem campo de busca
- [ ] A ficha mostra empresa, telefone, e-mail, frota e **nome da lista**
- [ ] **Ligar** abre o discador / **WhatsApp** abre o zap / **E-mail** abre o cliente
- [ ] Rolando a página, o **rodapé continua fixo**
- [ ] **Não atendeu** → toast, e a tela **NÃO troca de lead**
- [ ] O histórico do lead passou a mostrar essa tentativa
- [ ] **Registrar contato** → canal + resultado + anotação → salvou
- [ ] **Ligar depois** → data → sai da fila e **avança pro próximo**
- [ ] **Descartar** → botão travado até escolher motivo
- [ ] **Passar pro closer** → select mostra o vendedor vinculado
- [ ] O select **não me mostra a mim mesmo**
- [ ] Passei um lead com reunião marcada para **hoje**

→

---

## 5. Painel do closer — `/closer`

- [ ] O lead que passei apareceu
- [ ] Caiu em **"Agora"** (reunião hoje) ou **"Precisa de você"**
- [ ] Bloco vazio **não aparece** na tela
- [ ] **Proposta** → 1200 → aparece **R$ 1.200,00** na linha
- [ ] **Remarcar** → mudou a data
- [ ] **Perdeu** → o texto sugere usar **Adiar** quando é questão de momento
- [ ] **Adiar** → data futura + motivo → sai do painel
- [ ] **Ganhou** → confirmei → saiu do painel

→

---

## 6. Fechando o ciclo — `/lead-batches`

- [ ] Subi **o mesmo CSV** de novo
- [ ] O lead que fechei aparece como **"Já é cliente"**
- [ ] E **não** tem opção de forçar a entrada dele

→

---

## 7. Ausente — `/sellers`

- [ ] Tem a coluna **Ausente**
- [ ] "marcar" → escolhi uma data futura → salvou sozinho (sem botão)
- [ ] Aparece o badge com a data
- [ ] Em `/sdr`, transferir: esse vendedor **desapareceu** do select
- [ ] Em `/lead-batches`, distribuir: aparece **desabilitado**
- [ ] **"voltou"** → ele volta a aparecer nos dois lugares

→

---

## Sobrou alguma coisa estranha?

Qualquer coisa que não estava na lista — layout torto, texto errado, lentidão, botão
que não faz nada:

→
