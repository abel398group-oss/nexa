# Nexa — Módulo de Vendas: relatório analítico

> Documento para revisão externa. Descreve o ciclo comercial completo do Nexa
> (plataforma multi-tenant de vendas e suporte B2B via WhatsApp e e-mail, com uma
> assistente de IA chamada **Lia**). Estado verificado no código em **20/08/2026**.
> Tudo aqui foi conferido no código-fonte, não em documentação.

---

## 1. O que é o módulo

O Nexa vende SaaS para transportadoras. O primeiro produto vendido é o **HiperTMS**,
um sistema de gestão de fretes. O módulo de vendas cobre a corrente inteira, da
definição de o que se vende até o fechamento do contrato.

Vocabulário do produto, porque os nomes não são óbvios:

| Termo | O que é de verdade |
|---|---|
| **Parceiro** | Empresa que INDICA leads. Não é cliente nem revenda. |
| **Mercado** | O produto/cliente que está sendo prospectado. No banco é a tabela `products`. |
| **Lote / Lista** | Um CSV de leads importado, com procedência e base legal LGPD declaradas. |
| **Toque** | Posição na cadência (1º contato, 2º, 3º…). |
| **Linha** | Um chip físico de WhatsApp. Cada linha tem aquecimento e teto próprios. |

---

## 2. A corrente, etapa por etapa

### Etapa 1 — Parceiro e Mercado

O mercado **nasce escolhendo um parceiro da lista**, não digitando um nome. Isso é
deliberado: o nome digitado criava mercados duplicados com grafias diferentes.

Um mercado tem identidade própria de e-mail (nome de exibição, remetente, cor,
punchline, link de cadastro) e uma **trava de liberação**: ele só passa de `draft`
para `active` quando satisfaz quatro condições — identidade preenchida, conhecimento
cadastrado, ao menos um modelo de mensagem, e ao menos um vendedor vinculado.

Enquanto está em rascunho, ele **não aparece na tela de Disparo**. Mercado que ainda
não pode vender não deve ser oferecido a quem monta campanha.

### Etapa 2 — Validação de campanha (material)

O plano de campanha nasce fora do Nexa: alguém escreve arquivos `.md` por eixo
temático (cotações, pneus/combustível, financeiro). A tela de Validação traz esses
arquivos para dentro, permite ler o texto na íntegra, corrigir na hora, e **aprovar**.

Dois tipos de material:

- **Roteiro** (`.md`, `.txt`) — texto, guardado no banco. Teto de 512 KB.
- **Portfólio** (PDF, JPG, PNG, WEBP) — binário em disco. Teto de 16 MB.

Regra central: **material sobe como `pending` e não vale nada até alguém aprovar**.
Editar ou reenviar **derruba a aprovação** — aprovar um conteúdo e deixar outro entrar
por baixo daria a garantia sem cumpri-la.

O material aprovado alimenta três consumidores:

1. **A Lia** — o roteiro aprovado é publicado na base de conhecimento e passa a ser
   recuperado quando ela responde um lead daquele mercado.
2. **O SDR** — vê o roteiro e os anexos na mesa de trabalho.
3. **O Closer** — vê o mesmo material no botão "Contexto" de cada negócio.

### Etapa 3 — Modelos de mensagem

A biblioteca de mensagens por mercado. Cada modelo tem nome, canal (e-mail ou
WhatsApp), assunto (só e-mail), corpo e **toque** da cadência.

Dois recursos que importam para a qualidade:

- **"Gerar do roteiro"** — a Lia lê o roteiro aprovado e propõe a cadência com as
  mensagens já escritas. Devolve **rascunho**, não grava nada: quem salva continua
  sendo a pessoa, depois de revisar.
- **"Gerar teste"** — renderiza a mensagem com o **mesmo motor do envio real**, não
  uma aproximação. Mostra que o asterisco sai literal no WhatsApp e que o assunto foi
  cortado pelo Gmail. Lista avisos (erro em vermelho, alerta em âmbar).

