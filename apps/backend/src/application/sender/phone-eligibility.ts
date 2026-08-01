/**
 * Elegibilidade de telefone para DISPARO no WhatsApp (2026-08-01).
 *
 * Nasceu da auditoria pré go-live: o CSV de 1.976 leads raspados de grupos
 * trazia 33 números estrangeiros (Filipinas, Indonésia, Paraguai, Moçambique,
 * Nigéria), 1 número de 14 dígitos e 27 telefones FIXOS. Três problemas:
 *
 *  1. `normalizePhone` prefixa "55" em quem não começa com 55 — um número das
 *     Filipinas ("639616524149") virava "55639616524149", inexistente. O envio
 *     falha e o contato entra sujo no banco.
 *  2. No aquecimento o número manda ~10/dia; 33 lixos queimam 3 dias de cota.
 *  3. Número BR novo enviando para o exterior é sinal clássico de conta
 *     comprometida — aumenta o risco de banimento do WhatsApp.
 *
 * Regra: só passa celular brasileiro. Fixo é recusado porque não tem WhatsApp.
 * Isto é DIFERENTE de `isValidBrazilPhone` (shared/utils/phone.util), que só
 * valida formato de armazenamento — aqui a pergunta é "dá pra mandar zap?".
 */

/** DDDs válidos no Brasil (Anatel). Fora desta lista = número inventado. */
const DDD_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export type PhoneRejection =
  | 'nao_brasileiro'
  | 'tamanho_invalido'
  | 'ddd_invalido'
  | 'telefone_fixo';

/**
 * Retorna o motivo da recusa, ou null se o número pode receber disparo.
 * Recebe o telefone já em dígitos (como vem do CSV/painel).
 */
export function rejectionReason(rawPhone: string | undefined | null): PhoneRejection | null {
  const p = String(rawPhone ?? '').replace(/\D/g, '');

  // DDI: precisa ser brasileiro. NÃO prefixar 55 aqui — um número estrangeiro
  // de 12 dígitos ficaria indistinguível de um BR válido.
  if (!p.startsWith('55')) return 'nao_brasileiro';

  // 55 + DDD(2) + linha(8 ou 9)
  if (p.length !== 12 && p.length !== 13) return 'tamanho_invalido';

  const ddd = Number(p.slice(2, 4));
  if (!DDD_VALIDOS.has(ddd)) return 'ddd_invalido';

  const linha = p.slice(4);
  const primeiro = linha[0];

  // 13 dígitos = celular com o 9º dígito: obrigatoriamente começa com 9.
  if (p.length === 13) return primeiro === '9' ? null : 'tamanho_invalido';

  // 12 dígitos: celular no formato antigo (6-9) ou FIXO (2-5).
  // Fixo não tem WhatsApp — recusado. Celular antigo passa: em muitos grupos
  // é justamente esse o ID real do WhatsApp do contato.
  return ['6', '7', '8', '9'].includes(primeiro) ? null : 'telefone_fixo';
}

/** Açúcar: true se o número pode receber disparo. */
export function canReceiveCampaign(rawPhone: string | undefined | null): boolean {
  return rejectionReason(rawPhone) === null;
}
