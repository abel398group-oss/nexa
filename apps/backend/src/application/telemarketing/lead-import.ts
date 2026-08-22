// Módulo 1 do telemarketing: as duas regras finas da importação de lista, puras e
// testáveis sem banco. Ver docs/features/telemarketing/prd.md §Revisão 2026-08-11.
//
// Por que fora do service: são as regras que, erradas, destroem dado real de
// cliente em silêncio (R2) ou colocam um opt-out de volta numa campanha. Enterradas
// dentro de um método com Prisma, ninguém as testa isoladamente.

/// Motivo de descarte na entrada. String e não enum: acrescentar motivo é mudança
/// de código, não migration — mesmo padrão de `Opportunity.stage`.
export type MotivoDescarte =
  | 'duplicado' // repetido dentro do próprio arquivo
  | 'ja_na_base' // já existe como Contact deste tenant
  | 'cliente' // cliente do TMS, ou Contact.customerSince preenchido
  | 'telefone_invalido'
  | 'email_invalido'
  | 'concorrente'
  | 'opt_out'
  /// Reimportação forçada (`forcarJaNaBase`) de um contato que já tem oportunidade
  /// ATIVA neste mesmo mercado. Sem esta trava, forçar a entrada criava uma segunda
  /// oportunidade em 'new' para quem já está em qualificação/proposta com um
  /// SDR/Closer — o funil passava a contar o mesmo negócio duas vezes e a fila do
  /// SDR reabria um lead que já tinha dono. Nunca forçável: forçar 'ja_na_base' é
  /// para "mesmo contato, negócio novo"; isto aqui é "mesmo contato, MESMO negócio
  /// ainda aberto".
  | 'ja_tem_oportunidade'
  /// Limitação atual, não regra de negócio: o unique de `contacts` é (tenantId, phone)
  /// e phone não é nullable, então só cabe UM contato novo sem telefone por tenant.
  /// Este motivo torna a perda VISÍVEL no relatório — antes o lead sumia com um log de
  /// servidor que o operador nunca vê. O conserto de verdade (phone nullable) mexe em
  /// WhatsApp/disparo/inbox e é tarefa própria.
  | 'sem_telefone';

/// Único motivo que o gestor pode forçar. Os outros quatro seguem travados, cada um
/// por uma razão diferente e nenhuma delas negociável: opt-out é LGPD; e-mail morto
/// queima a reputação do domínio pra toda campanha seguinte; cliente receberia
/// oferta do que já paga; concorrente ganharia o roteiro de vendas de graça.
const FORCAVEIS: readonly MotivoDescarte[] = ['ja_na_base'];

export function podeForcar(motivo: MotivoDescarte): boolean {
  return FORCAVEIS.includes(motivo);
}

// ─────────────────────────────────────────────────────────────────────────────
// R2 — o risco mais grave da feature
// ─────────────────────────────────────────────────────────────────────────────

/// Campos que a Lia aprende conversando. Uma planilha com a coluna em branco NÃO
/// pode apagá-los: a perda é silenciosa e só aparece semanas depois, quando a Lia
/// repergunta a frota que o lead já informou.
export const CAMPOS_PROTEGIDOS = [
  'name',
  'company',
  'fleetSize',
  'interestScore',
  'leadStatus',
] as const;

export type CampoProtegido = (typeof CAMPOS_PROTEGIDOS)[number];

/// Vazio para efeito de importação. `0` e `false` NÃO são vazios — `interestScore: 0`
/// é uma pontuação que a Lia calculou, e tratá-la como ausente é justamente o bug
/// que `!valor` produziria.
export function estaVazio(valor: unknown): boolean {
  if (valor === null || valor === undefined) return true;
  if (typeof valor === 'string') return valor.trim().length === 0;
  return false;
}

/**
 * Nome da empresa que vale para o negócio: **a ficha do contato manda**.
 *
 * Existem duas cópias do nome — uma na ficha do contato, uma em cada oportunidade — e
 * elas divergiam. `preencherSemSobrescrever` protege a ficha de propósito, pra planilha
 * não apagar o que a Lia levantou; mas a oportunidade nascia com o valor da planilha
 * sempre. Quando os dois discordavam, a fila do SDR (que lê a ficha) e a tela de
 * Oportunidades (que lê o negócio) mostravam a MESMA empresa com dois nomes. Na base
 * real: contato `b79373e6` como "Hipervias (teste interno)" na ficha e "Log Minas
 * Transportes" nas oportunidades.
 *
 * A ficha ganha porque é ela que a pessoa edita na tela e é ela que a Lia enriquece.
 * A planilha é palpite de uma lista; a ficha é o que se sabe do cliente.
 *
 * `estaVazio` e não `??`: string em branco na ficha é ficha sem nome, e deixá-la ganhar
 * apagaria o nome que a lista trouxe.
 */
export function empresaDoNegocio(
  daFicha: string | null | undefined,
  daLista: string | null | undefined,
): string | null {
  if (!estaVazio(daFicha)) return daFicha as string;
  return estaVazio(daLista) ? null : (daLista as string);
}

/// A regra: a importação **preenche vazio, nunca sobrescreve**.
///
/// Deliberadamente não olha a origem do dado (`nameSource`). "Sobrescreve se a
/// origem for X" é onde o bug mora: basta alguém acrescentar uma origem nova e a
/// exceção passa a valer pra ela sem ninguém decidir isso. Preencher só o que está
/// vazio é a regra que não tem borda.
///
/// Retorna apenas o delta — chave ausente significa "não toca".
export function preencherSemSobrescrever<T extends Record<string, unknown>>(
  atual: T,
  daPlanilha: Partial<T>,
): Partial<T> {
  const delta: Partial<T> = {};

  for (const chave of Object.keys(daPlanilha) as (keyof T)[]) {
    const novo = daPlanilha[chave];
    if (estaVazio(novo)) continue; // planilha em branco nunca escreve
    if (!estaVazio(atual[chave])) continue; // já tem dado: não toca
    delta[chave] = novo;
  }

  return delta;
}

