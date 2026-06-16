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
