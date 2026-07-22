/**
 * Parse de ALERT_ADMIN_PHONE — a env pode ter VÁRIOS números separados por
 * vírgula (ex.: "5511917747429,5511974869142"). Antes, código que fazia
 * `.replace(/\D/g,'')` na string inteira concatenava os dois num número
 * inválido de 26 dígitos e o envio falhava em silêncio (bug pré-2026-07-22).
 *
 * Retorna a lista de números só-dígitos, válidos (≥ 12 = DDI+DDD+número).
 */
export function parseAdminPhones(raw: string | undefined | null): string[] {
  return String(raw ?? '')
    .split(',')
    .map((p) => p.replace(/\D/g, ''))
    .filter((p) => p.length >= 12);
}
