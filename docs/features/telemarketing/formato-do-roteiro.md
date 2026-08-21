# Formato do roteiro de campanha

> Como escrever o plano para que o Nexa transforme a cadência em modelos de
> mensagem sozinho, sem ninguém redigitar. A seção 1 é para copiar e colar na IA
> que escreve o texto; o resto explica por quê.

Quando um roteiro é **aprovado** em *Validação de campanha*, o Nexa lê a cadência
que está dentro dele e cria os modelos em *Playbook & Mensagens* — como rascunho,
para alguém revisar e aprovar. Se o plano não estiver no formato abaixo, ele é
aprovado do mesmo jeito (a Lia passa a usá-lo), mas **nenhum modelo é criado** e a
transcrição volta a ser manual.

---

## 1. A mensagem para colar na IA

Copie daqui para baixo e cole junto com o pedido do texto:

```
Escreva a cadência seguindo EXATAMENTE este formato, porque ele é lido por um
sistema que transforma cada bloco numa mensagem pronta para disparo:

### E1 · D0 — Título curto da peça

**Assunto (A):** `assunto em minúsculas, até 45 caracteres`
**Assunto (B):** `variante para teste A/B`
**Pré-header:** uma linha que complementa o assunto

> Corpo da mensagem, todo dentro da citação.
>
> Cada parágrafo separado por uma linha com apenas ">".
>
> Abraço,
> [Nome]

Regras do formato:
- `E1`, `E2`, `E3`… = e-mail.  `W1`, `W2`… = WhatsApp.  O número é a posição na
  cadência (toque 1, toque 2…).
- `D0`, `D3`, `D7` = o dia do disparo. Fica no nome da peça.
- Só o **Assunto (A)** vira o assunto do modelo; o (B) fica guardado no documento.
- O corpo é TUDO que estiver na citação (`>`). O que estiver fora dela não entra.
- Pré-header não entra no corpo — é campo próprio do provedor de e-mail.

Variáveis que o disparo preenche sozinho (use exatamente assim):
- `[nome]`     → primeiro nome do lead. Sem nome na base, a frase se recompõe
                 sozinha, então NÃO escreva "Olá [nome]," de um jeito que quebre
                 sem ele.
- `[empresa]`  → nome da empresa do lead. Sem empresa, vira "sua empresa".
- `[Nome]`     → quem assina. Precisa estar SOZINHO na linha, na assinatura.

Qualquer outro colchete (`[cidade]`, `[rota exemplo]`, `[link]`) sai LITERAL para
o lead — o sistema avisa antes de salvar, mas prefira não usar.

Não use negrito para frases inteiras: em e-mail de texto puro os asteriscos
aparecem como asteriscos. Destaque no máximo duas ou três expressões curtas.
```

---

## 2. O que o sistema lê, e o que ignora

O plano inteiro pode ter tudo o que a equipe precisa — análise, métricas,
checklist, notas de produto. Nada disso atrapalha: **o extrator só olha para os
blocos de cadência**, e ignora o resto do documento.

| No documento | Vira |
|---|---|
| `### E1 · D0 — Tabela pronta` | Um modelo de e-mail, toque 1, chamado "Email 1 (D0) — Tabela pronta" |
| `**Assunto (A):** \`texto\`` | O assunto do modelo |
| Linhas em `>` | O corpo |
| `**Assunto (B):**`, `**Pré-header:**` | Nada (ficam no documento) |
| Tabelas, seções de análise, checklist | Nada |

Um bloco sem corpo é descartado: cabeçalho solto é rascunho de quem estava
escrevendo, e viraria um modelo vazio que ninguém pode enviar. E-mail sem assunto
também fica de fora — o modelo de e-mail exige assunto, e criar sem ele seria
criar algo que a própria tela recusa salvar.

## 3. O formato antigo continua valendo

Os planos escritos antes usam outra marcação, e ela **não foi aposentada**:

```
**Toque 1 (D0) — abertura:**
> Oi, [nome]! …

**Email 1 (D2) — a dor com nome:**
- Assunto: `Montar tabela cidade por cidade — até quando?`
- Corpo: dor → virada → prova → CTA
```

Aqui `Toque` é WhatsApp e `Email` é e-mail. Os dois formatos convivem, e o
extrator reconhece ambos: pedir a quem escreveu um plano pronto que o reescreva
para caber num formato só nosso é o caminho mais curto para a transcrição manual
voltar.

## 4. `[Nome]` — o detalhe que decide a assinatura

Os dois planos usam `[Nome]` capitalizado para coisas **opostas**: num, é o lead
abrindo a frase ("[Nome], a maioria dos sistemas…"); no outro, é quem assina
("Abraço,\n[Nome]"). Não é a maiúscula que separa — é a **posição**:

- `[Nome]` **sozinho na linha** → quem assina (`{{remetente}}`)
- `[Nome]` **com texto ao redor** → o lead (`{{nome}}`)

Sem essa distinção, a assinatura sairia com o nome do destinatário: *"Abraço,
Carlos"* assinado para o próprio Carlos.

## 5. Depois de aprovar

Os modelos aparecem em *Playbook & Mensagens* como **Rascunho**. Nenhum deles
entra no seletor do Disparo antes de ser aprovado ali — o texto que chega ao lead
passa por revisão, como o material de campanha. Use "Gerar teste" e "Enviar teste
pra mim" antes de aprovar: markdown, assunto cortado pelo Gmail e placeholder
esquecido só aparecem na mensagem renderizada.

---

_Relacionados: `docs/features/telemarketing/prd.md` · ADR 037 (mercados) ·
`campaign-plan-parser.ts` (a implementação, com os casos reais nos testes)._
