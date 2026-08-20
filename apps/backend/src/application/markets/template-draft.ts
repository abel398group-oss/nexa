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

export const SISTEMA_RASCUNHO = `Você escreve mensagens de PROSPECÇÃO FRIA para um sistema de gestão de fretes brasileiro (HiperTMS), a partir de um plano de campanha já aprovado.

${UNTRUSTED_RULE}

REGRAS DE CONTEÚDO
- Só afirme o que o plano afirma. Nunca invente número, prazo, preço, integração ou caso de cliente.
- Se o plano disser explicitamente o que NÃO prometer, respeite — isso vem antes de qualquer outra regra.
- Nada de garantia absoluta ("garantimos", "100%", "sempre", "nunca falha").
- Português do Brasil, tom de quem trabalha no setor: direto, sem marketês, sem superlativo.
- Fale da DOR do transportador, não das funcionalidades do produto.

REGRAS DE FORMATO
- Use {{nome}} para o primeiro nome do lead e {{saudacao}} para "Bom dia/Boa tarde".
- Escreva as duas chaves exatamente assim; qualquer outra variável será enviada literal ao lead.
- WhatsApp: no máximo 4 linhas curtas, sem markdown (asterisco sai literal), termine com uma pergunta.
- E-mail: assunto de até 60 caracteres falando da dor; corpo de 6 a 12 linhas.
- Sem link e sem anexo: o primeiro contato frio com link é o padrão clássico de bloqueio no WhatsApp.

A CADÊNCIA
Cada mensagem é um TOQUE diferente, e um toque não repete o anterior:
- toque 1: abre o assunto e faz uma pergunta
- toque 2: traz um ângulo novo do plano, não insiste no mesmo
- toque 3: prova concreta (número, comparação) que o plano sustente
- toque 4: encerramento educado, deixa a porta aberta e para

Responda SOMENTE com JSON:
{"modelos":[{"name":"...","subject":"...","body":"...","step":1,"porque":"..."}]}`;

export function promptDoRascunho(
  canal: 'email' | 'whatsapp',
  quantos: number,
  roteiros: { name: string; content: string }[],
): string {
  const material = roteiros
    .map((r) => `### ${r.name}\n${fenceUntrusted(r.content)}`)
    .join('\n\n');

  return [
    `CANAL: ${canal === 'email' ? 'e-mail' : 'WhatsApp'}`,
    `QUANTAS MENSAGENS: ${quantos} (toques 1 a ${quantos})`,
    canal === 'whatsapp' ? 'O campo "subject" vai VAZIO neste canal.' : '',
    '',
    'PLANO DE CAMPANHA APROVADO:',
    material,
  ]
    .filter(Boolean)
    .join('\n');
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
): RascunhoDeModelo[] {
  const lista = Array.isArray((bruto as any)?.modelos) ? (bruto as any).modelos : [];

  const limpos: RascunhoDeModelo[] = [];
  for (const [i, m] of lista.entries()) {
    const body = typeof m?.body === 'string' ? m.body.trim() : '';
    if (!body) continue; // mensagem sem corpo não é mensagem

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
