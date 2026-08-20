/**
 * campaign-plan-parser.ts — tira as mensagens de dentro do roteiro.
 *
 * ## Por que existe
 *
 * O roteiro de campanha já traz a cadência escrita: "Toque 1 (D0)", "Email 2 (D9)",
 * com assunto e texto. Mas nada levava isso para a tela de Mensagens — alguém abria o
 * `.md`, lia, e digitava tudo de novo. Foi assim que os quatro toques do HiperTMS
 * entraram em 18/08/2026, um a cada 400ms, à meia-noite e quarenta: transcrição
 * manual. O plano é a FONTE e ficava fora do sistema; o que dispara para o lead era
 * uma cópia à mão, sem nada garantindo que as duas coisas fossem iguais.
 *
 * Aprovar o roteiro agora publica os modelos que ele descreve. O caminho vira:
 * escrever o plano → subir → ler e aprovar → as mensagens já estão na tela seguinte.
 *
 * ## O formato que ele lê
 *
 * É o formato que os roteiros reais já usam (`marketing-social/*.md`), não um novo:
 *
 *     **Toque 1 (D0) — abertura/qualificação:**
 *     > Oi, [nome]! Aqui é a Lia, do HiperTMS. (…)
 *
 *     **Email 1 (D2) — a dor com nome:**
 *     - Assunto: `Montar tabela de frete cidade por cidade — até quando?`
 *     - Corpo: dor (tabela manual trava a PME) → virada (…) → CTA calculadora.
 *
 * `Toque` é WhatsApp e o texto vem na citação; `Email` é e-mail e vem em tópicos.
 * O número do toque vira o `step` (posição na cadência), e o `(D2)` fica no NOME,
 * porque é assim que quem escreveu o plano chama a peça.
 *
 * ## O que ele NÃO faz
 *
 * Não inventa texto. No plano de e-mail, o "Corpo:" costuma ser um briefing do que a
 * mensagem deve dizer, não a mensagem final — e é isso que vai para o modelo, porque
 * traduzir briefing em copy é escrever, não extrair. Quem revisa termina o texto na
 * tela de Mensagens, com o assunto e a estrutura já lá.
 *
 * Função PURA: recebe markdown, devolve os toques. Sem banco, sem IA.
 */

/** Uma mensagem encontrada no roteiro. */
export interface ToqueDoRoteiro {
  channel: 'whatsapp' | 'email';
  /** Posição na cadência — o número do "Toque 1" / "Email 2". */
  step: number;
  /** Como a peça se chama no plano: "Toque 1 (D0) — abertura/qualificação". */
  name: string;
  /** Só e-mail. */
  subject?: string;
  body: string;
}

/**
 * `[nome]` e `[empresa]` do plano viram `{{nome}}` e `{{empresa}}`, que é o que o
 * disparo resolve (ver `SenderService.renderTemplate` e `renderEmpresa` — empresa
 * sem valor vira "sua empresa", nunca a chave crua).
 *
 * O resto dos colchetes fica como está de propósito: `[link calculadora]` não tem
 * variável correspondente no envio. Em colchete, salta aos olhos na revisão que
 * ali falta uma decisão humana.
 */
function normalizarPlaceholders(texto: string): string {
  return texto
    .replace(/\[nome\]/gi, '{{nome}}')
    .replace(/\[empresa\]/gi, '{{empresa}}');
}

/** Cabeçalho de uma peça: `**Toque 1 (D0) — abertura:**` */
const CABECALHO = /^\*\*(Toque|Email)\s+(\d+)\s*(\([^)]*\))?\s*(?:—|-|–)?\s*([^*]*?):?\*\*\s*$/i;

/** Linha de citação (`> texto`) — o corpo do WhatsApp. */
const CITACAO = /^>\s?(.*)$/;

/** `- Assunto: \`texto\`` (com ou sem crase). */
const ASSUNTO = /^[-*]\s*Assunto:\s*`?(.+?)`?\s*$/i;

/** `- Corpo: texto` */
const CORPO = /^[-*]\s*Corpo:\s*(.+)$/i;

/**
 * Extrai as mensagens de um roteiro de campanha.
 *
 * Devolve na ordem em que aparecem. Peça sem corpo nenhum é descartada: um
 * cabeçalho solto ("**Toque 3 (D14):**" e nada abaixo) é rascunho de quem estava
 * escrevendo, não mensagem — criar um modelo vazio a partir dele encheria a tela de
 * Mensagens de linhas que ninguém pode enviar.
 */
export function extrairToques(markdown: string): ToqueDoRoteiro[] {
  if (!markdown?.trim()) return [];

  const linhas = markdown.split(/\r?\n/);
  const toques: ToqueDoRoteiro[] = [];

  let atual: (Omit<ToqueDoRoteiro, 'body'> & { partes: string[] }) | null = null;

  const fechar = () => {
    if (!atual) return;
    const body = normalizarPlaceholders(atual.partes.join('\n').trim());
    if (body) {
      const { partes, ...resto } = atual;
      toques.push({ ...resto, body });
    }
    atual = null;
  };

  for (const linha of linhas) {
    const cab = linha.match(CABECALHO);
    if (cab) {
      // Cabeçalho novo fecha o anterior: é o único delimitador confiável num
      // markdown escrito à mão, onde nem toda peça termina com linha em branco.
      fechar();
      const [, tipo, numero, dia, titulo] = cab;
      const rotuloDia = dia ? ` ${dia.trim()}` : '';
      const rotuloTitulo = titulo?.trim() ? ` — ${titulo.trim()}` : '';
      atual = {
        channel: /email/i.test(tipo) ? 'email' : 'whatsapp',
        step: Number(numero),
        // O nome é o do plano, para a peça ser reconhecível nas duas telas.
        name: `${tipo.replace(/^./, (c) => c.toUpperCase())} ${numero}${rotuloDia}${rotuloTitulo}`,
        partes: [],
      };
      continue;
    }

    if (!atual) continue;

    // Um título de seção (`## 6. Conteúdo de apoio`) encerra a peça aberta —
    // sem isso, o texto da seção seguinte entraria no corpo do último toque.
    if (/^#{1,6}\s/.test(linha)) {
      fechar();
      continue;
    }

    const assunto = linha.match(ASSUNTO);
    if (assunto) {
      atual.subject = normalizarPlaceholders(assunto[1].trim());
      continue;
    }

    const corpo = linha.match(CORPO);
    if (corpo) {
      atual.partes.push(corpo[1].trim());
      continue;
    }

    const citacao = linha.match(CITACAO);
    if (citacao) {
      atual.partes.push(citacao[1]);
      continue;
    }
  }

  fechar();

  // E-mail sem assunto não entra: o assunto é obrigatório no modelo de e-mail
  // (MessageTemplatesService.validar) e criar sem ele seria criar algo que a
  // própria tela recusa salvar.
  return toques.filter((t) => t.channel !== 'email' || !!t.subject?.trim());
}