O modelo também nasce `draft` e precisa ser **aprovado** para aparecer no Disparo.
Escrever e aprovar são permissões diferentes: quem escreve (`campaigns`) não carimba
o próprio texto (`settings`).

### Etapa 4 — Listas de leads (importação)

Upload de CSV com peneira em duas camadas.

**Camada de arquivo** (sem banco): detecta separador automaticamente, normaliza
cabeçalhos com acento/BOM, e rejeita por dois motivos — `duplicado` (dentro do próprio
arquivo, por telefone e, na falta, e-mail) e `inválido` (nenhum canal utilizável).
Basta um canal válido para o lead passar.

**Camada de banco**, em ordem estrita de precedência:

1. `cliente` — já é cliente (data de contrato no Nexa **ou** encontrado no TMS)
2. `opt_out` — pediu para não ser contatado
3. `email_invalido` — só quando o e-mail era o único canal
4. `ja_na_base` — já existe como contato

Só `ja_na_base` é forçável. A consulta ao TMS é **fail-closed**: se ela falhar, a
importação inteira aborta — importar sem conseguir checar quem já é cliente
significaria mandar campanha fria para a base de clientes.

Depois da importação, os leads são **distribuídos por rodízio** entre os vendedores
vinculados àquele mercado, respeitando ausência. Contato que já tem dono mantém o
dono; o contador do rodízio só avança quando de fato atribui, então as cotas ficam
parelhas.

### Etapa 5 — Disparo

Um worker roda a cada 15 segundos e dispara **um alvo por vez**, sob uma sequência de
travas anti-bloqueio:

| Trava | Regra |
|---|---|
| Janela comercial | Só dentro do horário configurado (padrão 07h–19h, fuso de Brasília) |
| Aquecimento | Teto diário por degrau: **10 → 15 → 20 → 30** mensagens/dia |
| Teto horário | Padrão 8/hora |
| Espaçamento | 30 a 90 segundos entre envios, compartilhado via Redis entre réplicas |
| Orçamento por linha | Teto cruzado entre canais, por chip |
| **Freio de engajamento** | Desativa o número se a resposta cair ou a falha subir |

O freio de engajamento merece destaque porque é o mais incomum: ele mede o que
**volta**, não só o que sai. Janela de 24h, amostra mínima de 30 envios, piso de 3% de
resposta e teto de 30% de falha. Abaixo do piso ou acima do teto, o número é desativado
e o time é avisado. A justificativa: quem decide banir um chip é o WhatsApp, e o sinal
que ele mais usa é gente que recebe e não responde.

O público da campanha pode ser: todos os contatos ativos, **uma lista importada**, uma
tag, ou seleção manual.

A conversa criada pelo disparo herda o **dono do contato** (vindo da distribuição do
lote) e, na falta, o dono da campanha. Herda também o mercado e a linha de WhatsApp —
e toda resposta, inclusive follow-up, sai pela mesma linha para sempre.

Ao enviar, agenda-se automaticamente uma cadência de follow-up: **24h e 72h**, com
texto variado por *spintax* (81 e 243 variantes) para não repetir caractere por
caractere. A cadência para quando o lead responde ou pede opt-out.

### Etapa 6 — Lia (o filtro automático)

Toda mensagem recebida passa por um **Router**, que classifica intenção, atribui um
score de 0 a 100 e decide o agente. Antes de qualquer chamada de IA, dois gates
determinísticos por expressão regular: risco jurídico (advogado, Procon, processo →
direto para humano) e opt-out.

Toda resposta que a Lia escreve passa por um **Supervisor** antes de sair. Ele
sanitiza tentativas de injeção de prompt, bloqueia linguagem absolutista por regra
fixa, e — importante — **falha fechado**: se a IA de auditoria não responder, a
mensagem não sai.

O que a Lia faz com o resultado:

- **Lead quente** (score ≥ 70 ou pediu reunião) → rodízio escolhe um vendedor,
  notifica, e cria a oportunidade já com dono.
