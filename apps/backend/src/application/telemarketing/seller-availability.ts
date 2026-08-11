// "Ausente" — férias, atestado, afastamento (módulo 1).
//
// Vive fora dos services porque é usado em dois lugares que decidem coisas diferentes
// (distribuir lote e listar closers) e precisam concordar. Duas cópias do mesmo `where`
// divergem no primeiro ajuste, e a divergência aqui é silenciosa: o vendedor de férias
// some de uma tela e continua na outra.

/// Pedaço de `where` do Prisma que exclui quem está ausente.
///
/// `awayUntil` no passado NÃO é ausência: a data é o fim do afastamento, então quem
/// voltou ontem volta a receber hoje sem ninguém precisar desmarcar. É a razão de ser
/// data em vez de booleano.
export function naoAusente(agora = new Date()): Record<string, unknown> {
  return {
    OR: [{ awayUntil: null }, { awayUntil: { lte: agora } }],
  };
}

/// Está ausente agora? Mesma regra, para exibição — a tela precisa poder dizer "Ausente
/// até 20/08" em vez de simplesmente sumir com a pessoa da lista.
export function estaAusente(awayUntil: Date | null | undefined, agora = new Date()): boolean {
  if (!awayUntil) return false;
  return awayUntil.getTime() > agora.getTime();
}
