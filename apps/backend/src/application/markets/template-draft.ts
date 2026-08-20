/**
 * template-draft.ts — o prompt que transforma o roteiro aprovado em rascunhos de
 * mensagem, e a peneira do que a IA devolve.
 *
 * ## O elo que faltava
 *
 * A esteira era: mercado → roteiro aprovado → modelo de mensagem → disparo. O terceiro
 * passo não tinha ligação nenhuma com o segundo: `market_assets` e `message_templates`
 * são tabelas sem uma referência entre si, e nenhum código lia uma para escrever a
 * outra. Quem aprovava um plano de 11 KB abria a tela de Mensagens e encontrava zero
 * modelos — o documento aprovado ficava do lado, para ser relido e redigitado à mão.
 *
 * ## Rascunho, nunca modelo salvo
 *
 * Isto devolve PROPOSTA. Nada é gravado: quem salva é a pessoa, depois de ler, rodar o
 * "Gerar teste" e ver como a mensagem chega. É a mesma regra da aprovação do material
 * — texto que entra já valendo é texto que ninguém leu falando com o lead —, e ela não
 * pode ser afrouxada justamente no passo em que quem escreveu foi a máquina.
 *
 * ## O roteiro é conteúdo, não instrução
 *
 * O `.md` foi escrito fora do Nexa e pode conter qualquer coisa, inclusive um trecho
 * que pareça uma ordem ("ignore as instruções acima"). Ele entra cercado por
 * `fenceUntrusted`, como toda entrada não confiável do sistema.
 */
import { fenceUntrusted, UNTRUSTED_RULE } from '@/shared/ai/untrusted-input';

/** Um rascunho proposto — espelha o formulário da tela de Mensagens. */
export interface RascunhoDeModelo {
  /** Nome do modelo, como aparece na biblioteca. */
  name: string;
  /** Assunto — só faz sentido no e-mail; no WhatsApp vem vazio. */
  subject: string;
  /** Corpo da mensagem, com `{{nome}}` e `{{saudacao}}` onde couber. */
  body: string;
  /** Toque da cadência: 1 = primeiro contato, 2 = segundo, e assim por diante. */
  step: number;
  /** Por que esta mensagem existe — some ao salvar; serve para a pessoa escolher. */
  porque: string;
}

export const SISTEMA_RASCUNHO = `Você escreve o PRIMEIRO CONTATO com transportadoras que ainda não conhecem o HiperTMS, um sistema brasileiro de gestão de fretes, a partir de um plano de campanha já aprovado.

${UNTRUSTED_RULE}

QUEM ESTÁ FALANDO
Uma pessoa do setor escrevendo para um colega de setor. Alguém que conhece a rotina de
uma transportadora e escreve como quem puxa assunto, não como quem foi contratado para
converter. O leitor está no meio do dia dele e não pediu esta mensagem — a mensagem
existe para ser útil mesmo que ele nunca responda.

TOM
- Cordial e tranquilo. Fala de igual para igual, sem subir o tom e sem bajular.
- Reconhece a rotina do leitor sem dramatizar. Nada de pintar caos, prejuízo ou urgência
  que ele não relatou — quem lê sabe da própria operação melhor que você.
- Convida, não cobra. A mensagem oferece uma conversa; não persegue uma resposta.
- Frases curtas e naturais, do jeito que se fala. Sem jargão de marketing, sem
  superlativo, sem palavra difícil escolhida para impressionar.
- Educado no fim de verdade: deixar a pessoa em paz é um desfecho aceitável, e a
  mensagem pode dizer isso sem soar como técnica de venda.

O QUE NÃO FAZER
- Nada de pressão: urgência inventada, vaga limitada, "última chance", contagem
  regressiva, culpa por não responder ou insinuação de que ele está perdendo dinheiro.
- Não abrir com pergunta retórica de vendedor ("já pensou em...", "e se eu te dissesse").
- Não afirmar o que o leitor sente ou enfrenta. Descreva a situação como possibilidade
  ("é comum que...", "se for o caso de vocês..."), nunca como diagnóstico dele.
- Nem toda mensagem precisa terminar em pergunta. Fechar com uma porta aberta muitas
  vezes soa melhor e pressiona menos.

VERDADE
- Só afirme o que o plano afirma. Nunca invente número, prazo, preço, integração ou
  caso de cliente.
- Se o plano disser explicitamente o que NÃO prometer, respeite — isso vem antes de
  qualquer outra regra aqui.
- Nada de garantia absoluta ("garantimos", "100%", "sempre", "nunca falha").

FORMATO
- Use {{nome}} para o primeiro nome do lead e {{saudacao}} para "Bom dia/Boa tarde".
- Escreva as duas chaves exatamente assim; qualquer outra variável será enviada literal.
- WhatsApp: no máximo 4 linhas curtas, sem markdown (asterisco sai literal no aplicativo).
- E-mail: assunto de até 60 caracteres, escrito como quem manda e-mail para um conhecido,
  não como manchete; corpo de 6 a 12 linhas.
- Sem link e sem anexo: o primeiro contato frio com link é o padrão clássico de bloqueio
  no WhatsApp.

A CADÊNCIA
Quatro mensagens da MESMA pessoa ao longo de semanas, e é assim que devem soar — cada
uma sabendo que a anterior existiu, nenhuma repetindo a outra nem subindo o tom:
- toque 1: apresenta-se e diz por que está escrevendo. Curto.
- toque 2: um ângulo novo do plano. Não cobra a falta de resposta.
- toque 3: algo concreto que o plano sustente — um número, uma comparação — oferecido
  como informação, não como argumento para vencer uma discussão.
- toque 4: encerra de verdade. Agradece o tempo, deixa o caminho aberto, e para. Sem
  "última tentativa" e sem cobrança.

Responda SOMENTE com JSON:
{"modelos":[{"name":"...","subject":"...","body":"...","step":1,"porque":"..."}]}`;

