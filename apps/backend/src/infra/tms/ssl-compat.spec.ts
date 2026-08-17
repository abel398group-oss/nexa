import { describe, expect, it } from 'vitest';
import { TmsLookupService } from './tms-lookup.service';

/**
 * O `pg` novo trata `sslmode=require` como `verify-full`, e o certificado do Postgres
 * gerenciado da DigitalOcean é autoassinado — a conexão morre com "self-signed
 * certificate in certificate chain", e `ssl: { rejectUnauthorized: false }` não salva
 * porque a URL é quem decide.
 *
 * Descoberto em produção em 17/08/2026, com o log mostrando "Pool TMS inicializado" e
 * nunca uma consulta: `new Pool` não conecta, só a primeira query conecta. O filtro de
 * cliente do disparo dependia disso, então campanha era recusada por falha de consulta —
 * sintoma longe da causa.
 */
describe('compatibilidade de SSL na URL do TMS', () => {
  const f = TmsLookupService.comCompatibilidadeSsl;

  it('acrescenta o parâmetro quando a URL declara sslmode', () => {
    expect(f('postgresql://u:p@host:25060/db?sslmode=require')).toBe(
      'postgresql://u:p@host:25060/db?sslmode=require&uselibpqcompat=true',
    );
  });

  it('não duplica quando já está lá', () => {
    const url = 'postgresql://u:p@host/db?sslmode=require&uselibpqcompat=true';
    expect(f(url)).toBe(url);
  });

  it('URL sem sslmode fica intocada — não inventa SSL onde não há', () => {
    const url = 'postgresql://u:p@localhost:15432/db';
    expect(f(url)).toBe(url);
  });

  it('usa ? quando não há query string, & quando há', () => {
    // sslmode pode chegar como primeiro parâmetro; o separador tem que acompanhar.
    expect(f('postgresql://u:p@h/db?sslmode=verify-ca')).toContain('?sslmode=verify-ca&uselibpqcompat=true');
    expect(f('postgresql://u:p@h/db?schema=public&sslmode=require')).toContain(
      '&sslmode=require&uselibpqcompat=true',
    );
  });
});
