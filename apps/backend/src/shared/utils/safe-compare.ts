import { timingSafeEqual } from 'node:crypto';

/**
 * Comparação de strings em tempo constante (B1 — auditoria 2026-07-08).
 *
 * Usa crypto.timingSafeEqual para não vazar, pelo tempo de resposta, quantos
 * caracteres de um segredo/token o atacante acertou. `===`/`!==` faz short-circuit
 * no primeiro byte diferente e é vulnerável a timing attack em segredos.
 *
 * Retorna false com segurança quando algum valor é ausente ou de tamanho diferente
 * (timingSafeEqual exige buffers de mesmo comprimento).
 */
export function safeEqual(a: string | undefined | null, b: string | undefined | null): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