- **Lead morno** (resposta comercial abaixo do corte) → cria a oportunidade no funil,
  sem rodízio e sem notificação, herdando o dono do contato.
- **Fora de perfil** (`wrong_person`) → registra e não aciona ninguém.

Existe um **kill switch** de autonomia, com chave global e por canal, persistido em
banco.

### Etapa 7 — SDR

A fila do SDR são as oportunidades em estágio `new`, escopadas por **dono** e por
**mercado**. Vem numa chamada só: oportunidade, ficha do contato, lote de origem e
histórico recente.

Ordem de prioridade: prometido para hoje → nunca contatado → em andamento. Oportunidades
do mesmo contato são agrupadas numa linha só.

Uma decisão de produto que merece atenção do revisor: **lead sem dono não aparece para
nenhum SDR**. O raciocínio registrado no código é que dois SDRs ligando para o mesmo
lead é briga de comissão e o lead achando que é telemarketing. Lead órfão fica visível
apenas para admin/gestor, que distribui.

Na mesa o SDR tem: roteiro do mercado com placeholders já preenchidos, material
aprovado, base de conhecimento pesquisável, e ações de registrar contato, agendar
retorno, descartar (com motivo obrigatório) ou passar para o closer.

Toda ação carimba a **versão do roteiro** que estava na tela.

### Etapa 8 — Closer

Painel organizado por **dia**, não por kanban: três blocos — "Agora" (reunião hoje),
"Precisa de você" (parou e depende dele), "Esperando" (proposta no prazo, reunião
futura, pausa vigente). O raciocínio: o closer com quinze negócios acorda com "o que
eu faço hoje?", e um quadro obriga a varrer quatro colunas para descobrir que tem
reunião às 15h.

Desfechos: proposta (com valor), ganhou, perdeu (motivo obrigatório), adiar (com data
de volta). Todos gravam etapa, histórico e atividade na mesma transação.

"Ganhou" também estampa a data de virada de cliente no contato — é o que impede o
cliente novo de receber campanha fria do produto que acabou de comprar, antes de
aparecer no TMS.

### A passagem SDR → Closer

**Escolha explícita, não rodízio.** O SDR indica o closer. As validações: não pode
passar para si mesmo (com mensagem própria), o closer precisa trabalhar aquele
mercado, e quem está ausente não aparece na lista.

A nota que o SDR escreve na passagem, mais o histórico de tentativas, ficam visíveis
ao closer no botão "Contexto".

---

## 3. Estrutura transversal

**Multi-tenant** — todo dado carrega `tenantId`, filtrado na aplicação. O
administrador de plataforma pode operar dentro de um cliente com um cabeçalho
validado; ações irreversíveis nesse modo exigem confirmação de "quebra de vidro" e
são auditadas.

**Escopo duplo** — o vendedor é limitado por dono E por mercado. As duas dimensões se
compõem: o SDR de um mercado vê os leads daquele mercado que são dele.

**Permissões separadas por papel** — `sdr` e `closer` são permissões distintas desde
16/08/2026. Antes eram a mesma, e a separação era apenas visual.

**Automações** — cerca de quinze relógios: disparo (15s), follow-up (20s), campanha de
e-mail (15s), aquecimento (diário às 05h), janitor de conversas, monitor de saúde,
consolidação, relatório de fechamento, motor proativo. Coordenados por trava
distribuída em Redis quando há mais de uma réplica.

---

## 4. Pontos em aberto

Listados com honestidade para o revisor avaliar prioridade. Todos verificados no
código.

### Corretude

