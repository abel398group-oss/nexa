// Parser do CSV de lista do módulo 1. Puro: nada de Prisma, nada de I/O — o que
// depende do banco (já na base, cliente, opt-out) fica no service.
//
// Reusa `normalizePhone` / `isValidBrazilPhone` (shared/utils/phone.util.ts) e
// `normalizeEmail` (application/email/email-address.ts) de propósito: telefone com
// duas normalizações diferentes no mesmo sistema é como o mesmo lead entra duas
// vezes sem ninguém ver.

import { normalizeEmail } from '../email/email-address';
import { isValidBrazilPhone, normalizePhone } from '../../shared/utils/phone.util';
import type { LinhaAvaliada, MotivoDescarte } from './lead-import';

/// Cabeçalhos aceitos por campo. A lista vem de fora — feira, indicação, planilha
/// que alguém montou no Excel — então o parser aceita as variações em vez de exigir
/// um formato que o operador vai errar e nem saber por quê.
/// Comparadas já normalizadas (ver `chaveDoCabecalho`): minúsculas, sem acento e com
/// `_` virando espaço. Por isso `razao social` cobre `razao_social` e `RAZÃO SOCIAL`.
const CABECALHOS: Record<string, readonly string[]> = {
  name: ['nome', 'name', 'contato', 'responsavel'],
  // `nome fantasia` é da EMPRESA, não da pessoa — e precisa vir aqui explicitamente,
  // porque o casamento é exato: sozinho ele não cai nem em `nome` nem em `empresa`.
  company: [
    'empresa', 'company', 'razao social', 'razao', 'transportadora',
    'nome fantasia', 'fantasia',
  ],
  phone: ['telefone', 'fone', 'phone', 'celular', 'whatsapp', 'zap'],
  email: ['email', 'e-mail', 'mail'],
  fleetSize: ['frota', 'fleet', 'caminhoes', 'veiculos'],
};

export interface LinhaCsv {
  /// Número da linha no arquivo, contando o cabeçalho. É o que o operador vê no
  /// Excel — sem isso, "linha 3 inválida" manda ele contar na mão.
  linha: number;
  name: string | null;
  company: string | null;
  phone: string | null; // canônico "55..." ou null
  email: string | null; // NULL, nunca string vazia (ADR 021)
  fleetSize: number | null;
  /// A célula de telefone tinha conteúdo mas não sobrou telefone utilizável — "abc",
  /// "não tem", um ramal. Diferente de célula vazia, e o relatório precisa distinguir:
  /// sem isso, lixo na coluna de telefone desaparece e o operador não sabe que
  /// preencheu errado.
  foneInvalido: boolean;
}

export interface ResultadoCsv {
  linhas: (LinhaCsv & LinhaAvaliada)[];
  /// Colunas do arquivo que o parser não reconheceu. Devolvido pra tela avisar
  /// "a coluna CNPJ foi ignorada" em vez de descartar em silêncio.
  colunasIgnoradas: string[];
}

/// Excel brasileiro salva CSV com `;`. Detectar pelo cabeçalho evita o caso clássico
/// de o arquivo inteiro virar uma coluna só e o operador achar que a lista está ruim.
export function detectarSeparador(cabecalho: string): ';' | ',' | '\t' {
  const ponto = (cabecalho.match(/;/g) ?? []).length;
  const virgula = (cabecalho.match(/,/g) ?? []).length;
  const tab = (cabecalho.match(/\t/g) ?? []).length;
  if (tab > ponto && tab > virgula) return '\t';
  return ponto >= virgula ? ';' : ',';
}

/// Divide respeitando aspas: `"Silva, Transportes";11999...` é duas células.
function dividir(linha: string, sep: string): string[] {
  const celulas: string[] = [];
  let atual = '';
  let dentroDeAspas = false;

  for (let i = 0; i < linha.length; i += 1) {
    const c = linha[i];
    if (c === '"') {
      if (dentroDeAspas && linha[i + 1] === '"') {
        atual += '"'; // aspas escapada ("")
        i += 1;
      } else {
        dentroDeAspas = !dentroDeAspas;
      }
      continue;
    }
    if (c === sep && !dentroDeAspas) {
      celulas.push(atual);
      atual = '';
      continue;
    }
    atual += c;
  }
  celulas.push(atual);
  return celulas.map((v) => v.trim());
}

function chaveDoCabecalho(bruto: string): string | null {
  const limpo = bruto
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, '') // BOM do Excel
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // acento: "razão" → "razao"
    // Underline vira espaço: exportação de sistema sai em `razao_social`,
    // `nome_fantasia`, `lead_email`. Sem isto, `campanha_sp_completa.csv` — 31.906
    // linhas vindas da base da Receita — entrava com e-mail e telefone e SEM empresa
    // nenhuma: 27.607 leads anônimos. O estrago não é o campo vazio, é o e-mail sair
    // sem nada que mostre que a gente sabe com quem está falando.
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const [campo, variacoes] of Object.entries(CABECALHOS)) {
    if (variacoes.includes(limpo)) return campo;
  }
  return null;
}

