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
const CABECALHOS: Record<string, readonly string[]> = {
  name: ['nome', 'name', 'contato', 'responsavel'],
  company: ['empresa', 'company', 'razao social', 'razao', 'transportadora'],
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
    .replace(/^﻿/, '') // BOM do Excel
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // acento: "razão" → "razao"

  for (const [campo, variacoes] of Object.entries(CABECALHOS)) {
    if (variacoes.includes(limpo)) return campo;
  }
  return null;
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

export function parseCsvDeLeads(conteudo: string): ResultadoCsv {
  const texto = conteudo.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
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
    mapa.forEach((campo, idx) => {
      if (!campo) return;
      const valor = (celulas[idx] ?? '').trim();
      campos[campo] = valor.length > 0 ? valor : null;
    });

    const foneNormalizado = campos.phone ? normalizePhone(campos.phone) : '';
    const emailNormalizado = campos.email ? normalizeEmail(campos.email) : '';

    const linha: LinhaCsv = {
      linha: i + 1, // +1: o operador conta o cabeçalho como linha 1
      name: campos.name ?? null,
      company: campos.company ?? null,
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