| # | Problema | Efeito |
|---|---|---|
| 1 | A data de virada de cliente é sobrescrita a cada venda — o comentário diz "só estampa se ainda não é cliente", o código estampa sempre | Segundo contrato apaga a data do primeiro, e a peneira de importação depende dela |
| 2 | O rodízio da Lia filtra apenas vendedor ativo — ignora ausência e vínculo de mercado | Lead quente pode cair em quem está de férias ou não vende aquele produto. As duas regras são respeitadas na passagem SDR→Closer, mas não aqui |
| 3 | Transferência de lead sem mercado definido pula toda a validação de closer | Aceita qualquer id, inclusive inativo ou de outro mercado |
| 4 | A transferência leva só a oportunidade representante do grupo | As irmãs continuam na fila do SDR como "nunca contatado", enquanto o contato já pertence ao closer |

### Medição e rastreabilidade

| # | Problema | Efeito |
|---|---|---|
| 5 | Os contadores do lote não fecham: recebidos ≠ duplicados + inválidos + válidos | Os motivos de descarte por regra de banco aparecem só na resposta da importação e não são persistidos. A pergunta "esta lista comprada valeu a pena?" não tem resposta depois |
| 6 | A oportunidade não guarda de qual campanha veio | Ganho e perda não retroalimentam a campanha nem o material. O ciclo não fecha |
| 7 | Entrega e leitura do WhatsApp não são persistidas | São recalculadas na hora de exibir, então não dá para consultar histórico nem agregar |
| 8 | O relatório "qual roteiro converte" mede taxa de atendimento, não fechamento | Nomeia uma coisa e mede outra |

### Operação

| # | Problema | Efeito |
|---|---|---|
| 9 | Lote importado e não distribuído fica invisível para todos os SDRs, sem alerta | A distribuição é uma ação manual separada; esquecer dela some com o lote |
| 10 | Follow-up existe apenas para leads de campanha | Lead trabalhado pelo SDR e lead que chegou sozinho não têm cadência nenhuma |
| 11 | O disparo para em silêncio fora da janela, sobre orçamento ou com engajamento ruim | Campanha fica "rodando" com fila cheia e nada explica na tela |
| 12 | O vínculo vendedor↔mercado não distingue SDR de closer | Um SDR pode transferir para outro SDR |

---

## 5. Perguntas para o revisor

1. A regra de **esconder lead sem dono do SDR** protege contra briga de comissão, mas
   cria um ponto onde lead pago pode ficar parado. Existe desenho melhor que preserve
   a proteção sem o risco?

2. A passagem SDR→Closer é **escolha manual**, decidida depois de um incidente com
   rodízio. O SDR escolhe sem ver carga de trabalho de ninguém. Vale mostrar a carga,
   ou isso reintroduz o problema que a escolha manual resolveu?

3. A cadência é de **dois toques** (24h e 72h) e só para campanha. Para prospecção
   fria B2B em transporte, isso é pouco? Qual seria a cadência adequada?

4. O **aquecimento** vai de 10 a 30 mensagens/dia por chip, subindo a cada 3 dias com
   engajamento saudável. Com uma base de ~30 mil leads frios, o teto é a restrição
   central da operação. A escada está calibrada?

5. O **freio de engajamento** desativa o número abaixo de 3% de resposta em 24h, com
   amostra mínima de 30. Esses limiares fazem sentido para prospecção fria?

6. A IA **rascunha** mensagem e **responde** lead, mas nunca executa ação irreversível
   e tem toda saída auditada por um segundo modelo que falha fechado. Essa divisão de
   responsabilidade está no lugar certo?

---

## 6. Resumo

A corrente está **completa de ponta a ponta** — do cadastro do parceiro ao fechamento —
e cada elo tem trava de aprovação onde o texto chega ao lead. As proteções anti-bloqueio
do WhatsApp são incomumente cuidadosas para um sistema desse porte, com destaque para o
freio que mede resposta em vez de só volume.

As fragilidades restantes concentram-se em **medição**, não em fluxo: o funil funciona,
mas responde mal a "de onde veio o que fechou". Quatro dos doze pontos abertos são
sobre rastreabilidade que não existe, e dois são retroalimentação que nunca acontece —
resultado que não volta para informar campanha, material ou score.

O risco operacional maior não é técnico: é o lote importado que ninguém distribuiu,
sem nada na tela avisando.