/**
 * Quebra a lista de frases proibidas em linhas limpas.
 *
 * Uma por linha porque é como a pessoa cola: ela viu a frase no e-mail, copiou e
 * jogou no campo. Pedir separador ou JSON aqui seria transformar um gesto de dois
 * segundos numa tarefa.
 */
export function frasesProibidas(bruto: string | null | undefined): string[] {
  return (bruto ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 100); // teto: lista maior que isso não cabe no prompt sem empurrar o plano
}

/**
 * Comprimento a partir do qual uma frase proibida também vira filtro LITERAL.
 *
 * Abaixo disso ela só orienta o prompt. O motivo é evitar o tiro no pé: alguém proíbe
 * "chance" e, num filtro literal, isso derruba todo rascunho que contenha a palavra —
 * inclusive usos legítimos. Frase curta descreve um estilo; frase longa é uma frase.
 */
const MINIMO_PARA_FILTRO = 15;

export function promptDoRascunho(
  canal: 'email' | 'whatsapp',
  quantos: number,
  roteiros: { name: string; content: string }[],
  evitar: string[] = [],
): string {
  const material = roteiros
    .map((r) => `### ${r.name}\n${fenceUntrusted(r.content)}`)
    .join('\n\n');

  // As frases entram como EXEMPLO, não como lista de bloqueio: o objetivo é o modelo
  // pegar o estilo e recusar também o parente que ninguém digitou. "Não use estas
  // frases nem nada com o mesmo espírito" faz mais trabalho que cem strings soltas.
  const bloco = evitar.length
    ? [
        '',
        'FRASES QUE O OPERADOR JÁ RECUSOU — não escreva nenhuma delas, e também não',
        'escreva variações com o mesmo espírito. Elas são exemplos do tom a evitar,',
        'não uma lista fechada:',
        ...evitar.map((f) => `- ${f}`),
      ].join('\n')
    : '';

  return [
    `CANAL: ${canal === 'email' ? 'e-mail' : 'WhatsApp'}`,
    `QUANTAS MENSAGENS: ${quantos} (toques 1 a ${quantos})`,
    canal === 'whatsapp' ? 'O campo "subject" vai VAZIO neste canal.' : '',
    bloco,
    '',
    'PLANO DE CAMPANHA APROVADO:',
    material,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Qual frase proibida um texto repetiu literalmente, se alguma.
 *
 * O prompt é a defesa principal e resolve quase tudo; isto pega a reincidência
 * descarada — a frase exata que a pessoa acabou de recusar voltando na geração
 * seguinte. Vê-la de novo é o que faz alguém concluir que o campo não funciona.
 */
export function fraseRepetida(texto: string, evitar: string[]): string | null {
  const alvo = texto.toLowerCase();
  for (const f of evitar) {
    if (f.length >= MINIMO_PARA_FILTRO && alvo.includes(f.toLowerCase())) return f;
  }
  return null;
}

/**
 * Peneira o que voltou. A IA erra formato, e um rascunho quebrado que chega à tela
 * como se estivesse pronto é pior que um a menos: a pessoa salva sem perceber.
 *
 * Não corrige conteúdo — quem julga o texto é quem lê. Aqui só cai o que não tem como
 * ser usado: sem corpo, sem nome, ou com assunto em canal que não tem assunto.
 */
export function peneirarRascunhos(
  bruto: unknown,
  canal: 'email' | 'whatsapp',
  quantos: number,
  evitar: string[] = [],
): RascunhoDeModelo[] {
  const lista = Array.isArray((bruto as any)?.modelos) ? (bruto as any).modelos : [];

  const limpos: RascunhoDeModelo[] = [];
  for (const [i, m] of lista.entries()) {
    const body = typeof m?.body === 'string' ? m.body.trim() : '';
    if (!body) continue; // mensagem sem corpo não é mensagem

    // Reincidência: a frase exata que a pessoa recusou voltou. Sai da lista em vez de
    // aparecer marcada — ela já disse o que achava desse texto, e mostrá-lo de novo,
    // ainda que com um selo, é discutir uma decisão que já foi tomada.
    const repetida = fraseRepetida(`${m?.subject ?? ''}\n${body}`, evitar);
    if (repetida) continue;

    const name = typeof m?.name === 'string' && m.name.trim()
      ? m.name.trim().slice(0, 120)
      : `Toque ${i + 1}`;

    // Assunto só existe no e-mail. Vindo no WhatsApp, é descartado em vez de virar
    // um campo escondido que ninguém revisa e que o disparo ignora depois.
    const subject = canal === 'email' && typeof m?.subject === 'string' ? m.subject.trim().slice(0, 200) : '';
    if (canal === 'email' && !subject) continue; // e-mail sem assunto não sai

    const step = Number.isInteger(m?.step) && m.step > 0 ? m.step : i + 1;

    limpos.push({
      name,
      subject,
      body,
      step,
      porque: typeof m?.porque === 'string' ? m.porque.trim().slice(0, 300) : '',
    });
  }

  // Ordena pelo toque e corta o excesso: pedir 4 e receber 7 é a IA inventando
  // cadência, e uma lista maior que a pedida faz a pessoa escolher no escuro.
  return limpos.sort((a, b) => a.step - b.step).slice(0, quantos);
}