/**
 * Marcadores de razão social. Só palavra inteira — `\b` importa: sem ele, "Log"
 * casaria dentro de "Logan" e o sobrenome de uma pessoa viraria nome de empresa.
 */
const CARA_DE_EMPRESA =
  /\b(ltda|me|epp|eireli|s\/a|sa|cia|transportes?|transportadora|logistica|log|cargas?|express|rodoviari[oa]|distribuidora|comercio|servicos|grupo)\b/i;

/**
 * O que veio na coluna `nome` é razão social, não nome de pessoa?
 *
 * A base real de transportadoras vem quase toda assim: 71% dos leads quentes e 84%
 * dos frios trazem "OURO CARGO TRANSPORTES LTDA" ou "TB LOG" no campo do nome, e em
 * 11.142 linhas o nome é IDÊNTICO à empresa. O disparo usa o primeiro nome, então
 * isso saía como "Bom dia, OURO!" e "Bom dia, TB!" — que anuncia robô na primeira
 * linha e queima o lead.
 *
 * A ironia é que o campo VAZIO era melhor: sem nome, `tidyMissingName` remove o
 * placeholder e a frase se recompõe sozinha ("Bom dia! Uma pergunta rápida…").
 * O estrago vem de o sistema confiar num nome que não é nome.
 *
 * Três sinais, e qualquer um basta:
 *   • bate com a coluna `empresa` — quem exportou preencheu as duas iguais;
 *   • carrega marcador de pessoa jurídica (LTDA, TRANSPORTES, LOG, CARGAS…);
 *   • é o começo da razão social e o que sobra dela é marcador — "MAZALOG" para
 *     "MAZALOG TRANSPORTES E LOGISTICA LTDA". São 2.017 linhas só na base quente,
 *     e nenhuma delas é gente: "CONFCARGO", "FORTECARGO", "IRMAOS VIEIRA",
 *     "GTX GUINCHO". A marca abreviada não tem marcador nenhum dentro de si, então
 *     os dois primeiros sinais passam batido por ela.
 *
 * A exigência de marcador NO RESTO é o que protege o caso legítimo: "Carlos" com
 * empresa "Carlos Silva" continua sendo Carlos, porque "Silva" não é marcador — ali
 * o primeiro nome no cumprimento está certo, é o dono da transportadora.
 *
 * Função PURA e exportada: a decisão de quando um nome não é nome precisa de teste
 * contra os casos reais, e ela não deveria exigir um CSV para ser verificada.
 */
export function pareceRazaoSocial(nome: string | null, empresa: string | null): boolean {
  const n = nome?.trim();
  if (!n) return false;

  const e = empresa?.trim();
  if (e) {
    if (n.toLowerCase() === e.toLowerCase()) return true;

    // Prefixo da razão social: o que sobra precisa ser marcador de PJ.
    const prefixo = n.toLowerCase() + ' ';
    if (e.toLowerCase().startsWith(prefixo) && CARA_DE_EMPRESA.test(e.slice(n.length))) {
      return true;
    }
  }

  return CARA_DE_EMPRESA.test(n);
}

