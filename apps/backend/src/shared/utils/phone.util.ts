/**
 * Utilitários de normalização de telefone — fonte única da verdade no Nexa.
 *
 * Formato canônico do Nexa: dígitos com DDI 55, sem formatação.
 *   Exemplos válidos: "5511999887766" (12 dígitos), "55119988776655" → inválido
 *
 * Formatos de entrada suportados:
 *   "5511999887766"          → "5511999887766"  (já correto)
 *   "11999887766"            → "5511999887766"  (sem DDI → adiciona 55)
 *   "+55 (11) 9988-7766"     → "5511999887766"  (formatado → limpa)
 *   "5511999887766@c.us"     → "5511999887766"  (WAHA chatId → strip @)
 *   "5511999887766:5@c.us"   → "5511999887766"  (WAHA com device suffix → strip)
 *
 * TmsLookupService.normalize() mantém sua própria lógica (strip 55 p/ comparação com TMS).
 * Este utilitário é EXCLUSIVO para armazenamento e comparação dentro do Nexa.
 */

/** Retorna o telefone no formato canônico do Nexa ("55XXXXXXXXXXX"). */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';
  // remove sufixo WAHA: "5511999887766@c.us" ou "5511999887766:5@c.us"
  const stripped = String(raw).split('@')[0].split(':')[0];
  // mantém apenas dígitos
  const digits = stripped.replace(/\D/g, '');
  if (!digits) return '';
  // adiciona DDI 55 se ausente
  if (!digits.startsWith('55')) return `55${digits}`;
  return digits;
}

/** Retorna true se o telefone normalizado é um número brasileiro válido (12–13 dígitos). */
export function isValidBrazilPhone(phone: string): boolean {
  const n = normalizePhone(phone);
  return n.startsWith('55') && n.length >= 12 && n.length <= 13;
}