/// Guarda de segundo nível: mesmo que alguém monte o delta por outro caminho, isto
/// derruba qualquer tentativa de sobrescrever campo protegido preenchido. Chamar
/// antes do `update`.
export function violaProtecao<T extends Record<string, unknown>>(
  atual: T,
  delta: Partial<T>,
): CampoProtegido[] {
  return CAMPOS_PROTEGIDOS.filter((campo) => {
    if (!(campo in delta)) return false;
    return !estaVazio(atual[campo as keyof T]);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Veredito que depende do banco — puro, recebendo os fatos já consultados
// ─────────────────────────────────────────────────────────────────────────────

/// O que o banco sabe sobre um contato que já existe. `null` = não existe.
export interface FatosDoContato {
  optOutAt: Date | null;
  status: string;
  emailBouncedAt: Date | null;
  customerSince: Date | null;
}

export interface VereditoDeBanco {
  descarte: MotivoDescarte | null;
  /// Verdadeiro quando o e-mail deve ser descartado mas o lead continua. Hard bounce
  /// mata o endereço, não a pessoa: o mesmo contato segue alcançável no WhatsApp
  /// (ver o comentário de `emailBouncedAt` no schema).
  descartarEmail: boolean;
}

export function vereditoDeBanco(args: {
  temFone: boolean;
  temEmail: boolean;
  existente: FatosDoContato | null;
  estaNoTms: boolean;
  forcarJaNaBase: boolean;
  /// Este contato já tem uma Opportunity ABERTA (fora won/lost/discarded) no MESMO
  /// productCode desta importação. Só importa quando `existente` não é nulo — um
  /// contato novo nunca pode ter oportunidade prévia.
  temOportunidadeAtivaNoMercado: boolean;
}): VereditoDeBanco {
  const { temFone, temEmail, existente, estaNoTms, forcarJaNaBase, temOportunidadeAtivaNoMercado } =
    args;

  // Precedência, e ela importa: `cliente` ganha de `já na base` porque é mais
  // informativo e, ao contrário dele, não é forçável. Reportar o motivo frouxo
  // deixaria o operador achar que dá pra forçar a entrada de um cliente.
  if (existente?.customerSince || estaNoTms) {
    return { descarte: 'cliente', descartarEmail: false };
  }

  if (existente?.optOutAt || existente?.status === 'opted_out') {
    return { descarte: 'opt_out', descartarEmail: false }; // LGPD
  }

  const descartarEmail = !!existente?.emailBouncedAt && temEmail;
  // Só cai se o e-mail queimado era o único canal.
  if (descartarEmail && !temFone) {
    return { descarte: 'email_invalido', descartarEmail: true };
  }

  // Antes de `ja_na_base` e SEM olhar `forcarJaNaBase`: forçar a reentrada não pode
  // duplicar um negócio que já está aberto. Um contato pode logicamente ter uma
  // segunda oportunidade no MESMO mercado depois que a primeira fecha (won/lost) —
  // por isso a checagem é "tem oportunidade ativa", não "já teve alguma vez".
  if (existente && temOportunidadeAtivaNoMercado) {
    return { descarte: 'ja_tem_oportunidade', descartarEmail };
  }

  if (existente && !(forcarJaNaBase && podeForcar('ja_na_base'))) {
    return { descarte: 'ja_na_base', descartarEmail };
  }

  return { descarte: null, descartarEmail };
}

// ─────────────────────────────────────────────────────────────────────────────
// Contadores do lote
// ─────────────────────────────────────────────────────────────────────────────

export interface ContadoresLote {
  received: number;
  duplicate: number;
  invalid: number;
  valid: number;
  noName: number;
  /// Entraram, mas com lixo na coluna de telefone — "abc", um ramal, "não tem". Entram
  /// porque o e-mail salvou a linha; contam aqui porque um lead sem telefone é um lead
  /// que o SDR não liga, e isso precisa ser visível ANTES da importação, não descoberto
  /// na fila dele.
  foneLixo: number;
  porMotivo: Record<string, number>;
}

export interface LinhaAvaliada {
  descarte: MotivoDescarte | null;
  temNome: boolean;
  /// Célula de telefone preenchida que não virou telefone utilizável.
  foneInvalido?: boolean;
}

/// Toda taxa se calcula sobre `valid`, nunca sobre `received` — senão lista suja se
/// elogia sozinha. `duplicate` e `invalid` saem separados porque dizem coisas
/// diferentes ao operador: repetição é desperdício, inválido é qualidade da fonte.
export function contarLote(linhas: readonly LinhaAvaliada[]): ContadoresLote {
  const porMotivo: Record<string, number> = {};
  let duplicate = 0;
  let invalid = 0;
  let valid = 0;
  let noName = 0;
  let foneLixo = 0;

  for (const linha of linhas) {
    if (linha.descarte) {
      porMotivo[linha.descarte] = (porMotivo[linha.descarte] ?? 0) + 1;
      if (linha.descarte === 'duplicado') duplicate += 1;
      else if (
        linha.descarte === 'telefone_invalido' ||
        linha.descarte === 'email_invalido'
      )
        invalid += 1;
      continue;
    }

    valid += 1;
    if (!linha.temNome) noName += 1; // decide o fallback da saudação
    if (linha.foneInvalido) foneLixo += 1; // entrou, mas o SDR não vai poder ligar
  }

  return { received: linhas.length, duplicate, invalid, valid, noName, foneLixo, porMotivo };
}