function numeroOuNulo(bruto: string | null): number | null {
  if (!bruto) return null;
  const digits = bruto.replace(/\D/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/// Veredito do que dá pra decidir só com o arquivo na mão. O resto (já na base,
/// cliente, opt-out) precisa do banco e fica no service.
export function avaliarLinha(
  linha: LinhaCsv,
  jaVistos: Set<string>,
): MotivoDescarte | null {
  const temFone = !!linha.phone && isValidBrazilPhone(linha.phone);
  const temEmail = !!linha.email && FORMATO_EMAIL.test(linha.email);

  // Duplicado dentro do próprio arquivo. Chave: telefone, com e-mail como reserva —
  // lista de feira costuma ter o mesmo contato repetido em dias diferentes.
  const chave = temFone ? linha.phone! : temEmail ? linha.email! : null;
  if (chave) {
    if (jaVistos.has(chave)) return 'duplicado';
    jaVistos.add(chave);
  }

  // Um canal utilizável basta: o SDR liga, manda zap ou manda e-mail. Lead só com
  // e-mail ainda é trabalhável — descartar por não ter telefone jogaria fora lead
  // bom de formulário de site.
  if (temFone || temEmail) return null;

  // Nada aproveitável: reporta o campo que o operador preencheu e está errado, que é
  // o que ele consegue corrigir na planilha. Telefone vem primeiro porque é o canal
  // principal do SDR — e porque lixo no telefone (`abc`) some na normalização, então
  // sem esta ordem o relatório acusaria o e-mail e a coluna errada seria conferida.
  if (linha.foneInvalido || linha.phone) return 'telefone_invalido';
  if (linha.email) return 'email_invalido';
  return 'telefone_invalido';
}

/** Opções da importação que dependem do que o operador SABE sobre a lista. */
export interface OpcoesDeParse {
  /**
   * A coluna `nome` desta lista é nome fantasia da EMPRESA, não de uma pessoa.
   *
   * Existe porque a heurística tem teto. Numa base de transportadoras exportada da
   * Receita, TODO nome é fantasia — e a parte que não carrega marcador nenhum
   * ("PEQLOG", "RODA BRASIL", "S & M", "BAIA") é indistinguível de gente por
   * qualquer regra que se escreva. São 3.033 linhas na base quente, e sem esta
   * opção elas sairiam como "Boa tarde, PEQLOG!".
   *
   * Quem sobe a lista sabe a resposta num olhar; o parser, não. Marcar aqui é
   * determinístico: nenhum nome de pessoa é inventado, e a saudação sai limpa.
   */
  nomeEhDaEmpresa?: boolean;
}

export function parseCsvDeLeads(conteudo: string, opcoes: OpcoesDeParse = {}): ResultadoCsv {
  const texto = conteudo.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const brutas = texto.split('\n').filter((l) => l.trim().length > 0);
  if (brutas.length === 0) return { linhas: [], colunasIgnoradas: [] };

  const sep = detectarSeparador(brutas[0]);
  const cabecalhos = dividir(brutas[0], sep);
  const mapa = cabecalhos.map(chaveDoCabecalho);
  const colunasIgnoradas = cabecalhos.filter((_, i) => mapa[i] === null);

  const jaVistos = new Set<string>();
  const linhas: (LinhaCsv & LinhaAvaliada)[] = [];

  for (let i = 1; i < brutas.length; i += 1) {
    const celulas = dividir(brutas[i], sep);
    const campos: Record<string, string | null> = {};
    // Duas colunas podem cair no MESMO campo — `razao_social` e `nome_fantasia` são
    // as duas empresa; `whatsapp` e `telefone` são os dois telefone. Vence a primeira
    // PREENCHIDA, não a última: antes, uma coluna vazia mais à direita apagava o valor
    // que a da esquerda tinha trazido. Em `campanha_sp_completa.csv` o `nome_fantasia`
    // em branco zerava a razão social de 13.846 linhas que estavam certas.
    //
    // Como efeito, `whatsapp` passa a ganhar de `telefone` quando os dois vêm — e é o
    // que se quer: o SDR trabalha no zap, e a outra coluna costuma ser o fixo.
    mapa.forEach((campo, idx) => {
      if (!campo || campos[campo]) return;
      const valor = (celulas[idx] ?? '').trim();
      campos[campo] = valor.length > 0 ? valor : null;
    });

    const foneNormalizado = campos.phone ? normalizePhone(campos.phone) : '';
    const emailNormalizado = campos.email ? normalizeEmail(campos.email) : '';

    // Razão social na coluna do nome vira EMPRESA, e o nome fica vazio — ver
    // `pareceRazaoSocial`. Só ocupa a empresa se ela estiver livre: quando as duas
    // colunas vieram preenchidas, a de empresa é a que o operador escolheu, e
    // sobrescrever trocaria a razão social completa por uma abreviação ("TB LOG"
    // no lugar de "TRANSPORTADORA BARBARENSE LTDA").
    const nomeBruto = campos.name ?? null;
    const empresaBruta = campos.company ?? null;
    // A escolha do operador vem antes da heurística: ele viu a lista inteira.
    const nomeEhEmpresa =
      opcoes.nomeEhDaEmpresa === true ? !!nomeBruto : pareceRazaoSocial(nomeBruto, empresaBruta);

    const linha: LinhaCsv = {
      linha: i + 1, // +1: o operador conta o cabeçalho como linha 1
      name: nomeEhEmpresa ? null : nomeBruto,
      company: empresaBruta ?? (nomeEhEmpresa ? nomeBruto : null),
      phone: foneNormalizado.length > 0 ? foneNormalizado : null,
      email: emailNormalizado.length > 0 ? emailNormalizado : null,
      fleetSize: numeroOuNulo(campos.fleetSize ?? null),
      // Célula preenchida que não virou telefone válido. `!!campos.phone` distingue
      // de célula vazia, que não é erro do operador — é dado que ele não tinha.
      foneInvalido:
        !!campos.phone &&
        (foneNormalizado.length === 0 || !isValidBrazilPhone(foneNormalizado)),
    };

    linhas.push({
      ...linha,
      descarte: avaliarLinha(linha, jaVistos),
      temNome: !!linha.name,
    });
  }

  return { linhas, colunasIgnoradas };
}
