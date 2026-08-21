/**
 * formatoDoRoteiro.ts — a instrução que ensina a IA a escrever o plano no
 * formato que o Nexa consegue ler.
 *
 * ## Por que na tela, e não só na documentação
 *
 * O roteiro é escrito FORA do Nexa, numa IA, por quem está pensando na campanha —
 * não no parser. Documentação num arquivo do repositório não alcança essa pessoa:
 * ela abriria o chat, escreveria o plano do jeito que sai, e descobriria o
 * formato depois, quando a aprovação não criasse modelo nenhum. Foi o que
 * aconteceu em 21/08/2026 com o plano de seis toques.
 *
 * Aqui o texto está a um clique de onde o roteiro é subido, que é o momento em
 * que a pessoa se lembra de que ele existe.
 *
 * Fonte da verdade do formato: `docs/features/telemarketing/formato-do-roteiro.md`
 * e os casos reais em `campaign-plan-parser.spec.ts`. Mudou o parser, muda aqui.
 */

export const INSTRUCAO_DE_FORMATO = `Escreva a cadência seguindo EXATAMENTE este formato, porque ele é lido por um sistema que transforma cada bloco numa mensagem pronta para disparo:

### E1 · D0 — Título curto da peça

**Assunto (A):** \`assunto em minúsculas, até 45 caracteres\`
**Assunto (B):** \`variante para teste A/B\`
**Pré-header:** uma linha que complementa o assunto

> Corpo da mensagem, todo dentro da citação.
>
> Cada parágrafo separado por uma linha com apenas ">".
>
> Abraço,
> [Nome]

Regras do formato:
- \`E1\`, \`E2\`, \`E3\`… = e-mail.  \`W1\`, \`W2\`… = WhatsApp.  O número é a posição na cadência (toque 1, toque 2…).
- \`D0\`, \`D3\`, \`D7\` = o dia do disparo. Fica no nome da peça.
- Só o Assunto (A) vira o assunto do modelo; o (B) fica guardado no documento.
- O corpo é TUDO que estiver na citação (>). O que estiver fora dela não entra.
- Pré-header não entra no corpo — é campo próprio do provedor de e-mail.

Variáveis que o disparo preenche sozinho (use exatamente assim):
- [nome]     → primeiro nome do lead. Boa parte da base não tem nome, e nesse caso a frase se recompõe sozinha: não escreva de um jeito que quebre sem ele.
- [empresa]  → nome da empresa do lead. Sem empresa, vira "sua empresa".
- [Nome]     → quem assina. Precisa estar SOZINHO na linha, na assinatura.

Qualquer outro colchete ([cidade], [rota exemplo], [link]) sai LITERAL para o lead — o sistema avisa antes de salvar, mas prefira não usar.

Não use negrito para frases inteiras: em e-mail de texto puro os asteriscos aparecem como asteriscos. Destaque no máximo duas ou três expressões curtas.

O resto do documento (análise, métricas, checklist, notas de produto) pode existir à vontade: o sistema lê só os blocos de cadência e ignora o restante.`;
