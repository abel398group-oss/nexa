import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Trava contra o defeito de 16/08/2026: filtro morto que parece lista vazia.
 *
 * O `ValidationPipe` global roda com `forbidNonWhitelisted: true` (ver main.ts), e
 * quem valida é a classe ligada ao `@Query()` SEM NOME — ela recebe o objeto de
 * query inteiro. Declarar `@Query('tag')` como parâmetro do método não registra o
 * campo no validador. Resultado: a requisição toda volta 400, e as telas desenham
 * "Nenhum contato ainda" / "nenhuma atividade" em vez de erro.
 *
 * Foi assim que `tag`, `owner` e `status` em Contatos, `category` na Base de
 * Conhecimento, `stage` em Oportunidades e `opportunityId` em atividades ficaram
 * quebrados sem ninguém notar — a resposta errada tinha cara de resposta certa.
 *
 * Este teste lê os controllers como TEXTO de propósito. Instanciar o Nest para
 * descobrir isso exigiria subir a aplicação inteira; o defeito é sintático e a
 * checagem sintática paga o aluguel.
 */

const RAIZ = join(__dirname, '..', '..');

function varrer(dir: string, filtro: (p: string) => boolean, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) varrer(p, filtro, out);
    else if (filtro(p)) out.push(p);
  }
  return out;
}

/** nome da classe -> { campos declarados, classe pai } */
function catalogoDeClasses(): Map<string, { campos: Set<string>; pai: string | null }> {
  const classes = new Map<string, { campos: Set<string>; pai: string | null }>();
  for (const f of varrer(RAIZ, (p) => p.endsWith('.ts') && !p.endsWith('.spec.ts'))) {
    const src = readFileSync(f, 'utf8');
    const re = /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      // Corpo por contagem de chaves — regex não fecha bloco sozinha.
      let i = re.lastIndex - 1;
      let nivel = 0;
      let fim = i;
      for (; i < src.length; i++) {
        if (src[i] === '{') nivel++;
        else if (src[i] === '}' && --nivel === 0) {
          fim = i;
          break;
        }
      }
      const corpo = src.slice(re.lastIndex, fim);
      const campos = new Set(
        [...corpo.matchAll(/^\s*(?:readonly\s+)?(\w+)\s*[?!]?\s*:/gm)].map((c) => c[1]),
      );
      classes.set(m[1], { campos, pai: m[2] ?? null });
    }
  }
  return classes;
}

function camposDe(
  nome: string | null,
  classes: Map<string, { campos: Set<string>; pai: string | null }>,
  vistos = new Set<string>(),
): Set<string> | null {
  if (!nome || vistos.has(nome)) return null;
  vistos.add(nome);
  const c = classes.get(nome);
  if (!c) return null;
  const todos = new Set(c.campos);
  const herdados = camposDe(c.pai, classes, vistos);
  if (herdados) for (const x of herdados) todos.add(x);
  return todos;
}

describe('whitelist da query nos controllers', () => {
  it('nenhum @Query("campo") fora do DTO ligado ao @Query()', () => {
    const classes = catalogoDeClasses();
    const problemas: string[] = [];

    for (const f of varrer(RAIZ, (p) => p.endsWith('.controller.ts'))) {
      const src = readFileSync(f, 'utf8');
      const re = /@(?:Get|Post|Put|Patch|Delete)\(/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const abre = src.indexOf('{', re.lastIndex);
        if (abre < 0) continue;
        const assinatura = src.slice(m.index, abre);
        if (!assinatura.includes('@Query(')) continue;

        const semNome = assinatura.match(/@Query\(\s*\)\s*\w+\s*:\s*(\w+)/);
        if (!semNome) continue; // sem DTO no @Query() não há whitelist a violar
        const nomeados = [...assinatura.matchAll(/@Query\(\s*['"`](\w+)['"`]\s*\)/g)].map(
          (x) => x[1],
        );
        if (!nomeados.length) continue;

        const campos = camposDe(semNome[1], classes);
        const fora = campos ? nomeados.filter((n) => !campos.has(n)) : nomeados;
        if (!fora.length) continue;

        const linha = src.slice(0, m.index).split('\n').length;
        problemas.push(
          `${f.split(/[\\/]/).slice(-2).join('/')}:${linha} — ${semNome[1]} não declara: ${fora.join(', ')}`,
        );
      }
    }

    expect(
      problemas,
      `Estes filtros voltam 400 e a tela mostra lista vazia. Declare o campo no DTO ` +
        `do @Query() (com @IsOptional), em vez de só receber via @Query('campo'):\n` +
        problemas.join('\n'),
    ).toEqual([]);
  });
});
