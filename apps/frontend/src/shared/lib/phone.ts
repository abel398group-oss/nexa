// Helpers de telefone (Brasil). A exibição esconde o DDI 55 — mostra só
// DDD + número. O valor ARMAZENADO/ENVIADO continua com 55 (o WhatsApp exige).

/**
 * Para exibição: "5511974869142" → "(11) 97486-9142".
 * Também trata o prefixo de e-mail ("email:addr@x.com" → "addr@x.com").
 */
export function displayPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  if (raw.startsWith('email:')) return raw.slice(6);
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2); // tira o código do país
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d || String(raw);
}

/**
 * Para entrada/armazenamento: normaliza pra o formato BR com DDI 55.
 * Aceita o usuário digitando só DDD + número (10/11 dígitos) e adiciona o 55.
 */
export function toBrPhone(input: string): string {
  const d = (input || '').replace(/\D/g, '');
  if (!d.startsWith('55') && (d.length === 10 || d.length === 11)) return `55${d}`;
  return d;
}

/**
 * Par do `toBrPhone` para EXIBIÇÃO em campo editável (2026-07-21, paridade com
 * a tela de Automação do TMS): valor salvo "5511999999999" → "11999999999"
 * (DDD + número, sem máscara — o "+55" vira adorno fixo do input).
 *
 * A dupla exibir-sem-55 / salvar-com-55 é OBRIGATÓRIA em par: exibir o valor
 * cru e recolocar o DDI no save duplicaria o 55 a cada edição (5555...).
 * Só remove o 55 quando há MAIS de 11 dígitos — um número local de 11 dígitos
 * que por coincidência começa com 55 (DDD 55 não existe no BR, mas defensivo)
 * nunca é mutilado.
 */
export function toLocalPhone(stored: string | null | undefined): string {
  const d = String(stored ?? '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length > 11) return d.slice(2);
  return d;
}
