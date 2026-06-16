// Sanitizacao de texto colado/digitado.
//
// Ao copiar de PDFs, planilhas, chats ou gerenciadores de senha, o texto
// costuma vir com caracteres INVISIVEIS (espaco de largura zero, BOM, marcas
// bidi, soft hyphen). O .trim() do JS NAO remove esses, entao validacoes como
// .email() reprovam um valor que "parece" correto.
//
// stripInvisible remove esses caracteres e normaliza espacos especiais
// (nbsp/narrow nbsp) para espaco comum. Aplicado no Input/Textarea canonicos,
// vale pra todo o app automaticamente.
//
// As regex sao montadas a partir dos codepoints (fonte 100% ASCII), pra evitar
// caracteres invisiveis no proprio codigo.

const u = (code: number): string => '\\u' + code.toString(16).padStart(4, '0');
const cls = (...parts: string[]): RegExp => new RegExp('[' + parts.join('') + ']', 'g');

// zero-width, soft hyphen, bidi marks, joiners, BOM
const INVISIBLE = cls(
  u(0x00ad),
  u(0x200b) + '-' + u(0x200f),
  u(0x202a) + '-' + u(0x202e),
  u(0x2060) + '-' + u(0x2064),
  u(0xfeff),
);
// controles C0/C1, mantendo TAB (09), LF (0A), CR (0D)
const CONTROL = cls(
  u(0x00) + '-' + u(0x08),
  u(0x0b) + u(0x0c),
  u(0x0e) + '-' + u(0x1f),
  u(0x7f),
  u(0x80) + '-' + u(0x9f),
);
// espacos "exoticos" -> espaco comum (o .trim() depois limpa as pontas)
const WEIRD_SPACE = cls(
  u(0x00a0),
  u(0x2000) + '-' + u(0x200a),
  u(0x202f),
  u(0x205f),
  u(0x3000),
);

/** Remove caracteres invisiveis/controle e normaliza espacos. Nao faz trim. */
export function stripInvisible(value: string): string {
  return value.replace(INVISIBLE, '').replace(CONTROL, '').replace(WEIRD_SPACE, ' ');
}

/** stripInvisible + trim — para usar em validacao/submit. */
export function cleanText(value: string): string {
  return stripInvisible(value).trim();
}
